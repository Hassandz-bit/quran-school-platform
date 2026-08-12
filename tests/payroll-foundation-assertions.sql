\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);

select public.create_payroll_compensation(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'teacher',
  '50000000-0000-4000-8000-000000000001',
  null,
  1000,
  '2026-08-01',
  null,
  'Branch teacher salary'
) as teacher_comp_id \gset

select public.create_payroll_compensation(
  '10000000-0000-4000-8000-000000000001',
  null,
  'member',
  null,
  '31000000-0000-4000-8000-000000000004',
  1500,
  '2026-08-01',
  null,
  'School-wide staff salary'
) as member_comp_id \gset

select public.create_payroll_compensation(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003',
  'teacher',
  '50000000-0000-4000-8000-000000000006',
  null,
  1100,
  '2026-08-01',
  null,
  'Other branch teacher salary'
) as branch_three_comp_id \gset

do $$
begin
  begin
    perform public.create_payroll_compensation(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'teacher',
      '50000000-0000-4000-8000-000000000001',
      null,
      1200,
      '2026-08-15',
      null,
      null
    );
    raise exception 'expected overlapping compensation rejection';
  exception when check_violation then
    if sqlerrm <> 'PAYROLL_COMPENSATION_PERIOD_OVERLAP' then raise; end if;
  end;

  begin
    perform public.create_payroll_compensation(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'member',
      null,
      '31000000-0000-4000-8000-000000000001',
      900,
      '2026-08-01',
      null,
      null
    );
    raise exception 'expected teacher/member duplicate identity rejection';
  exception when check_violation then
    if sqlerrm <> 'PAYROLL_LINKED_TEACHER_USE_TEACHER_PAYEE' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000006', false);
select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-01',
  null
) as branch_period_id \gset
select set_config('test.branch_period_id', :'branch_period_id', false);

select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-01',
  null
) as branch_period_retry \gset

-- Raw payroll tables are intentionally closed to authenticated browser roles.
-- Internal state assertions temporarily return to the PostgreSQL test owner.
reset role;
do $$
declare
  count_entries integer;
  v_period_id uuid := current_setting('test.branch_period_id')::uuid;
begin
  select count(*) into count_entries
  from public.payroll_entries
  where period_id = v_period_id;
  if count_entries <> 1 then
    raise exception 'expected exactly one branch payroll entry, got %', count_entries;
  end if;
end;
$$;
set role authenticated;

do $$
begin
  begin
    perform public.generate_payroll_period(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003',
      '2026-08-01',
      null
    );
    raise exception 'expected branch scope denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'PAYROLL_MANAGE_REQUIRED' then raise; end if;
  end;

  begin
    perform public.get_payroll_workspace(
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '2026-08-01'
    );
    raise exception 'expected tenant scope denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'PAYROLL_VIEW_REQUIRED' then raise; end if;
  end;
end;
$$;

reset role;
select id as branch_entry_id
from public.payroll_entries
where period_id = current_setting('test.branch_period_id')::uuid
limit 1 \gset
select set_config('test.branch_entry_id', :'branch_entry_id', false);
set role authenticated;

select public.adjust_payroll_entry(
  '10000000-0000-4000-8000-000000000001',
  :'branch_entry_id',
  100,
  50,
  20
);

reset role;
do $$
declare
  net numeric;
  entry_id uuid := current_setting('test.branch_entry_id')::uuid;
begin
  select net_amount into net from public.payroll_entries where id = entry_id;
  if net <> 1030 then raise exception 'expected deterministic net 1030, got %', net; end if;
end;
$$;
set role authenticated;

select public.approve_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  :'branch_period_id'
);

do $$
declare
  entry_id uuid := current_setting('test.branch_entry_id')::uuid;
begin
  begin
    perform public.adjust_payroll_entry(
      '10000000-0000-4000-8000-000000000001', entry_id, 0, 0, 0
    );
    raise exception 'expected approved entry edit denial';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'PAYROLL_ENTRY_NOT_EDITABLE' then raise; end if;
  end;
end;
$$;

select public.record_payroll_payment(
  '10000000-0000-4000-8000-000000000001',
  :'branch_entry_id',
  '2026-08-10',
  'cash',
  'SAL-001',
  null
) as payment_id \gset
select set_config('test.payment_id', :'payment_id', false);

do $$
declare
  paid numeric;
