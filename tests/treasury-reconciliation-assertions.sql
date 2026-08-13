\set ON_ERROR_STOP on

-- Previous treasury assertions leave all business sources reversed and balances
-- back at their opening values. Create one new completed student payment without
-- an account to prove the reconciliation gap and explicit source linking.
reset role;
insert into public.student_charges (
  id, school_id, branch_id, student_id, charge_type, description,
  original_amount, discount_amount, due_date, status, created_by
) values (
  '77000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'fee', 'Unlinked reconciliation charge', 500, 0, '2026-08-20', 'pending',
  '60000000-0000-4000-8000-000000000001'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
insert into public.payments (
  school_id, branch_id, student_id, charge_id, amount, payment_method,
  payment_date, reference_number
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  250, 'cash', '2026-08-15', 'UNLINKED-001'
) returning id as reconciliation_payment_id \gset
select set_config('test.reconciliation_payment_id', :'reconciliation_payment_id', false);

select public.get_treasury_reconciliation(
  '10000000-0000-4000-8000-000000000001', 50
) as before_link \gset
select set_config('test.before_link', :'before_link', false);

do $$
declare p jsonb := current_setting('test.before_link')::jsonb;
begin
  if (p -> 'business' ->> 'student_payments')::numeric <> 250 then
    raise exception 'business payment total should be 250: %', p;
  end if;
  if (p -> 'linked' ->> 'student_payments')::numeric <> 0 then
    raise exception 'unlinked payment appeared in treasury evidence: %', p;
  end if;
  if (p -> 'unmatched' ->> 'inflows')::numeric <> 250
    or (p -> 'unmatched' ->> 'count')::integer <> 1 then
    raise exception 'expected one unmatched 250 inflow: %', p;
  end if;
  if jsonb_array_length(p -> 'unlinked_sources') <> 1 then
    raise exception 'expected exactly one unlinked source: %', p;
  end if;
end;
$$;

select public.link_treasury_business_source(
  '10000000-0000-4000-8000-000000000001',
  'student_payment',
  :'reconciliation_payment_id',
  (select id from public.list_treasury_link_accounts(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ) where code = 'CASH_A1')
);

select public.get_treasury_reconciliation(
  '10000000-0000-4000-8000-000000000001', 50
) as after_link \gset
select set_config('test.after_link', :'after_link', false);

do $$
declare p jsonb := current_setting('test.after_link')::jsonb;
begin
  if (p -> 'linked' ->> 'student_payments')::numeric <> 250 then
    raise exception 'linked treasury payment total should be 250: %', p;
  end if;
  if (p -> 'unmatched' ->> 'inflows')::numeric <> 0
    or (p -> 'unmatched' ->> 'count')::integer <> 0 then
    raise exception 'reconciliation gap did not close: %', p;
  end if;
  if jsonb_array_length(p -> 'unlinked_sources') <> 0 then
    raise exception 'linked source remained in unlinked list: %', p;
  end if;
end;
$$;

reset role;
do $$
declare
  cash_id uuid;
  balance numeric;
  movement_count integer;
begin
  select id into cash_id from public.treasury_accounts
  where school_id = '10000000-0000-4000-8000-000000000001' and code = 'CASH_A1';
  select public.treasury_account_balance_internal(
    '10000000-0000-4000-8000-000000000001', cash_id
  ) into balance;
  if balance <> 1250 then raise exception 'linked payment did not increase cash to 1250, got %', balance; end if;
  select count(*) into movement_count
  from public.treasury_movements
  where source_type = 'student_payment'
    and source_id = current_setting('test.reconciliation_payment_id')::uuid
    and status = 'posted';
  if movement_count <> 1 then raise exception 'expected exactly one posted linked payment movement'; end if;
end;
$$;

-- Reversing the authoritative payment must automatically reverse the treasury evidence.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
update public.payments
set status = 'reversed'
where school_id = '10000000-0000-4000-8000-000000000001'
  and id = current_setting('test.reconciliation_payment_id')::uuid;

select public.get_treasury_reconciliation(
  '10000000-0000-4000-8000-000000000001', 50
) as after_reverse \gset
select set_config('test.after_reverse', :'after_reverse', false);

do $$
declare p jsonb := current_setting('test.after_reverse')::jsonb;
begin
  if (p -> 'business' ->> 'total_inflows')::numeric <> 0
    or (p -> 'linked' ->> 'total_inflows')::numeric <> 0
    or (p -> 'unmatched' ->> 'count')::integer <> 0 then
    raise exception 'reversed source remained in reconciliation totals: %', p;
  end if;
end;
$$;

reset role;
do $$
declare cash_id uuid; balance numeric; movement_status text;
begin
  select id into cash_id from public.treasury_accounts
  where school_id = '10000000-0000-4000-8000-000000000001' and code = 'CASH_A1';
  select public.treasury_account_balance_internal(
    '10000000-0000-4000-8000-000000000001', cash_id
  ) into balance;
  if balance <> 1000 then raise exception 'cash did not return to opening 1000 after payment reversal, got %', balance; end if;
  select status into movement_status
  from public.treasury_movements
  where source_type = 'student_payment'
    and source_id = current_setting('test.reconciliation_payment_id')::uuid
  order by created_at desc limit 1;
  if movement_status <> 'reversed' then raise exception 'linked movement was not retained as reversed'; end if;
end;
$$;

select 'treasury_reconciliation_runtime_passed' as result;
