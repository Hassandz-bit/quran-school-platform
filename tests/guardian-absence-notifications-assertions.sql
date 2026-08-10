\set ON_ERROR_STOP on

-- Private outbox and service-only worker contracts.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.guardian_notification_events'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.guardian_notification_deliveries'::regclass)
  then
    raise exception 'guardian notification RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.guardian_notification_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.guardian_notification_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon', 'public.guardian_notification_deliveries', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.guardian_notification_deliveries', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'browser roles unexpectedly access guardian notification outbox';
  end if;

  if has_function_privilege('authenticated', 'public.claim_guardian_push_deliveries(uuid,uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_due_guardian_push_deliveries(integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finish_guardian_push_delivery(uuid,text,text,integer)', 'EXECUTE')
  then
    raise exception 'authenticated unexpectedly executes guardian notification worker RPCs';
  end if;

  if not has_function_privilege('service_role', 'public.claim_guardian_push_deliveries(uuid,uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.claim_due_guardian_push_deliveries(integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.finish_guardian_push_delivery(uuid,text,text,integer)', 'EXECUTE')
  then
    raise exception 'service_role is missing guardian notification worker RPC access';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);

insert into public.classes (
  id, school_id, branch_id, name, code, schedule_label, status
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
  id, school_id, student_id, guardian_profile_id, relationship_type,
  is_primary, status, created_by, activated_at
) values (
  '70000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000006',
  'father', true, 'active',
  '60000000-0000-4000-8000-000000000001',
  now()
);

insert into public.guardian_push_subscriptions (
  id, guardian_profile_id, endpoint, p256dh, auth_key, user_agent
) values (
  '80000000-0000-4000-8000-000000000099',
  '60000000-0000-4000-8000-000000000006',
  'https://push.example.test/subscription/absence-alert',
  repeat('A', 64), repeat('B', 24), 'Guardian Alert Browser'
);

-- Scenario A: correction before provider delivery suppresses the stale absence.
insert into public.attendance_sessions (
  id, school_id, branch_id, class_id, session_date
) values (
  '90000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000099', '2026-08-10'
);
insert into public.attendance_records (id, session_id, student_id, status)
values (
  '91000000-0000-4000-8000-000000000091',
  '90000000-0000-4000-8000-000000000091',
  '50000000-0000-4000-8000-000000000001', 'absent'
);
update public.attendance_records set status = 'absent'
where id = '91000000-0000-4000-8000-000000000091';
update public.attendance_records set status = 'late', arrival_time = '06:27'
where id = '91000000-0000-4000-8000-000000000091';

do $$
begin
  if (select count(*) from public.guardian_notification_events
      where attendance_record_id = '91000000-0000-4000-8000-000000000091') <> 2 then
    raise exception 'pre-delivery correction event count is wrong';
  end if;

  if not exists (
    select 1
    from public.guardian_notification_deliveries as delivery
    join public.guardian_notification_events as event on event.id = delivery.event_id
    where event.attendance_record_id = '91000000-0000-4000-8000-000000000091'
      and event.event_type = 'absence_confirmed'
      and delivery.status = 'cancelled'
      and delivery.last_error_code = 'attendance_corrected_before_delivery'
  ) then
    raise exception 'stale pre-delivery absence was not cancelled';
  end if;

  if exists (
    select 1
    from public.guardian_notification_deliveries as delivery
    join public.guardian_notification_events as event on event.id = delivery.event_id
    where event.attendance_record_id = '91000000-0000-4000-8000-000000000091'
      and event.event_type = 'absence_corrected'
  ) then
    raise exception 'correction was queued although the absence was never delivered';
  end if;
end;
$$;

set role service_role;
create temporary table claim_a as
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000091', 25
);
reset role;

do $$ begin
  if (select count(*) from claim_a) <> 0 then
    raise exception 'stale corrected session remained claimable';
  end if;
end $$;

-- Scenario B: once absence was delivered, a later correction is delivered too.
insert into public.attendance_sessions (
  id, school_id, branch_id, class_id, session_date
) values (
  '90000000-0000-4000-8000-000000000092',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000099', '2026-08-11'
);
insert into public.attendance_records (id, session_id, student_id, status)
values (
  '91000000-0000-4000-8000-000000000092',
  '90000000-0000-4000-8000-000000000092',
  '50000000-0000-4000-8000-000000000001', 'absent'
);

set role service_role;
create temporary table claim_b_absence as
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000092', 25
);
select public.finish_guardian_push_delivery(
  (select delivery_id from claim_b_absence limit 1), 'delivered', null, 60
);
reset role;

