\set ON_ERROR_STOP on

-- Server-only tables and service-only worker RPCs.
do $$
begin
  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.guardian_notification_events'::regclass
  ) or not (
    select relrowsecurity
    from pg_class
    where oid = 'public.guardian_notification_deliveries'::regclass
  ) then
    raise exception 'guardian notification RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.guardian_notification_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.guardian_notification_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon', 'public.guardian_notification_deliveries', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.guardian_notification_deliveries', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'browser roles unexpectedly access guardian notification outbox';
  end if;

  if has_function_privilege('anon', 'public.claim_guardian_push_deliveries(uuid,uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_guardian_push_deliveries(uuid,uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.finish_guardian_push_delivery(uuid,text,text,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finish_guardian_push_delivery(uuid,text,text,integer)', 'EXECUTE')
  then
    raise exception 'browser roles unexpectedly execute guardian notification worker RPCs';
  end if;

  if not has_function_privilege('service_role', 'public.claim_guardian_push_deliveries(uuid,uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.finish_guardian_push_delivery(uuid,text,text,integer)', 'EXECUTE')
  then
    raise exception 'service_role is missing guardian notification worker RPC access';
  end if;
end;
$$;

-- Build one exact attendance class and attach the fixture student to it.
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);

insert into public.classes (
  id,
  school_id,
  branch_id,
  name,
  code,
  schedule_label,
  status
) values (
  '30000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'حلقة اختبار التنبيهات',
  'ALERT_TEST',
  '06:00',
  'active'
);

update public.students
set class_id = '30000000-0000-4000-8000-000000000099'
where id = '50000000-0000-4000-8000-000000000001';

insert into public.student_guardians (
  id,
  school_id,
  student_id,
  guardian_profile_id,
  relationship_type,
  is_primary,
  status,
  created_by,
  activated_at
) values (
  '70000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000006',
  'father',
  true,
  'active',
  '60000000-0000-4000-8000-000000000001',
  now()
);

insert into public.guardian_push_subscriptions (
  id,
  guardian_profile_id,
  endpoint,
  p256dh,
  auth_key,
  user_agent
) values (
  '80000000-0000-4000-8000-000000000099',
  '60000000-0000-4000-8000-000000000006',
  'https://push.example.test/subscription/absence-alert',
  repeat('A', 64),
  repeat('B', 24),
  'Guardian Alert Browser'
);

-- First confirmed absence creates exactly one event and one delivery.
insert into public.attendance_sessions (
  id,
  school_id,
  branch_id,
  class_id,
  session_date
) values (
  '90000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000099',
  '2026-08-10'
);

insert into public.attendance_records (
  id,
  session_id,
  student_id,
  status
) values (
  '91000000-0000-4000-8000-000000000099',
  '90000000-0000-4000-8000-000000000099',
  '50000000-0000-4000-8000-000000000001',
  'absent'
);

do $$
begin
  if (
    select count(*)
    from public.guardian_notification_events
    where attendance_record_id = '91000000-0000-4000-8000-000000000099'
      and event_type = 'absence_confirmed'
      and new_status = 'absent'
  ) <> 1 then
    raise exception 'confirmed absence did not create exactly one event';
  end if;

  if (
    select count(*)
    from public.guardian_notification_deliveries as delivery
    join public.guardian_notification_events as event
      on event.id = delivery.event_id
    where event.attendance_record_id = '91000000-0000-4000-8000-000000000099'
      and delivery.guardian_profile_id = '60000000-0000-4000-8000-000000000006'
      and delivery.subscription_id = '80000000-0000-4000-8000-000000000099'
      and delivery.status = 'pending'
  ) <> 1 then
    raise exception 'confirmed absence did not target the active opted-in guardian';
  end if;
end;
$$;

-- Re-saving the same state is idempotent and must not duplicate the alert.
update public.attendance_records
set status = 'absent'
where id = '91000000-0000-4000-8000-000000000099';

