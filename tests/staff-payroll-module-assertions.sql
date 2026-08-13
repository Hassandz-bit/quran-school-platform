\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);

select public.save_staff_employee(
  '10000000-0000-4000-8000-000000000001', null,
  '20000000-0000-4000-8000-000000000001',
  'موظف مستقل', 'driver', null, 'EMP-001', '0550000000',
  '2026-08-01', 'لا يحتاج إلى حساب دخول', null, null
) as employee_id \gset
select set_config('test.employee_id', :'employee_id', false);

select public.create_employee_compensation(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', :'employee_id',
  1800, '2026-09-01', null, 'راتب الموظف المستقل'
) as compensation_id \gset

select public.generate_payroll_period(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', '2026-09-01', null
) as period_id \gset

do $$
declare
  employee_count integer;
  workspace jsonb;
begin
  select count(*) into employee_count
  from public.list_staff_employees(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ) as employee
  where employee.employee_id = current_setting('test.employee_id')::uuid
    and employee.linked_profile_id is null
    and employee.linked_teacher_id is null;
  if employee_count <> 1 then
    raise exception 'independent employee was not returned';
  end if;

  workspace := public.get_staff_payroll_workspace(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001', '2026-09-01'
  );
  if jsonb_array_length(workspace->'entries') <> 1
    or workspace->'entries'->0->>'employee_id' <> current_setting('test.employee_id')
    or workspace->'entries'->0->>'role_label' <> 'السائق'
  then
    raise exception 'employee payroll snapshot is incomplete: %', workspace;
  end if;
end;
$$;

do $$
begin
  begin
    perform 1 from public.employees limit 1;
    raise exception 'raw employees table should remain closed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('authenticated', 'public.employees', 'select') then
    raise exception 'authenticated retained raw employee table access';
  end if;
  if has_function_privilege('anon', 'public.save_staff_employee(uuid,uuid,uuid,text,text,text,text,text,date,text,uuid,uuid)', 'execute') then
    raise exception 'anonymous role can save employees';
  end if;
end;
$$;
