\set ON_ERROR_STOP on

-- Schema, tenant-safe keys, RLS, and least-privilege ACLs.
do $$
declare
  actual_columns text[];
begin
  select array_agg(column_name order by ordinal_position)
  into actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'student_guardians';

  if actual_columns is distinct from array[
    'id',
    'school_id',
    'student_id',
    'guardian_profile_id',
    'relationship_type',
    'is_primary',
    'status',
    'created_by',
    'created_at',
    'activated_at',
    'revoked_by',
    'revoked_at',
    'revocation_reason',
    'updated_at'
  ]::text[] then
    raise exception 'unexpected student_guardians columns: %', actual_columns;
  end if;

  select array_agg(column_name order by ordinal_position)
  into actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'guardian_access_events';

  if actual_columns is distinct from array[
    'id',
    'school_id',
    'student_id',
    'student_guardian_id',
    'guardian_profile_id',
    'event_type',
    'actor_profile_id',
    'reason_code',
    'metadata',
    'occurred_at'
  ]::text[] then
    raise exception 'unexpected guardian_access_events columns: %', actual_columns;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.students'::regclass
      and conname = 'students_school_id_id_unique'
      and contype = 'u'
  ) then
    raise exception 'students tenant identity constraint is missing';
  end if;

  if not exists (
    select 1
    from pg_index
    where indrelid = 'public.student_guardians'::regclass
      and indexrelid =
        'public.student_guardians_live_relationship_unique_idx'::regclass
      and indisunique
      and pg_get_expr(indpred, indrelid) like
        '%status = ANY (ARRAY[''pending''::text, ''active''::text])%'
  ) then
    raise exception 'live guardian partial unique index is missing';
  end if;

  if not exists (
    select 1
    from pg_index
    where indrelid = 'public.student_guardians'::regclass
      and indexrelid =
        'public.student_guardians_live_primary_unique_idx'::regclass
      and indisunique
      and indpred is not null
  ) then
    raise exception 'live primary guardian partial unique index is missing';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.student_guardians'::regclass
  ) then
    raise exception 'student_guardians RLS is disabled';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.guardian_access_events'::regclass
  ) then
    raise exception 'guardian_access_events RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.student_guardians', 'SELECT')
    or has_table_privilege('anon', 'public.guardian_access_events', 'SELECT')
  then
    raise exception 'anon unexpectedly has guardian table access';
  end if;

  if not has_table_privilege(
    'authenticated',
    'public.student_guardians',
    'SELECT'
  ) or not has_table_privilege(
    'authenticated',
    'public.guardian_access_events',
    'SELECT'
  ) then
    raise exception 'authenticated is missing scoped guardian SELECT';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.student_guardians',
    'INSERT,UPDATE,DELETE'
  ) or has_table_privilege(
    'authenticated',
    'public.guardian_access_events',
    'INSERT,UPDATE,DELETE'
  ) then
    raise exception 'authenticated unexpectedly has direct guardian writes';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'students',
        'attendance_sessions',
        'attendance_records',
        'attendance_record_history',
        'memorization_records',
        'memorization_record_history',
        'student_charges',
        'payments',
        'expenses'
      )
      and policyname ilike '%guardian%'
  ) then
    raise exception 'Migration 017 added guardian policy to an original data table';
  end if;
end;
$$;

-- Permission matrix, including legacy guardian deactivation.
do $$
declare
  school_id_value uuid;
  permission_count integer;
begin
  foreach school_id_value in array array[
    '10000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid
  ]
  loop
    select count(*)
    into permission_count
    from public.roles as role
    join public.role_permissions as role_permission
      on role_permission.school_id = role.school_id
     and role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where role.school_id = school_id_value
      and role.code = 'school_admin'
      and permission.code like 'guardians.%';

    if permission_count <> 6 then
      raise exception 'school_admin guardian grant count is % for %',
        permission_count,
        school_id_value;
    end if;

    select count(*)
    into permission_count
    from public.roles as role
    join public.role_permissions as role_permission
      on role_permission.school_id = role.school_id
     and role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where role.school_id = school_id_value
      and role.code = 'registrar'
      and permission.code like 'guardians.%';

    if permission_count <> 5 then
      raise exception 'registrar guardian grant count is % for %',
        permission_count,
        school_id_value;
    end if;

    if exists (
      select 1
      from public.roles as role
      join public.role_permissions as role_permission
        on role_permission.school_id = role.school_id
       and role_permission.role_id = role.id
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where role.school_id = school_id_value
        and role.code = 'registrar'
        and permission.code = 'guardians.audit'
    ) then
      raise exception 'registrar unexpectedly received guardians.audit';
    end if;

    if exists (
      select 1
      from public.roles as role
      join public.role_permissions as role_permission
        on role_permission.school_id = role.school_id
       and role_permission.role_id = role.id
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where role.school_id = school_id_value
        and role.code in (
          'teacher',
          'academic_supervisor',
          'finance_officer',
          'branch_manager',
          'guardian'
        )
        and permission.code like 'guardians.%'
    ) then
      raise exception 'a non-default role received guardian permissions in %',
        school_id_value;
    end if;

    if exists (
      select 1
      from public.roles as role
      join public.role_permissions as role_permission
        on role_permission.school_id = role.school_id
       and role_permission.role_id = role.id
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where role.school_id = school_id_value
        and role.code = 'guardian'
        and permission.code in ('school.view', 'branches.view')
    ) then
      raise exception 'legacy guardian default grants remain in %',
        school_id_value;
    end if;
  end loop;

  if (
    select count(*)
    from public.roles
    where code = 'guardian'
      and status = 'active'
  ) <> 2 then
    raise exception 'legacy guardian roles were deleted or disabled';
  end if;
