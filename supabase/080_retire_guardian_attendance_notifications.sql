-- QuranOS: retire guardian attendance notifications from both in-app and Web Push.
-- Attendance records remain unchanged; only their notification side effects are removed.
begin;

drop trigger if exists attendance_records_guardian_notification
  on public.attendance_records;
drop trigger if exists guardian_notification_events_app_center
  on public.guardian_notification_events;

-- Pending and historical attendance notification deliveries cascade with their events.
delete from public.guardian_notification_events;

-- These trigger functions are no longer part of the application notification flow.
drop function if exists public.queue_guardian_attendance_notification();
drop function if exists public.queue_guardian_attendance_app_notification();

commit;
