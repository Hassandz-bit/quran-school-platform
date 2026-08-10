\set ON_ERROR_STOP on

-- Create one active relationship before producing attendance notifications.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);

insert into public.student_guardians (
  id, school_id, student_id, guardian_profile_id, relationship_type,
  is_primary, status, created_by, activated_at
) values (
  '70000000-0000-4000-8000-000000000088',
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000006',
  'father', true, 'active',
  '60000000-0000-4000-8000-000000000001', now()
);

-- Browser roles must never access the center table or internal writer directly.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.app_notifications'::regclass) then
    raise exception 'app notification RLS is disabled';
  end if;
  if has_table_privilege('anon', 'public.app_notifications', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.app_notifications', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'browser roles unexpectedly access app_notifications';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.create_app_notification_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly executes internal notification writer';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.create_app_notification_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot use the validated internal notification writer';
  end if;
  if not has_function_privilege('authenticated', 'public.list_my_app_notifications(text,text,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_my_unread_notification_count()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.mark_my_app_notification_read(uuid)', 'EXECUTE')
  then
    raise exception 'authenticated notification self-service RPC grants are incomplete';
  end if;
end;
$$;

-- Explicit module categories must accept teacher/student server notifications.
set role service_role;
select public.create_app_notification_internal(
  '10000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  null,
  null,
  'teachers',
  'teacher_test',
  'Teacher module test',
  'Teacher category is available to server modules.',
  '/notifications',
  'test_teacher_module',
  'a0000000-0000-4000-8000-000000000001'
);
select public.create_app_notification_internal(
  '10000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  null,
  '50000000-0000-4000-8000-000000000001',
  'students',
  'student_test',
  'Student module test',
  'Student category is available to server modules.',
  '/students/50000000-0000-4000-8000-000000000001',
  'test_student_module',
  'a0000000-0000-4000-8000-000000000002'
);
reset role;

do $$
begin
  if (select count(*) from public.app_notifications where category in ('teachers', 'students')) <> 2 then
    raise exception 'teacher/student module categories are not writable through the server contract';
  end if;
end;
$$;

-- Remove server-contract fixture rows so following inbox assertions stay exact.
delete from public.app_notifications
where source_type in ('test_teacher_module', 'test_student_module');

-- Registrar is branch-scoped and must see only guardian-manageable students.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
create temporary table registrar_access as
select * from public.get_guardian_management_access('10000000-0000-4000-8000-000000000001');
create temporary table registrar_guardians as
select * from public.list_school_guardians('10000000-0000-4000-8000-000000000001');
create temporary table registrar_invite_students as
select * from public.list_guardian_invite_students('10000000-0000-4000-8000-000000000001');
reset role;

do $$
begin
  if not (select can_view and can_invite and can_view_contacts from registrar_access) then
    raise exception 'registrar guardian access was not resolved from scoped permissions';
  end if;
  if (select count(*) from registrar_guardians) <> 1 then
    raise exception 'registrar guardian directory scope is wrong';
  end if;
  if (select guardian_email from registrar_guardians limit 1) <> 'guardian-one@example.test' then
    raise exception 'authorized registrar did not receive safe guardian contact';
  end if;
  if exists (
    select 1 from registrar_invite_students
    where branch_id <> '20000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'registrar invite student list escaped branch scope';
  end if;
end;
$$;

-- Teacher has no guardian module permission and must see neither directory nor invite list.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', false);
create temporary table teacher_access as
select * from public.get_guardian_management_access('10000000-0000-4000-8000-000000000001');
create temporary table teacher_guardians as
select * from public.list_school_guardians('10000000-0000-4000-8000-000000000001');
reset role;

do $$
begin
  if (select can_view or can_invite or can_view_contacts or can_revoke from teacher_access) then
    raise exception 'teacher unexpectedly received guardian management access';
  end if;
  if exists (select 1 from teacher_guardians) then
    raise exception 'teacher unexpectedly received guardian directory rows';
  end if;
end;
$$;

-- Produce a real attendance event after the notification-center migrations so
-- sender attribution, guardian recipient, unread count and dedupe all run.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);

insert into public.classes (
  id, school_id, branch_id, name, code, schedule_label, status
) values (
  '30000000-0000-4000-8000-000000000088',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'حلقة مركز الإشعارات', 'CENTER_TEST', '06:00', 'active'
);

update public.students
set class_id = '30000000-0000-4000-8000-000000000088'
where id = '50000000-0000-4000-8000-000000000001';

insert into public.attendance_sessions (
  id, school_id, branch_id, class_id, session_date
) values (
  '90000000-0000-4000-8000-000000000088',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000088',
  '2026-08-10'
);

insert into public.attendance_records (
  id, session_id, student_id, status
) values (
  '91000000-0000-4000-8000-000000000088',
  '90000000-0000-4000-8000-000000000088',
  '50000000-0000-4000-8000-000000000001',
  'absent'
);

-- Re-saving identical absence must not duplicate event or center row.
update public.attendance_records
set status = 'absent'
where id = '91000000-0000-4000-8000-000000000088';

do $$
begin
  if (select count(*) from public.app_notifications) <> 1 then
    raise exception 'one absence did not produce exactly one per-recipient center row';
  end if;
  if not exists (
    select 1 from public.app_notifications
    where recipient_profile_id = '60000000-0000-4000-8000-000000000006'
      and sender_profile_id = '60000000-0000-4000-8000-000000000001'
      and student_id = '50000000-0000-4000-8000-000000000001'
      and category = 'attendance'
      and event_type = 'absence_confirmed'
      and target_path = '/parent/students/50000000-0000-4000-8000-000000000001'
      and read_at is null
  ) then
    raise exception 'absence center row content/scope is wrong';
  end if;
end;
$$;

-- Guardian sees only own inbox and may mark only own row read.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000006', false);
create temporary table guardian_inbox as
select * from public.list_my_app_notifications('inbox', null, 100);
create temporary table guardian_sent as
select * from public.list_my_app_notifications('sent', null, 100);
create temporary table guardian_unread_before as
select public.get_my_unread_notification_count() as count;
select public.mark_my_app_notification_read(
  (select notification_id from guardian_inbox limit 1)
);
create temporary table guardian_unread_after as
select public.get_my_unread_notification_count() as count;
reset role;

do $$
begin
  if (select count(*) from guardian_inbox) <> 1
    or exists (select 1 from guardian_sent)
  then
    raise exception 'guardian inbox/sent self-scope is wrong';
  end if;
  if (select count from guardian_unread_before) <> 1
    or (select count from guardian_unread_after) <> 0
  then
    raise exception 'guardian unread count/read transition is wrong';
  end if;
end;
$$;

-- The staff actor sees the same event in Sent, not in Inbox.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
create temporary table admin_sent as
select * from public.list_my_app_notifications('sent', 'attendance', 100);
create temporary table admin_inbox as
select * from public.list_my_app_notifications('inbox', null, 100);
reset role;

do $$
begin
  if (select count(*) from admin_sent) <> 1 then
    raise exception 'attendance actor did not receive one sent notification row';
  end if;
  if exists (select 1 from admin_inbox) then
    raise exception 'sender unexpectedly received guardian inbox row';
  end if;
end;
$$;

-- Correction creates a second durable center event, while the Push layer may
-- independently suppress a stale lock-screen delivery.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
update public.attendance_records
set status = 'late', arrival_time = '06:20'
where id = '91000000-0000-4000-8000-000000000088';

do $$
begin
  if (select count(*) from public.app_notifications) <> 2 then
    raise exception 'attendance correction did not produce one additional center row';
  end if;
  if (select count(*) from public.app_notifications
      where event_type = 'absence_corrected') <> 1 then
    raise exception 'center correction event is missing or duplicated';
  end if;
end;
$$;