end;
$$;

-- SECURITY DEFINER hardening and explicit function ACLs.
do $$
declare
  function_signature text;
  function_oid regprocedure;
begin
  foreach function_signature in array array[
    'public.can_manage_student_guardian(uuid,uuid,text)',
    'public.is_active_guardian_of_student(uuid,uuid)',
    'public.prepare_student_guardian_link(uuid,uuid,uuid,text,boolean)',
    'public.revoke_student_guardian_link(uuid,uuid,text)',
    'public.revoke_guardians_on_terminal_student_status()'
  ]
  loop
    function_oid := function_signature::regprocedure;

    if not (
      select procedure.prosecdef
      from pg_proc as procedure
      where procedure.oid = function_oid
    ) then
      raise exception '% is not SECURITY DEFINER', function_signature;
    end if;

    if not (
      select coalesce(
        array_to_string(procedure.proconfig, ',') like '%search_path=%',
        false
      )
      from pg_proc as procedure
      where procedure.oid = function_oid
    ) then
      raise exception '% does not pin search_path', function_signature;
    end if;

    if has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'anon unexpectedly executes %', function_signature;
    end if;

    if exists (
      select 1
      from pg_proc as procedure
      cross join lateral aclexplode(
        coalesce(procedure.proacl, acldefault('f', procedure.proowner))
      ) as privilege
      where procedure.oid = function_oid
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC unexpectedly executes %', function_signature;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'public.can_manage_student_guardian(uuid,uuid,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.prepare_student_guardian_link(uuid,uuid,uuid,text,boolean)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.revoke_student_guardian_link(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated is missing management RPC execution';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.is_active_guardian_of_student(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.revoke_guardians_on_terminal_student_status()',
    'EXECUTE'
  ) then
    raise exception 'authenticated executes an internal guardian helper';
  end if;
end;
$$;

-- School A admin: new links are pending, exact retries are idempotent, and
-- cross-school operations are rejected.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
do $$
declare
  first_id uuid;
  retry_id uuid;
begin
  first_id := public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000006',
    'father',
    true
  );

  retry_id := public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000006',
    'father',
    true
  );

  if first_id is distinct from retry_id then
    raise exception 'idempotent link retry created a different relationship';
  end if;

  perform public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000006',
    'father',
    false
  );

  perform public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000006',
    'father',
    false
  );

  perform public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000003',
    '60000000-0000-4000-8000-000000000010',
    'relative',
    false
  );

  begin
    perform public.prepare_student_guardian_link(
      '10000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000005',
      '60000000-0000-4000-8000-000000000006',
      'father',
      false
    );
    raise exception 'School A admin linked a School B student';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'permission denied' then
        raise;
      end if;
  end;

  begin
    perform public.prepare_student_guardian_link(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000010',
      'relative',
      true
    );
    raise exception 'a second live primary guardian was accepted';
  exception when unique_violation then null;
  end;
end;
$$;
reset role;

-- Branch-scoped registrar may manage Branch A1 but not Branch A2.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  false
);
do $$
begin
  perform public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000007',
    'mother',
    false
  );

  begin
    perform public.prepare_student_guardian_link(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      '60000000-0000-4000-8000-000000000007',
      'mother',
      false
    );
    raise exception 'branch registrar linked a student in another branch';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'permission denied' then
        raise;
      end if;
  end;
end;
$$;
reset role;

-- School B admin can reuse the same global guardian profile without a
-- membership and without exposing School B to School A.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000008',
  false
);
select public.prepare_student_guardian_link(
  '10000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000005',
  '60000000-0000-4000-8000-000000000006',
  'father',
  true
);
reset role;

