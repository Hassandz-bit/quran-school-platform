\set ON_ERROR_STOP on

-- The dual-role profile created by the notification-center assertions is both
-- a teacher and a guardian. Recurring billing reminders must remain guardian-only.
set role service_role;
select public.create_app_notification_internal(
  '10000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'finance',
  'finance_charge_due_soon',
  'Guardian finance isolation test',
  'This reminder belongs only in the guardian portal.',
  '/parent/students/50000000-0000-4000-8000-000000000001',
  'finance_charge_reminder',
  'a0000000-0000-4000-8000-000000000075'
);
reset role;

do $$
begin
  if not exists (
    select 1
    from public.app_notifications
    where source_id = 'a0000000-0000-4000-8000-000000000075'
      and recipient_profile_id = '60000000-0000-4000-8000-000000000003'
      and recipient_audiences = array['guardian']::text[]
  ) then
    raise exception 'dual-role finance reminder was not restricted to guardian context';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', false);
create temporary table dual_role_finance_guardian_inbox as
select * from public.list_my_app_notifications('inbox', 'finance', 100, 'guardian');
create temporary table dual_role_finance_teacher_inbox as
select * from public.list_my_app_notifications('inbox', 'finance', 100, 'teacher');
reset role;

do $$
begin
  if not exists (
    select 1 from dual_role_finance_guardian_inbox
    where event_type = 'finance_charge_due_soon'
  ) then
    raise exception 'guardian portal did not receive the finance reminder';
  end if;
  if exists (
    select 1 from dual_role_finance_teacher_inbox
    where event_type = 'finance_charge_due_soon'
  ) then
    raise exception 'teacher portal exposed a guardian finance reminder';
  end if;
end;
$$;
