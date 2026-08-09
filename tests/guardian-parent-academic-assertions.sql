\set ON_ERROR_STOP on

-- Five browser-facing parent RPCs must be hardened and explicitly scoped.
do $$
declare
  hardened_count integer;
begin
  select count(*)
  into hardened_count
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'list_my_guardian_students',
      'get_my_guardian_student_attendance_summary',
      'list_my_guardian_student_attendance',
      'get_my_guardian_student_memorization_summary',
      'list_my_guardian_student_memorization'
    )
    and procedure.prosecdef
    and procedure.proconfig @> array['search_path=""']::text[];

  if hardened_count <> 5 then
    raise exception 'expected 5 hardened parent academic functions, got %', hardened_count;
  end if;
end;
$$;

-- Anonymous callers cannot execute; authenticated callers can execute only the
-- dedicated RPCs, never direct parent policies on core tables.
do $$
begin
  if has_function_privilege('anon', 'public.list_my_guardian_students()', 'EXECUTE') then
    raise exception 'anon must not execute list_my_guardian_students';
  end if;
  if not has_function_privilege('authenticated', 'public.list_my_guardian_students()', 'EXECUTE') then
    raise exception 'authenticated must execute list_my_guardian_students';
  end if;
  if has_function_privilege('anon', 'public.list_my_guardian_student_attendance(uuid,uuid,integer)', 'EXECUTE') then
    raise exception 'anon must not execute guardian attendance';
  end if;
  if has_function_privilege('anon', 'public.list_my_guardian_student_memorization(uuid,uuid,integer)', 'EXECUTE') then
    raise exception 'anon must not execute guardian memorization';
  end if;
end;
$$;

-- Internal teacher notes and attendance notes are deliberately absent from the
-- parent-facing return contracts.
do $$
declare
  attendance_result text;
  memorization_result text;
begin
  select pg_get_function_result(
    'public.list_my_guardian_student_attendance(uuid,uuid,integer)'::regprocedure
  ) into attendance_result;
  select pg_get_function_result(
    'public.list_my_guardian_student_memorization(uuid,uuid,integer)'::regprocedure
  ) into memorization_result;

  if attendance_result ilike '%note%' then
    raise exception 'attendance notes must not be returned to parents';
  end if;
  if memorization_result ilike '%notes%' then
    raise exception 'internal memorization notes must not be returned to parents';
  end if;
end;
$$;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);

-- One global guardian profile sees its two independently linked students in two
-- schools, without any school_membership.
do $$
declare
  child_count integer;
  membership_count integer;
begin
  select count(*) into child_count from public.list_my_guardian_students();
  select count(*) into membership_count
  from public.school_memberships
  where profile_id = '60000000-0000-4000-8000-000000000006';

  if child_count <> 2 then
    raise exception 'guardian one should see 2 active children, got %', child_count;
  end if;
  if membership_count <> 0 then
    raise exception 'guardian access must not require or create school membership';
  end if;
end;
$$;

-- Direct RLS access stays closed even though the dedicated RPC succeeds.
do $$
begin
  if (select count(*) from public.students where id = '50000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'parent must not gain direct students SELECT';
  end if;
  if (select count(*) from public.attendance_records where student_id = '50000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'parent must not gain direct attendance SELECT';
  end if;
  if (select count(*) from public.memorization_records where student_id = '50000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'parent must not gain direct memorization SELECT';
  end if;
end;
$$;

-- Attendance summary and recent rows include only safe parent-facing fields.
do $$
declare
  total_value bigint;
  present_value bigint;
  absent_value bigint;
  late_value bigint;
  excused_value bigint;
  latest_value date;
  recent_count integer;
begin
  select
    total_records,
    present_count,
    absent_count,
    late_count,
    excused_absence_count,
    last_session_date
  into
    total_value,
    present_value,
    absent_value,
    late_value,
    excused_value,
    latest_value
  from public.get_my_guardian_student_attendance_summary(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  );

  select count(*) into recent_count
  from public.list_my_guardian_student_attendance(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    30
  );

  if row(total_value, present_value, absent_value, late_value, excused_value, latest_value)
    is distinct from row(3::bigint, 1::bigint, 1::bigint, 1::bigint, 0::bigint, '2026-08-03'::date)
  then
    raise exception 'unexpected guardian attendance summary';
  end if;
  if recent_count <> 3 then
    raise exception 'expected 3 guardian attendance rows, got %', recent_count;
  end if;
end;
$$;

-- Memorization summary and rows expose rating/errors/assignment but not notes.
do $$
declare
  total_value bigint;
  average_value numeric;
  errors_value bigint;
  latest_value date;
  recent_count integer;
  latest_assignment text;
begin
  select total_records, average_rating, total_errors, last_record_date
  into total_value, average_value, errors_value, latest_value
  from public.get_my_guardian_student_memorization_summary(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  );

  select count(*), max(next_assignment)
  into recent_count, latest_assignment
  from public.list_my_guardian_student_memorization(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    20
  );

  if total_value <> 2 or average_value <> 4.50 or errors_value <> 1 or latest_value <> '2026-08-03'::date then
    raise exception 'unexpected guardian memorization summary';
  end if;
  if recent_count <> 2 or latest_assignment is null then
    raise exception 'unexpected guardian memorization rows';
  end if;
end;
$$;

-- A wrong school/student pair must fail even if the student UUID is known.
do $$
begin
  begin
    perform *
    from public.get_my_guardian_student_attendance_summary(
      '10000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-tenant guardian request unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Limit parameters are bounded server-side.
do $$
begin
  begin
    perform *
    from public.list_my_guardian_student_attendance(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      0
    );
    raise exception 'invalid guardian attendance limit unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

-- Pending relationships never grant parent reads.
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);

do $$
begin
  if (select count(*) from public.list_my_guardian_students()) <> 0 then
    raise exception 'pending guardian must not see a student';
  end if;

  begin
    perform *
    from public.get_my_guardian_student_memorization_summary(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002'
    );
    raise exception 'pending guardian unexpectedly received academic data';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);

-- Revoke one relationship and prove the next request loses that student's
-- access immediately while the other-school relationship remains active.
update public.student_guardians
set status = 'revoked',
    is_primary = false,
    revoked_by = '60000000-0000-4000-8000-000000000001',
    revoked_at = now(),
    revocation_reason = 'parent_read_test_revoke'
where id = '74000000-0000-4000-8000-000000000001';

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);

do $$
begin
  if (select count(*) from public.list_my_guardian_students()) <> 1 then
    raise exception 'revoked child should disappear while other-school child remains';
  end if;

  begin
    perform *
    from public.get_my_guardian_student_attendance_summary(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001'
    );
    raise exception 'revoked guardian unexpectedly retained student access';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

select 'guardian parent academic migration acceptance passed' as result;