do $$
begin
  if (
    select count(*)
    from public.guardian_notification_events
    where attendance_record_id = '91000000-0000-4000-8000-000000000099'
  ) <> 1 then
    raise exception 'same-state attendance resave duplicated a guardian event';
  end if;
end;
$$;

-- Correcting absent -> late creates one correction event and one delivery.
update public.attendance_records
set status = 'late',
    arrival_time = '06:27'
where id = '91000000-0000-4000-8000-000000000099';

do $$
begin
  if (
    select count(*)
    from public.guardian_notification_events
    where attendance_record_id = '91000000-0000-4000-8000-000000000099'
      and event_type = 'absence_corrected'
      and old_status = 'absent'
      and new_status = 'late'
  ) <> 1 then
    raise exception 'absence correction did not create exactly one event';
  end if;

  if (
    select count(*)
    from public.guardian_notification_deliveries as delivery
    join public.guardian_notification_events as event
      on event.id = delivery.event_id
    where event.attendance_record_id = '91000000-0000-4000-8000-000000000099'
  ) <> 2 then
    raise exception 'absence and correction should have exactly two deliveries';
  end if;
end;
$$;

-- Toggling back cannot spam the same student/session with a second absence or correction.
update public.attendance_records
set status = 'absent', arrival_time = null
where id = '91000000-0000-4000-8000-000000000099';
update public.attendance_records
set status = 'present'
where id = '91000000-0000-4000-8000-000000000099';

do $$
begin
  if (
    select count(*)
    from public.guardian_notification_events
    where attendance_record_id = '91000000-0000-4000-8000-000000000099'
  ) <> 2 then
    raise exception 'attendance toggling generated notification spam';
  end if;
end;
$$;

-- Service worker claims are scoped, atomic, and expose routing keys only to service_role.
set role service_role;
create temporary table claimed_deliveries as
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000099',
  25
);
reset role;

do $$
begin
  if (select count(*) from claimed_deliveries) <> 2 then
    raise exception 'worker did not claim the two due deliveries';
  end if;

  if exists (
    select 1 from claimed_deliveries
    where endpoint <> 'https://push.example.test/subscription/absence-alert'
      or p256dh <> repeat('A', 64)
      or auth_key <> repeat('B', 24)
      or student_id <> '50000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'worker claim returned unexpected scoped routing data';
  end if;
end;
$$;

set role service_role;
select public.finish_guardian_push_delivery(
  (select delivery_id from claimed_deliveries order by event_type limit 1),
  'delivered',
  null,
  60
);
select public.finish_guardian_push_delivery(
  (select delivery_id from claimed_deliveries order by event_type desc limit 1),
  'retry',
  'push_service_503',
  120
);
reset role;

do $$
begin
  if (
    select count(*)
    from public.guardian_notification_deliveries
    where status = 'delivered' and delivered_at is not null
  ) <> 1 then
    raise exception 'delivered outcome was not persisted';
  end if;

  if (
    select count(*)
    from public.guardian_notification_deliveries
    where status = 'retry'
      and attempts = 1
      and last_error_code = 'push_service_503'
  ) <> 1 then
    raise exception 'retry outcome was not persisted safely';
  end if;
end;
$$;

-- A revoked guardian relationship must cancel retry work before the next claim.
update public.student_guardians
set status = 'revoked',
    revoked_by = '60000000-0000-4000-8000-000000000001',
    revoked_at = now(),
    revocation_reason = 'test revoke'
where id = '70000000-0000-4000-8000-000000000099';

set role service_role;
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000099',
  25
);
reset role;

do $$
begin
  if exists (
    select 1
    from public.guardian_notification_deliveries as delivery
    join public.guardian_notification_events as event
      on event.id = delivery.event_id
    where event.student_id = '50000000-0000-4000-8000-000000000001'
      and delivery.status in ('pending', 'retry')
  ) then
    raise exception 'revoked guardian retained claimable notification work';
  end if;
end;
$$;