begin
  select coalesce(sum(amount), 0) into paid
  from public.list_payroll_report_payments('10000000-0000-4000-8000-000000000001')
  where status = 'completed' and branch_id = '20000000-0000-4000-8000-000000000001';
  if paid <> 1030 then raise exception 'report expected one completed payroll outflow of 1030, got %', paid; end if;
end;
$$;

reset role;
do $$
declare
  entry_status text;
  entry_id uuid := current_setting('test.branch_entry_id')::uuid;
begin
  select status into entry_status from public.payroll_entries where id = entry_id;
  if entry_status <> 'paid' then raise exception 'entry was not marked paid'; end if;
end;
$$;
set role authenticated;

do $$
declare
  entry_id uuid := current_setting('test.branch_entry_id')::uuid;
begin
  begin
    perform public.record_payroll_payment(
      '10000000-0000-4000-8000-000000000001', entry_id,
      '2026-08-11', 'cash', null, null
    );
    raise exception 'expected second payment rejection';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'PAYROLL_ENTRY_NOT_PAYABLE' then raise; end if;
  end;
end;
$$;

select public.reverse_payroll_payment(
  '10000000-0000-4000-8000-000000000001',
  :'payment_id',
  'خطأ في وسيلة الدفع'
);

do $$
declare
  paid numeric;
begin
  select coalesce(sum(amount), 0) into paid
  from public.list_payroll_report_payments('10000000-0000-4000-8000-000000000001')
  where status = 'completed' and branch_id = '20000000-0000-4000-8000-000000000001';
  if paid <> 0 then raise exception 'reversed payroll remained in completed outflow'; end if;
end;
$$;

reset role;
do $$
declare
  entry_status text;
  entry_id uuid := current_setting('test.branch_entry_id')::uuid;
begin
  select status into entry_status from public.payroll_entries where id = entry_id;
  if entry_status <> 'approved' then raise exception 'reversed payroll did not reopen entry'; end if;
end;
$$;
set role authenticated;

select public.record_payroll_payment(
  '10000000-0000-4000-8000-000000000001',
  :'branch_entry_id',
  '2026-08-11',
  'bank_transfer',
  'SAL-002',
  null
) as second_payment_id \gset
select set_config('test.second_payment_id', :'second_payment_id', false);

select public.close_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  :'branch_period_id'
);

do $$
declare
  payment_id uuid := current_setting('test.second_payment_id')::uuid;
begin
  begin
    perform public.reverse_payroll_payment(
      '10000000-0000-4000-8000-000000000001',
      payment_id,
      'محاولة بعد الإغلاق'
    );
    raise exception 'expected closed period reversal denial';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'PAYROLL_PAYMENT_NOT_REVERSIBLE' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);
select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  null,
  '2026-08-01',
  null
) as school_period_id \gset

reset role;
select id as school_entry_id
from public.payroll_entries
where period_id = :'school_period_id'::uuid
limit 1 \gset
set role authenticated;

select public.approve_payroll_period(
  '10000000-0000-4000-8000-000000000001', :'school_period_id'
);
select public.record_payroll_payment(
  '10000000-0000-4000-8000-000000000001', :'school_entry_id',
  '2026-08-12', 'postal', 'SAL-SCHOOL', null
);
select public.close_payroll_period(
  '10000000-0000-4000-8000-000000000001', :'school_period_id'
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);
do $$
begin
  begin
    perform public.get_payroll_workspace(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '2026-08-01'
    );
    raise exception 'teacher payee unexpectedly read payroll';
  exception when insufficient_privilege then
    if sqlerrm <> 'PAYROLL_VIEW_REQUIRED' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', false);
do $$
begin
  begin
    perform public.get_payroll_workspace(
      '10000000-0000-4000-8000-000000000001', null, '2026-08-01'
    );
    raise exception 'no-permission staff unexpectedly read payroll';
  exception when insufficient_privilege then
    if sqlerrm <> 'PAYROLL_VIEW_REQUIRED' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    perform * from public.payroll_compensation_profiles limit 1;
    raise exception 'authenticated raw payroll read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  event_count integer;
  reversed_count integer;
begin
  select count(*) into event_count from public.payroll_audit_events;
  if event_count < 10 then raise exception 'expected payroll audit events, got %', event_count; end if;
  select count(*) into reversed_count from public.payroll_payments where status = 'reversed';
  if reversed_count <> 1 then raise exception 'expected one retained reversed payroll payment'; end if;
end;
$$;

select 'payroll_foundation_runtime_passed' as result;