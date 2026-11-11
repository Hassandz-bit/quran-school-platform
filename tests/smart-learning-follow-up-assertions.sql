\set ON_ERROR_STOP on

-- A school administrator can create an explicitly assigned target.
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
select public.create_learning_follow_up_target(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'new_memorization', 1, 1, 4, current_date, null, 'اختبار التكليف'
);

insert into public.attendance_sessions(id,school_id,branch_id,class_id,session_date)
values ('90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001', current_date);

insert into public.attendance_records(id,school_id,branch_id,class_id,session_id,student_id,status)
values ('91000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001','absent');

do $$
declare report jsonb;
begin
  report := public.get_learning_follow_up_dashboard(
    '10000000-0000-4000-8000-000000000001',
    null,null,null,current_date,current_date,50
  );
  if (report #>> '{overview,assigned_count}')::int <> 1 then
    raise exception 'expected one assigned target: %', report;
  end if;
  if (report #>> '{overview,not_completed_count}')::int <> 1 then
    raise exception 'target without success must remain incomplete: %', report;
  end if;
  if (report #>> '{overview,absence_count}')::int <> 1 then
    raise exception 'expected one absence: %', report;
  end if;
end;
$$;

-- A successful, exact-range memorization result completes the assigned target.
update public.memorization_records
set session_type='new_memorization', surah_number=1, ayah_start=1,
    ayah_end=4, recitation_result='memorized'
where id='80000000-0000-4000-8000-000000000001';

do $$
declare report jsonb;
begin
  report := public.get_learning_follow_up_dashboard(
    '10000000-0000-4000-8000-000000000001',
    null,null,null,current_date,current_date,50
  );
  if (report #>> '{overview,completed_count}')::int <> 1 then
    raise exception 'successful result did not complete target: %', report;
  end if;
end;
$$;

-- Guardian access is limited to an active linked child and is read-only.
insert into auth.users(id,email)
values ('30000000-0000-4000-8000-000000000006','guardian@example.test');
insert into public.profiles(id,full_name,status)
values ('30000000-0000-4000-8000-000000000006','Guardian User','active');
insert into public.student_guardians(school_id,student_id,guardian_profile_id,status)
values ('10000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000006','active');

select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000006',false);

do $$
declare report jsonb;
begin
  report := public.get_my_guardian_learning_follow_up(
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',50
  );
  if jsonb_array_length(report -> 'targets') <> 1 then
    raise exception 'guardian should see exactly the linked child target: %', report;
  end if;
  if public.is_active_guardian_of_student(
    '10000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'guardian scope leaked across schools';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon',
    'public.get_my_guardian_learning_follow_up(uuid,uuid,integer)','EXECUTE') then
    raise exception 'anon must not execute guardian learning RPC';
  end if;
  if has_table_privilege('anon','public.learning_follow_up_targets','SELECT') then
    raise exception 'anon must not read learning targets';
  end if;
end;
$$;

select 'smart learning follow-up migration assertions passed' as result;
