-- QuranOS: remove student, memorization/learning and attendance notifications.
-- These remain core academic records and workflows; they are not notification categories.
begin;

-- Stop generating in-app guardian notifications from attendance events.
drop trigger if exists guardian_notification_events_app_center
  on public.guardian_notification_events;

-- Remove existing notifications and campaign history for the retired categories.
delete from public.app_notifications
where category in ('students', 'learning', 'attendance');

delete from public.notification_campaigns
where category in ('students', 'learning', 'attendance');

-- Enforce the reduced category set at the database boundary, not only in the UI.
alter table public.app_notifications
  drop constraint if exists app_notifications_category_check;
alter table public.app_notifications
  add constraint app_notifications_category_check
  check (category in (
    'administration', 'teachers', 'finance', 'guardians', 'system'
  ));

alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_category_check;
alter table public.notification_campaigns
  add constraint notification_campaigns_category_check
  check (category in (
    'administration', 'teachers', 'finance', 'guardians', 'system'
  ));

commit;
