\set ON_ERROR_STOP on

-- The browser roles must never receive direct table access.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);

do $$
begin
  begin
    perform 1 from public.official_receipts limit 1;
    raise exception 'authenticated unexpectedly read official_receipts directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.official_receipt_counters limit 1;
    raise exception 'authenticated unexpectedly read official_receipt_counters directly';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Finance manager issues the payment receipt. Repeating the operation must
-- return the same immutable ledger row and must not consume a new sequence.
select public.issue_payment_receipt('72000000-0000-4000-8000-000000000001') as payment_receipt_id \gset
select public.issue_payment_receipt('72000000-0000-4000-8000-000000000001') as payment_receipt_id_again \gset

reset role;

do $$
declare
  first_id uuid := :'payment_receipt_id';
  second_id uuid := :'payment_receipt_id_again';
  row_count integer;
  receipt_row record;
begin
  if first_id is null or first_id <> second_id then
    raise exception 'payment receipt issuance is not idempotent';
  end if;

  select count(*) into row_count
  from public.official_receipts
  where payment_id = '72000000-0000-4000-8000-000000000001';
  if row_count <> 1 then
    raise exception 'expected exactly one payment receipt, got %', row_count;
  end if;

  select * into receipt_row
  from public.official_receipts
  where id = first_id;

  if receipt_row.sequence_number <> 1
     or receipt_row.receipt_number <> 'QOS-00000001'
     or receipt_row.receipt_type <> 'payment'
     or receipt_row.receipt_status <> 'issued'
     or receipt_row.amount <> 1200.00
     or receipt_row.payment_reference <> 'PAY-TEST-001'
     or receipt_row.issuer_name <> 'Finance A' then
    raise exception 'payment receipt snapshot is incorrect: %', row_to_json(receipt_row);
  end if;
end;
$$;

-- Registrar issues a non-financial registration receipt. It must receive the
-- next school-wide number and repeated issuance must return the same row.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
select public.issue_registration_receipt('50000000-0000-4000-8000-000000000001') as registration_receipt_id \gset
select public.issue_registration_receipt('50000000-0000-4000-8000-000000000001') as registration_receipt_id_again \gset
reset role;

do $$
declare
  first_id uuid := :'registration_receipt_id';
  second_id uuid := :'registration_receipt_id_again';
  receipt_row record;
begin
  if first_id is null or first_id <> second_id then
    raise exception 'registration receipt issuance is not idempotent';
  end if;

  select * into receipt_row
  from public.official_receipts
  where id = first_id;

  if receipt_row.sequence_number <> 2
     or receipt_row.receipt_number <> 'QOS-00000002'
     or receipt_row.receipt_type <> 'registration'
     or receipt_row.amount is not null
     or receipt_row.payment_id is not null
     or receipt_row.enrollment_start_date is null
     or receipt_row.issuer_name <> 'Registrar A' then
    raise exception 'registration receipt snapshot is incorrect: %', row_to_json(receipt_row);
  end if;

  if (select last_sequence from public.official_receipt_counters
      where school_id = '10000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'reprints consumed additional official sequence numbers';
  end if;
end;
$$;

-- A teacher cannot issue a financial receipt even when the payment exists.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', false);
do $$
begin
  begin
    perform public.issue_payment_receipt('72000000-0000-4000-8000-000000000001');
    -- Existing receipts are intentionally readable only through the read RPC;
    -- issuance authorization must still fail closed before returning an ID.
    raise exception 'teacher unexpectedly issued payment receipt';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Mark another real student as an active Demo record. Official issuance must
-- refuse it and, critically, must not advance the school's receipt counter.
insert into public.demo_seed_batches (
  id, school_id, created_by, status
) values (
  '73000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'active'
);
insert into public.demo_seed_records (
  batch_id, school_id, entity_type, record_id
) values (
  '73000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'student',
  '50000000-0000-4000-8000-000000000002'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
begin
  begin
    perform public.issue_registration_receipt('50000000-0000-4000-8000-000000000002');
    raise exception 'active Demo student unexpectedly consumed an official receipt number';
  exception
    when raise_exception then
      if sqlerrm <> 'official_receipt_demo_record' then
        raise;
      end if;
  end;
end;
$$;
reset role;

if (select last_sequence from public.official_receipt_counters
    where school_id = '10000000-0000-4000-8000-000000000001') <> 2 then
  \echo 'Demo issuance changed the official sequence unexpectedly'
  \quit 1
endif

-- Reversing the payment must preserve the original receipt row/number and mark
-- it reversed for audit rather than deleting or replacing it.
update public.payments
set status = 'reversed'
where id = '72000000-0000-4000-8000-000000000001';

do $$
declare
  receipt_row record;
begin
  select * into receipt_row
  from public.official_receipts
  where payment_id = '72000000-0000-4000-8000-000000000001';

  if receipt_row.receipt_number <> 'QOS-00000001'
     or receipt_row.receipt_status <> 'reversed'
     or receipt_row.reversed_at is null then
    raise exception 'payment reversal did not preserve and mark the receipt';
  end if;
end;
$$;

-- Authorized read RPC still exposes the reversed historical receipt to finance.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
do $$
declare
  result_count integer;
begin
  select count(*) into result_count
  from public.get_official_receipt(:'payment_receipt_id'::uuid);
  if result_count <> 1 then
    raise exception 'finance could not read its authorized receipt';
  end if;
end;
$$;
reset role;

-- No delete path is exposed to authenticated users.
do $$
begin
  if has_table_privilege('authenticated', 'public.official_receipts', 'DELETE') then
    raise exception 'authenticated unexpectedly has DELETE on official_receipts';
  end if;
  if has_table_privilege('authenticated', 'public.official_receipt_counters', 'DELETE') then
    raise exception 'authenticated unexpectedly has DELETE on receipt counters';
  end if;
end;
$$;