-- Teacher and a guardian profile without membership cannot manage links.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000003',
  false
);
do $$
begin
  begin
    perform public.prepare_student_guardian_link(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000010',
      'relative',
      false
    );
    raise exception 'teacher created a guardian relationship';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select set_config(
  'test.guardian_one_relationship_id',
  (
    select id::text
    from public.student_guardians
    where school_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '50000000-0000-4000-8000-000000000001'
      and guardian_profile_id =
        '60000000-0000-4000-8000-000000000006'
  ),
  false
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
do $$
declare
  visible_relationships integer;
  visible_events integer;
begin
  select count(*) into visible_relationships
  from public.student_guardians;

  select count(*) into visible_events
  from public.guardian_access_events;

  if visible_relationships <> 0 or visible_events <> 0 then
    raise exception 'guardian browser session can directly read guardian tables';
  end if;

  begin
    perform public.prepare_student_guardian_link(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000010',
      'relative',
      false
    );
    raise exception 'guardian without membership managed a link';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.is_active_guardian_of_student(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001'
    );
    raise exception 'internal guardian helper is browser executable';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.student_guardians (
      school_id,
      student_id,
      guardian_profile_id,
      relationship_type,
      created_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000010',
      'relative',
      '60000000-0000-4000-8000-000000000006'
    );
    raise exception 'authenticated browser inserted a guardian relationship';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Parent profiles have no memberships, one profile can span schools and
-- children, and one child can have multiple guardians.
do $$
begin
  if exists (
    select 1
    from public.school_memberships
    where profile_id in (
      '60000000-0000-4000-8000-000000000006',
      '60000000-0000-4000-8000-000000000007',
      '60000000-0000-4000-8000-000000000010'
    )
  ) then
    raise exception 'guardian linking created a school membership';
  end if;

  if (
    select count(distinct school_id)
    from public.student_guardians
    where guardian_profile_id =
      '60000000-0000-4000-8000-000000000006'
  ) <> 2 then
    raise exception 'global guardian profile was not reused across schools';
  end if;

  if (
    select count(distinct student_id)
    from public.student_guardians
    where guardian_profile_id =
      '60000000-0000-4000-8000-000000000006'
  ) <> 4 then
    raise exception 'guardian was not linked to multiple children';
  end if;

  if (
    select count(*)
    from public.student_guardians
    where school_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '50000000-0000-4000-8000-000000000001'
      and status in ('pending', 'active')
  ) <> 2 then
    raise exception 'student does not have both distinct guardians';
  end if;

  begin
    insert into public.student_guardians (
      school_id,
      student_id,
      guardian_profile_id,
      relationship_type,
      is_primary,
      status,
      created_by
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000006',
      'father',
      false,
      'pending',
      '60000000-0000-4000-8000-000000000001'
    );
    raise exception 'duplicate live relationship bypassed the partial index';
  exception when unique_violation then null;
  end;
end;
$$;

-- Trusted activation is reserved for PR B. It is simulated as the table owner
-- here only to verify the internal parent authorization helper.
update public.student_guardians
set status = 'active',
    activated_at = now()
where school_id = '10000000-0000-4000-8000-000000000001'
  and student_id in (
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000004'
  )
  and guardian_profile_id =
    '60000000-0000-4000-8000-000000000006';

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
do $$
begin
  if not public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'active relationship did not authorize its exact child';
  end if;

  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'pending School B relationship authorized parent access';
  end if;

  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'another guardian relationship authorized the wrong child';
  end if;

  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'cross-school helper input authorized access';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);
do $$
begin
  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'pending relationship authorized parent access';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000009',
  false
);
do $$
begin
  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'legacy guardian role granted parent access';
  end if;
end;
$$;

-- RLS tenant and branch isolation.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
do $$
declare
  relationship_count integer;
begin
  select count(*) into relationship_count
  from public.student_guardians;

  if relationship_count <> 5 then
    raise exception 'School A admin RLS count is %', relationship_count;
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  false
);
do $$
declare
  relationship_count integer;
begin
  select count(*) into relationship_count
  from public.student_guardians;

  if relationship_count <> 4 then
    raise exception 'Branch A1 registrar RLS count is %', relationship_count;
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000008',
  false
);
do $$
declare
  relationship_count integer;
begin
  select count(*) into relationship_count
  from public.student_guardians;

  if relationship_count <> 1 then
    raise exception 'School B admin RLS count is %', relationship_count;
  end if;
end;
$$;
reset role;

-- Manual revoke is branch-scoped, audited, and idempotent.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  false
);
do $$
declare
  relationship_id uuid;
