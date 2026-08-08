\set ON_ERROR_STOP on

insert into public.schools (id, name, status) values
  ('10000000-0000-4000-8000-000000000001', 'School One', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'School Two', 'active');

insert into public.branches (id, school_id, name, status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Branch One', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Branch Two', 'active');

insert into public.classes (id, school_id, branch_id, name, status) values
  ('21000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Class One', 'active'),
  ('21000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Class Two', 'active');

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'teacher@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'supervisor@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000004', 'member@example.test');

insert into public.profiles (id, full_name, status) values
  ('30000000-0000-4000-8000-000000000001', 'Teacher User', 'active'),
  ('30000000-0000-4000-8000-000000000002', 'Supervisor User', 'active'),
  ('30000000-0000-4000-8000-000000000003', 'Admin User', 'active'),
  ('30000000-0000-4000-8000-000000000004', 'No Permission User', 'active');

insert into public.school_memberships (id, school_id, profile_id, status) values
  ('31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'active'),
  ('31000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'active'),
  ('31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'active'),
  ('31000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'active');

insert into public.roles (id, school_id, code, status) values
  ('32000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'teacher', 'active'),
  ('32000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'academic_supervisor', 'active'),
  ('32000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'school_admin', 'active'),
  ('32000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'member', 'active');

insert into public.permissions (id, code) values
  ('33000000-0000-4000-8000-000000000001', 'memorization.view'),
  ('33000000-0000-4000-8000-000000000002', 'memorization.manage');

insert into public.role_permissions (school_id, role_id, permission_id) values
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000002');

insert into public.membership_roles (id, school_id, membership_id, role_id, branch_id) values
  ('34000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('34000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001'),
  ('34000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000003', null),
  ('34000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000004', null);

insert into public.teachers (
  id, school_id, branch_id, profile_id, first_name, last_name, email, phone, status
) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Assigned', 'Teacher', 'assigned@example.test', '+213000000001', 'active'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', null, 'Other', 'Class', 'other@example.test', '+213000000002', 'active'),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', null, 'Inactive', 'Assignment', 'inactive-assignment@example.test', '+213000000003', 'active'),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', null, 'Inactive', 'Teacher', 'inactive-teacher@example.test', '+213000000004', 'inactive');

insert into public.class_teachers (
  id, school_id, branch_id, class_id, teacher_id, assignment_role, status
) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'primary', 'active'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'primary', 'active'),
  ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'assistant', 'inactive'),
  ('60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'assistant', 'active');

-- Function ACLs are least privilege.
do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.list_memorization_class_teachers(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated is missing EXECUTE';
  end if;

  if has_function_privilege(
    'anon',
    'public.list_memorization_class_teachers(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly has EXECUTE';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as privilege
    where procedure.oid =
      'public.list_memorization_class_teachers(uuid,uuid,uuid)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC unexpectedly has EXECUTE';
  end if;
end;
$$;

-- The assigned teacher sees only the active teacher assigned to the exact class.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);
do $$
declare
  actual_ids uuid[];
  output_keys text[];
  direct_teacher_count integer;
  direct_assignment_count integer;
begin
  select array_agg(result.id order by result.id)
  into actual_ids
  from public.list_memorization_class_teachers(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001'
  ) as result;

  if actual_ids is distinct from array['50000000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'teacher scope returned unexpected teachers: %', actual_ids;
  end if;

  select array_agg(key order by key)
  into output_keys
  from (
    select distinct jsonb_object_keys(to_jsonb(result)) as key
    from public.list_memorization_class_teachers(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001'
    ) as result
  ) as keys;

  if output_keys is distinct from array['first_name', 'id', 'last_name', 'profile_id']::text[] then
    raise exception 'RPC exposed unexpected fields: %', output_keys;
  end if;

  select count(*) into direct_teacher_count from public.teachers;
  select count(*) into direct_assignment_count from public.class_teachers;
  if direct_teacher_count <> 0 or direct_assignment_count <> 0 then
    raise exception 'direct teacher tables are visible through RLS';
  end if;

  begin
    perform 1
    from public.list_memorization_class_teachers(
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000002'
    );
    raise exception 'teacher accessed another school, branch, or class';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'permission denied' then
        raise exception 'unexpected teacher denial: %', sqlerrm;
      end if;
  end;
end;
$$;
reset role;

-- The academic supervisor sees the permitted branch scope and no other tenant.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', false);
do $$
declare
  actual_ids uuid[];
begin
  select array_agg(result.id order by result.id)
  into actual_ids
  from public.list_memorization_class_teachers(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001'
  ) as result;

  if actual_ids is distinct from array['50000000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'academic supervisor scope returned unexpected teachers: %', actual_ids;
  end if;

  begin
    perform 1
    from public.list_memorization_class_teachers(
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000002'
    );
    raise exception 'academic supervisor accessed another school or branch';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- The school administrator sees the correct result only inside the school.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);
do $$
declare
  actual_ids uuid[];
begin
  select array_agg(result.id order by result.id)
  into actual_ids
  from public.list_memorization_class_teachers(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001'
  ) as result;

  if actual_ids is distinct from array['50000000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'school admin scope returned unexpected teachers: %', actual_ids;
  end if;

  begin
    perform 1
    from public.list_memorization_class_teachers(
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000002'
    );
    raise exception 'school admin accessed another school';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- An active member without memorization permission is rejected, not given an empty list.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', false);
do $$
begin
  begin
    perform 1
    from public.list_memorization_class_teachers(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'user without permission received a result';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'permission denied' then
        raise exception 'unexpected no-permission denial: %', sqlerrm;
      end if;
  end;
end;
$$;
reset role;

-- An authenticated database role without a JWT identity is rejected explicitly.
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  begin
    perform 1
    from public.list_memorization_class_teachers(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'missing JWT identity was accepted';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'authentication required' then
        raise exception 'unexpected unauthenticated denial: %', sqlerrm;
      end if;
  end;
end;
$$;
reset role;

-- anon cannot execute the RPC at all.
set role anon;
do $$
begin
  begin
    perform 1
    from public.list_memorization_class_teachers(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'anon executed the RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
