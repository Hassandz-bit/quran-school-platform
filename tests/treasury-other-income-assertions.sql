\set ON_ERROR_STOP on

-- Branch Finance A can open an empty treasury before the first account exists.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.get_treasury_bootstrap('10000000-0000-4000-8000-000000000001') as empty_bootstrap \gset
select set_config('test.empty_bootstrap', :'empty_bootstrap', false);
do $$
declare p jsonb := current_setting('test.empty_bootstrap')::jsonb;
begin
  if jsonb_array_length(p -> 'accounts') <> 0 then raise exception 'treasury was not empty'; end if;
  if jsonb_array_length(p -> 'branches') <> 1 then raise exception 'branch finance should see exactly A1: %', p; end if;
  if (p -> 'branches' -> 0 ->> 'id')::uuid <> '20000000-0000-4000-8000-000000000001' then raise exception 'wrong bootstrap branch'; end if;
end;
$$;

select public.create_treasury_account(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'cash', 'صندوق A1', 'CASH_A1', null, 1000, '2026-08-01'
) as cash_account_id \gset
select set_config('test.cash_account_id', :'cash_account_id', false);

do $$
begin
  begin
    perform public.create_treasury_account(
      '10000000-0000-4000-8000-000000000001', null,
      'bank', 'Blocked school bank', 'BLOCKED_BANK', null, 0, '2026-08-01'
    );
    raise exception 'branch finance created school account';
  exception when insufficient_privilege then
    if sqlerrm <> 'TREASURY_MANAGE_REQUIRED' then raise; end if;
  end;
end;
$$;

-- School admin creates a school-wide bank account.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.create_treasury_account(
  '10000000-0000-4000-8000-000000000001', null,
  'bank', 'الحساب البنكي المركزي', 'BANK_MAIN', 'RIB-TEST-001', 5000, '2026-08-01'
) as bank_account_id \gset
select set_config('test.bank_account_id', :'bank_account_id', false);

-- Branch Finance A cannot see/use the school-wide account for linking.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
do $$
declare cnt integer;
begin
  select count(*) into cnt
  from public.list_treasury_link_accounts(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  );
  if cnt <> 1 then raise exception 'branch finance should have one link account, got %', cnt; end if;
end;
$$;

-- Student payment: +300 to branch cash.
insert into public.payments (
  school_id, branch_id, student_id, charge_id, amount, payment_method,
  payment_date, reference_number, treasury_account_id
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  300, 'cash', '2026-08-05', 'PAY-TREASURY-001', :'cash_account_id'
) returning id as payment_id \gset
select set_config('test.payment_id', :'payment_id', false);

-- Operating expense: -100 from branch cash.
insert into public.expenses (
  school_id, branch_id, category, description, amount, expense_date,
  payment_method, reference_number, treasury_account_id
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'supplies', 'Treasury runtime supplies', 100, '2026-08-06',
  'cash', 'EXP-TREASURY-001', :'cash_account_id'
) returning id as expense_id \gset
select set_config('test.expense_id', :'expense_id', false);

-- Non-student income: +200 to branch cash.
select public.create_other_income(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  :'cash_account_id', 'donation', 'تبرع اختبار الخزينة', 200,
  '2026-08-07', 'cash', 'INC-TREASURY-001', 'Runtime donation'
) as other_income_id \gset
select set_config('test.other_income_id', :'other_income_id', false);

-- Payroll: -1000 from branch cash.
select public.create_payroll_compensation(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'teacher', '75000000-0000-4000-8000-000000000001', null,
  1000, '2026-08-01', null, 'Treasury runtime salary'
) as comp_id \gset
select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-01', null
) as payroll_period_id \gset
select public.approve_payroll_period(
  '10000000-0000-4000-8000-000000000001', :'payroll_period_id'
);

reset role;
select id as payroll_entry_id
from public.payroll_entries
where period_id = :'payroll_period_id'::uuid
  and teacher_id = '75000000-0000-4000-8000-000000000001'
limit 1 \gset
select set_config('test.payroll_entry_id', :'payroll_entry_id', false);
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.record_payroll_payment_with_treasury(
  '10000000-0000-4000-8000-000000000001', :'payroll_entry_id',
  '2026-08-08', 'cash', 'SAL-TREASURY-001', null, :'cash_account_id'
) as payroll_payment_id \gset
select set_config('test.payroll_payment_id', :'payroll_payment_id', false);

-- Business ledger and treasury mirror must reconcile without double counting.
reset role;
do $$
declare
  cash_id uuid := current_setting('test.cash_account_id')::uuid;
  balance numeric;
  business_in numeric;
  business_out numeric;
  source_count integer;
begin
  select public.treasury_account_balance_internal('10000000-0000-4000-8000-000000000001', cash_id) into balance;
  if balance <> 400 then raise exception 'expected cash balance 400 before internal transfers, got %', balance; end if;

  select
    coalesce(sum(case when direction = 'in' then amount else 0 end), 0),
    coalesce(sum(case when direction = 'out' then amount else 0 end), 0),
    count(*)
  into business_in, business_out, source_count
  from public.treasury_movements
  where account_id = cash_id and status = 'posted'
    and movement_type in ('student_payment', 'other_income', 'expense', 'payroll_payment');
  if business_in <> 500 or business_out <> 1100 or source_count <> 4 then
    raise exception 'business treasury reconciliation mismatch in=% out=% count=%', business_in, business_out, source_count;
  end if;

  if (select count(*) from public.treasury_movements where account_id = cash_id and movement_type = 'opening_balance' and status = 'posted') <> 1 then
    raise exception 'opening balance is not a single immutable movement';
  end if;