begin
  select id into strict relationship_id
  from public.student_guardians
  where school_id = '10000000-0000-4000-8000-000000000001'
    and student_id = '50000000-0000-4000-8000-000000000001'
    and guardian_profile_id =
      '60000000-0000-4000-8000-000000000007';

  if not public.revoke_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    relationship_id,
    'manual_review'
  ) then
    raise exception 'manual revoke returned false';
  end if;

  if not public.revoke_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    relationship_id,
    'manual_review'
  ) then
    raise exception 'idempotent revoke returned false';
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000003',
  false
);
do $$
declare
  relationship_id uuid :=
    current_setting('test.guardian_one_relationship_id')::uuid;
begin
  begin
    perform public.revoke_student_guardian_link(
      '10000000-0000-4000-8000-000000000001',
      relationship_id,
      'teacher_attempt'
    );
    raise exception 'teacher revoked a guardian relationship';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select set_config(
  'test.school_b_relationship_id',
  (
    select id::text
    from public.student_guardians
    where school_id = '10000000-0000-4000-8000-000000000002'
  ),
  false
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
do $$
declare
  relationship_id uuid :=
    current_setting('test.school_b_relationship_id')::uuid;
begin
  begin
    perform public.revoke_student_guardian_link(
      '10000000-0000-4000-8000-000000000002',
      relationship_id,
      'cross_school_attempt'
    );
    raise exception 'School A admin revoked a School B relationship';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1
    from public.student_guardians
    where school_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '50000000-0000-4000-8000-000000000001'
      and guardian_profile_id =
        '60000000-0000-4000-8000-000000000007'
      and status = 'revoked'
      and not is_primary
      and revoked_at is not null
      and revoked_by = '60000000-0000-4000-8000-000000000002'
      and revocation_reason = 'manual_review'
  ) then
    raise exception 'manual revoke state is incomplete';
  end if;

  if (
    select count(*)
    from public.guardian_access_events
    where event_type = 'relationship_revoked'
      and guardian_profile_id =
        '60000000-0000-4000-8000-000000000007'
  ) <> 1 then
    raise exception 'manual revoke audit is missing or duplicated';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);
do $$
begin
  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'revoked relationship still authorizes parent access';
  end if;
end;
$$;

-- Definite terminal student statuses revoke every live relationship atomically;
-- suspended intentionally preserves access.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
update public.students
set status = 'withdrawn'
where school_id = '10000000-0000-4000-8000-000000000001'
  and id = '50000000-0000-4000-8000-000000000004';

update public.students
set status = 'suspended'
where school_id = '10000000-0000-4000-8000-000000000001'
  and id = '50000000-0000-4000-8000-000000000002';
reset role;

do $$
begin
  if not exists (
    select 1
    from public.student_guardians
    where school_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '50000000-0000-4000-8000-000000000004'
      and status = 'revoked'
      and revoked_at is not null
      and revoked_by is null
      and revocation_reason = 'student_withdrawn'
  ) then
    raise exception 'terminal student status did not revoke guardian access';
  end if;

  if not exists (
    select 1
    from public.guardian_access_events
    where school_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '50000000-0000-4000-8000-000000000004'
      and event_type = 'automatic_revoked'
      and actor_profile_id is null
      and reason_code = 'student_withdrawn'
  ) then
    raise exception 'automatic revoke audit event is missing';
  end if;

  if not exists (
    select 1
    from public.student_guardians
    where school_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '50000000-0000-4000-8000-000000000002'
      and status = 'active'
      and revoked_at is null
  ) then
    raise exception 'suspended student incorrectly lost guardian access';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
do $$
begin
  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'automatic revoke did not invalidate helper immediately';
  end if;

  if not public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'suspended student no longer authorizes active guardian';
  end if;
end;
$$;

-- Audit is visible only with guardians.audit and remains append-only.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
do $$
declare
  event_count integer;
  event_id uuid;
begin
  select count(*), min(id::text)::uuid
  into event_count, event_id
  from public.guardian_access_events;

  if event_count <> 7 then
    raise exception 'School A admin audit count is %', event_count;
  end if;

  begin
    update public.guardian_access_events
    set reason_code = 'tampered'
    where id = event_id;
    raise exception 'authenticated browser updated an audit event';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.guardian_access_events
    where id = event_id;
    raise exception 'authenticated browser deleted an audit event';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  false
);
do $$
declare
  event_count integer;
begin
  select count(*) into event_count
  from public.guardian_access_events;

  if event_count <> 0 then
    raise exception 'registrar without guardians.audit read audit events';
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000008',
  false
);
do $$
declare
  event_count integer;
begin
  select count(*) into event_count
  from public.guardian_access_events;

  if event_count <> 1 then
    raise exception 'School B audit isolation count is %', event_count;
  end if;
end;
$$;
reset role;

-- anon has neither table nor management-function access.
set role anon;
do $$
begin
  begin
    perform 1 from public.student_guardians;
    raise exception 'anon selected student_guardians';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.prepare_student_guardian_link(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000006',
      'father',
      true
    );
    raise exception 'anon executed guardian management RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
