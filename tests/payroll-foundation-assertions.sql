\set ON_ERROR_STOP on

-- Admin creates one branch teacher salary and one school-wide staff salary.
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

-- Effective ranges cannot overlap, and a teacher-linked membership cannot create a second payee identity.
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

-- Branch finance officer can manage Branch One only.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000006', false);
select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-01',
  null
) as branch_period_id \gset

-- Retry is idempotent and does not duplicate entries.
select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-01',
  null
) as branch_period_retry \gset

do $$
declare
  count_entries integer;
begin
  if :'branch_period_id'::uuid <> :'branch_period_retry'::uuid then
    raise exception 'payroll generation did not return the same period';
  end if;
  select count(*) into count_entries
  from public.payroll_entries
  where period_id = :'branch_period_id'::uuid;
  if count_entries <> 1 then
    raise exception 'expected exactly one branch payroll entry, got %', count_entries;
  end if;
end;
$$;

-- Out-of-scope known branch and another school use permission denial.
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

select id as branch_entry_id
from public.payroll_entries
where period_id = :'branch_period_id'::uuid
limit 1 \gset

select public.adjust_payroll_entry(
  '10000000-0000-4000-8000-000000000001',
  :'branch_entry_id',
  100,
  50,
  20
);

do $$
declare
  net numeric;
begin
  select net_amount into net from public.payroll_entries where id = :'branch_entry_id'::uuid;
  if net <> 1030 then raise exception 'expected deterministic net 1030, got %', net; end if;
end;
$$;

select public.approve_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  :'branch_period_id'
);

-- Approved entries are immutable through the draft adjustment RPC.
do $$
begin
  begin
    perform public.adjust_payroll_entry(
      '10000000-0000-4000-8000-000000000001',
      :'branch_entry_id', 0, 0, 0
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

do $$
declare
  paid numeric;
  entry_status text;
begin
  select coalesce(sum(amount), 0) into paid
  from public.list_payroll_report_payments('10000000-0000-4000-8000-000000000001')
  where status = 'completed' and branch_id = '20000000-0000-4000-8000-000000000001';
  if paid <> 1030 then raise exception 'report expected one completed payroll outflow of 1030, got %', paid; end if;
  select status into entry_status from public.payroll_entries where id = :'branch_entry_id'::uuid;
  if entry_status <> 'paid' then raise exception 'entry was not marked paid'; end if;
end;
$$;

-- Second completed payment cannot be recorded while entry is paid.
do $$
begin
  begin
    perform public.record_payroll_payment(
      '10000000-0000-4000-8000-000000000001', :'branch_entry_id',
      '2026-08-11', 'cash', null, null
    );
    raise exception 'expected second payment rejection';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'PAYROLL_ENTRY_NOT_PAYABLE' then raise; end if;
  end;
end;
$$;

-- Reversal removes cash outflow but retains history and returns entry to approved.
select public.reverse_payroll_payment(
  '10000000-0000-4000-8000-000000000001',
  :'payment_id',
  'خطأ في وسيلة الدفع'
);

do $$
declare
  paid numeric;
  entry_status text;
begin
  select coalesce(sum(amount), 0) into paid
  from public.list_payroll_report_payments('10000000-0000-4000-8000-000000000001')
  where status = 'completed' and branch_id = '20000000-0000-4000-8000-000000000001';
  if paid <> 0 then raise exception 'reversed payroll remained in completed outflow'; end if;
  select status into entry_status from public.payroll_entries where id = :'branch_entry_id'::uuid;
  if entry_status <> 'approved' then raise exception 'reversed payroll did not reopen entry'; end if;
end;
$$;

select public.record_payroll_payment(
  '10000000-0000-4000-8000-000000000001',
  :'branch_entry_id',
  '2026-08-11',
  'bank_transfer',
  'SAL-002',
  null
) as second_payment_id \gset

select public.close_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  :'branch_period_id'
);

-- Closed payroll cannot have its completed payment reversed.
do $$
begin
  begin
    perform public.reverse_payroll_payment(
      '10000000-0000-4000-8000-000000000001',
      :'second_payment_id',
      'محاولة بعد الإغلاق'
    );
    raise exception 'expected closed period reversal denial';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'PAYROLL_PAYMENT_NOT_REVERSIBLE' then raise; end if;
  end;
end;
$$;

-- School-wide administrator handles school-level staff separately.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);
select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  null,
  '2026-08-01',
  null
) as school_period_id \gset

select id as school_entry_id
from public.payroll_entries
where period_id = :'school_period_id'::uuid
limit 1 \gset

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

-- Payees without finance permissions cannot read their own salary, and no-permission
-- staff cannot open payroll merely because they are in compensation setup.
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

-- Authenticated browser role cannot query raw salary tables.
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

-- The audit ledger contains lifecycle evidence and retains reversed payments.
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