end;
$$;

-- Admin sees both accounts and performs a balanced bank -> cash transfer.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.record_treasury_transfer(
  '10000000-0000-4000-8000-000000000001',
  :'bank_account_id', :'cash_account_id', 150, '2026-08-09', 'TRF-001', 'Runtime transfer'
) as transfer_id \gset
select set_config('test.transfer_id', :'transfer_id', false);

select public.record_treasury_adjustment(
  '10000000-0000-4000-8000-000000000001',
  :'cash_account_id', 'manual_deposit', 50, '2026-08-09', 'ADJ-001', 'تسوية صندوق اختبارية'
) as adjustment_id \gset
select set_config('test.adjustment_id', :'adjustment_id', false);

reset role;
do $$
declare cash_id uuid := current_setting('test.cash_account_id')::uuid; bank_id uuid := current_setting('test.bank_account_id')::uuid;
begin
  if public.treasury_account_balance_internal('10000000-0000-4000-8000-000000000001', cash_id) <> 600 then raise exception 'cash transfer/adjustment balance mismatch'; end if;
  if public.treasury_account_balance_internal('10000000-0000-4000-8000-000000000001', bank_id) <> 4850 then raise exception 'bank transfer balance mismatch'; end if;
  if (select count(*) from public.treasury_movements where transfer_id = current_setting('test.transfer_id')::uuid and status = 'posted') <> 2 then raise exception 'transfer is not balanced by two posted movements'; end if;
end;
$$;

-- Reverse adjustment and transfer; both histories stay retained.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.reverse_treasury_adjustment('10000000-0000-4000-8000-000000000001', :'adjustment_id', 'إلغاء تسوية اختبارية');
select public.reverse_treasury_transfer('10000000-0000-4000-8000-000000000001', :'transfer_id', 'إلغاء تحويل اختباري');

-- Reverse every business transaction through its authoritative source.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.reverse_other_income('10000000-0000-4000-8000-000000000001', :'other_income_id', 'إلغاء التبرع الاختباري');
update public.payments
set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(), reversal_reason = 'إلغاء دفعة اختبارية'
where id = :'payment_id' and school_id = '10000000-0000-4000-8000-000000000001';
update public.expenses
set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
where id = :'expense_id' and school_id = '10000000-0000-4000-8000-000000000001';
select public.reverse_payroll_payment(
  '10000000-0000-4000-8000-000000000001', :'payroll_payment_id', 'إلغاء راتب اختباري'
);

-- Final balances return exactly to opening balances; no movement was deleted.
reset role;
do $$
declare
  cash_id uuid := current_setting('test.cash_account_id')::uuid;
  bank_id uuid := current_setting('test.bank_account_id')::uuid;
  reversed_business integer;
  reversed_transfer integer;
  income_status text;
begin
  if public.treasury_account_balance_internal('10000000-0000-4000-8000-000000000001', cash_id) <> 1000 then raise exception 'cash did not return to opening balance'; end if;
  if public.treasury_account_balance_internal('10000000-0000-4000-8000-000000000001', bank_id) <> 5000 then raise exception 'bank did not return to opening balance'; end if;

  select count(*) into reversed_business
  from public.treasury_movements
  where source_type in ('student_payment', 'other_income', 'expense', 'payroll_payment') and status = 'reversed';
  if reversed_business <> 4 then raise exception 'expected four retained reversed business movements, got %', reversed_business; end if;

  select count(*) into reversed_transfer
  from public.treasury_movements
  where transfer_id = current_setting('test.transfer_id')::uuid and status = 'reversed';
  if reversed_transfer <> 2 then raise exception 'expected two retained reversed transfer movements'; end if;

  select status into income_status from public.other_income where id = current_setting('test.other_income_id')::uuid;
  if income_status <> 'reversed' then raise exception 'other income history was not retained'; end if;

  if (select count(*) from public.treasury_movements) < 9 then raise exception 'treasury history unexpectedly lost movements'; end if;
end;
$$;

-- Branch finance never gains school-bank visibility merely because the account exists.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.get_treasury_bootstrap('10000000-0000-4000-8000-000000000001') as branch_bootstrap \gset
select set_config('test.branch_bootstrap', :'branch_bootstrap', false);
do $$
declare p jsonb := current_setting('test.branch_bootstrap')::jsonb;
begin
  if jsonb_array_length(p -> 'accounts') <> 1 then raise exception 'branch finance saw school account: %', p; end if;
  if (p -> 'accounts' -> 0 ->> 'id')::uuid <> current_setting('test.cash_account_id')::uuid then raise exception 'branch finance saw wrong account'; end if;
end;
$$;

-- Raw treasury ledgers remain closed to browser roles.
do $$
begin
  begin perform * from public.treasury_movements limit 1; raise exception 'raw movement read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin perform * from public.other_income limit 1; raise exception 'raw other income read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;

select 'treasury_other_income_runtime_passed' as result;