update public.attendance_records set status = 'late', arrival_time = '06:20'
where id = '91000000-0000-4000-8000-000000000092';

set role service_role;
create temporary table claim_b_correction as
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000092', 25
);
reset role;

do $$ begin
  if (select count(*) from claim_b_absence) <> 1 then
    raise exception 'delivered absence scenario did not claim one absence';
  end if;
  if (select count(*) from claim_b_correction where event_type = 'absence_corrected') <> 1 then
    raise exception 'delivered absence did not create one correction delivery';
  end if;
end $$;

set role service_role;
select public.finish_guardian_push_delivery(
  (select delivery_id from claim_b_correction limit 1), 'delivered', null, 60
);
reset role;

-- Scenario C: correction while absence is processing. If provider later confirms
-- the absence was delivered, finish_* must enqueue the correction for that same device.
insert into public.attendance_sessions (
  id, school_id, branch_id, class_id, session_date
) values (
  '90000000-0000-4000-8000-000000000093',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000099', '2026-08-12'
);
insert into public.attendance_records (id, session_id, student_id, status)
values (
  '91000000-0000-4000-8000-000000000093',
  '90000000-0000-4000-8000-000000000093',
  '50000000-0000-4000-8000-000000000001', 'absent'
);
set role service_role;
create temporary table claim_c_absence as
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000093', 25
);
reset role;

update public.attendance_records set status = 'present'
where id = '91000000-0000-4000-8000-000000000093';

set role service_role;
select public.finish_guardian_push_delivery(
  (select delivery_id from claim_c_absence limit 1), 'delivered', null, 60
);
create temporary table claim_c_correction as
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000093', 25
);
reset role;

do $$ begin
  if (select count(*) from claim_c_correction where event_type = 'absence_corrected') <> 1 then
    raise exception 'in-flight delivered absence did not enqueue correction';
  end if;
end $$;

set role service_role;
select public.finish_guardian_push_delivery(
  (select delivery_id from claim_c_correction limit 1), 'delivered', null, 60
);
reset role;

-- Scenario D: retry work can be claimed by the service-only global Cron sweeper.
insert into public.attendance_sessions (
  id, school_id, branch_id, class_id, session_date
) values (
  '90000000-0000-4000-8000-000000000094',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000099', '2026-08-13'
);
insert into public.attendance_records (id, session_id, student_id, status)
values (
  '91000000-0000-4000-8000-000000000094',
  '90000000-0000-4000-8000-000000000094',
  '50000000-0000-4000-8000-000000000001', 'absent'
);
set role service_role;
create temporary table claim_d_initial as
select * from public.claim_guardian_push_deliveries(
  '10000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000094', 25
);
select public.finish_guardian_push_delivery(
  (select delivery_id from claim_d_initial limit 1),
  'retry', 'push_http_503', 60
);
reset role;

-- Advance only the isolated fixture retry clock instead of sleeping.
update public.guardian_notification_deliveries
set next_attempt_at = now() - interval '1 second'
where id = (select delivery_id from claim_d_initial limit 1);

set role service_role;
create temporary table claim_d_retry as
select * from public.claim_due_guardian_push_deliveries(50);
reset role;

do $$ begin
  if (select count(*) from claim_d_retry
      where delivery_id = (select delivery_id from claim_d_initial limit 1)) <> 1 then
    raise exception 'global retry sweeper did not claim due retry work';
  end if;
  if (select max(attempt_number) from claim_d_retry
      where delivery_id = (select delivery_id from claim_d_initial limit 1)) <> 2 then
    raise exception 'retry attempt counter did not advance';
  end if;
end $$;

-- Revocation must obey Guardian Foundation lifecycle and cancel retry work.
set role service_role;
select public.finish_guardian_push_delivery(
  (select delivery_id from claim_d_retry
   where delivery_id = (select delivery_id from claim_d_initial limit 1)),
  'retry', 'push_http_503', 60
);
reset role;

update public.student_guardians
set status = 'revoked',
    is_primary = false,
    revoked_by = '60000000-0000-4000-8000-000000000001',
    revoked_at = now(),
    revocation_reason = 'test revoke'
where id = '70000000-0000-4000-8000-000000000099';

set role service_role;
select * from public.claim_due_guardian_push_deliveries(50);
reset role;

do $$ begin
  if exists (
    select 1
    from public.guardian_notification_deliveries as delivery
    join public.guardian_notification_events as event on event.id = delivery.event_id
    where event.student_id = '50000000-0000-4000-8000-000000000001'
      and delivery.status in ('pending', 'retry')
  ) then
    raise exception 'revoked guardian retained claimable notification work';
  end if;
end $$;
