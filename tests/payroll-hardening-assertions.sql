\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);

-- A school-wide staff compensation must block a second overlapping branch-scoped
-- compensation for the same membership. This prevents double payroll generation.
do $$
begin
  begin
    perform public.create_payroll_compensation(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'member',
      null,
      '31000000-0000-4000-8000-000000000004',
      700,
      '2026-08-01',
      null,
      'Duplicate cross-scope salary'
    );
    raise exception 'expected cross-scope compensation overlap rejection';
  exception when check_violation then
    if sqlerrm <> 'PAYROLL_COMPENSATION_PERIOD_OVERLAP' then raise; end if;
  end;
end;
$$;

-- Admin can read bounded school-wide staff history and latest payment evidence.
do $$
declare
  row_count integer;
  paid_count integer;
begin
  select count(*) into row_count
  from public.list_payroll_history(
    '10000000-0000-4000-8000-000000000001',
    null,
    'member',
    '31000000-0000-4000-8000-000000000004',
    100
  );
  if row_count <> 1 then
    raise exception 'expected one school-wide staff payroll history row, got %', row_count;
  end if;

  select count(*) into paid_count
  from public.list_payroll_history(
    '10000000-0000-4000-8000-000000000001',
    null,
    'member',
    '31000000-0000-4000-8000-000000000004',
    100
  ) h
  where h.entry_status = 'paid'
    and h.payment_status = 'completed'
    and h.payment_reference = 'SAL-SCHOOL';
  if paid_count <> 1 then
    raise exception 'school-wide payroll history did not preserve completed payment evidence';
  end if;
end;
$$;

-- Branch finance can read only its branch payroll history.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000006', false);
do $$
declare
  branch_rows integer;
  other_branch_rows integer;
begin
  select count(*) into branch_rows
  from public.list_payroll_history(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    null,
    null,
    100
  );
  if branch_rows <> 1 then
    raise exception 'expected one accessible branch payroll history row, got %', branch_rows;
  end if;

  begin
    perform * from public.list_payroll_history(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003',
      null,
      null,
      100
    );
    raise exception 'expected other-branch history denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'PAYROLL_VIEW_REQUIRED' then raise; end if;
  end;
end;
$$;

-- The payee still receives no implicit history access.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);
do $$
begin
  begin
    perform * from public.list_payroll_history(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'teacher',
      '50000000-0000-4000-8000-000000000001',
      100
    );
    raise exception 'teacher payee unexpectedly read salary history';
  exception when insufficient_privilege then
    if sqlerrm <> 'PAYROLL_VIEW_REQUIRED' then raise; end if;
  end;
end;
$$;

reset role;
select 'payroll_hardening_runtime_passed' as result;
