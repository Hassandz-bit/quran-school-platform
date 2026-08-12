\set ON_ERROR_STOP on

-- The previous reconciliation assertions leave business sources reversed and the
-- branch cash account at its opening balance. Create a fresh branch payment, then
-- have a school-wide finance manager link it to the central bank account.
reset role;
insert into public.student_charges (
  id, school_id, branch_id, student_id, charge_type, description,
  original_amount, discount_amount, due_date, status, created_by
) values (
  '77000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'fee', 'Central-account scope reconciliation charge', 125, 0,
  '2026-08-21', 'pending', '60000000-0000-4000-8000-000000000001'
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
  '77000000-0000-4000-8000-000000000002',
  125, 'cash', '2026-08-16', 'CENTRAL-LINK-001'
) returning id as central_link_payment_id \gset
select set_config('test.central_link_payment_id', :'central_link_payment_id', false);

-- School admin links the branch source to BANK_MAIN through the same account-list
-- RPC available to finance UI. Branch finance must not gain bank details, but must
-- still see the source as reconciled rather than unmatched.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.link_treasury_business_source(
  '10000000-0000-4000-8000-000000000001',
  'student_payment',
  :'central_link_payment_id',
  (select id from public.list_treasury_link_accounts(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ) where code = 'BANK_MAIN')
) as linked_ok \gset
select set_config('test.central_linked_ok', :'linked_ok', false);

do $$
begin
  if current_setting('test.central_linked_ok') <> 't' then
    raise exception 'school admin could not link branch source to central account';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.get_treasury_reconciliation(
  '10000000-0000-4000-8000-000000000001', 50
) as branch_reconciliation \gset
select set_config('test.branch_reconciliation', :'branch_reconciliation', false);

do $$
declare p jsonb := current_setting('test.branch_reconciliation')::jsonb;
begin
  if (p -> 'business' ->> 'student_payments')::numeric <> 125 then
    raise exception 'branch business total mismatch: %', p;
  end if;
  if (p -> 'linked' ->> 'student_payments')::numeric <> 125
    or (p -> 'unmatched' ->> 'inflows')::numeric <> 0
    or (p -> 'unmatched' ->> 'count')::integer <> 0 then
    raise exception 'hidden central account created a false reconciliation gap: %', p;
  end if;
  if jsonb_array_length(p -> 'accounts') <> 1
    or p -> 'accounts' -> 0 ->> 'code' <> 'CASH_A1' then
    raise exception 'central account details leaked into branch reconciliation: %', p -> 'accounts';
  end if;
end;
$$;

-- Reverse the source through the authoritative payment status and ensure the
-- branch reconciliation returns to zero without ever exposing BANK_MAIN.
update public.payments
set status = 'reversed'
where school_id = '10000000-0000-4000-8000-000000000001'
  and id = current_setting('test.central_link_payment_id')::uuid;

select public.get_treasury_reconciliation(
  '10000000-0000-4000-8000-000000000001', 50
) as branch_after_reverse \gset
select set_config('test.branch_after_reverse', :'branch_after_reverse', false);

do $$
declare p jsonb := current_setting('test.branch_after_reverse')::jsonb;
begin
  if (p -> 'business' ->> 'total_inflows')::numeric <> 0
    or (p -> 'linked' ->> 'total_inflows')::numeric <> 0
    or (p -> 'unmatched' ->> 'count')::integer <> 0 then
    raise exception 'central-linked reversal remained in branch reconciliation: %', p;
  end if;
end;
$$;

select 'treasury_hidden_central_scope_runtime_passed' as result;
