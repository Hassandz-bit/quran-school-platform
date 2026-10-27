-- Allow demo cleanup to remove attendance records that have linked guardian notification events.
-- The notification events are dependent records; retaining them after their attendance record
-- is deleted would leave invalid references and prevent safe demo cleanup.
alter table public.guardian_notification_events
  drop constraint if exists guardian_notification_events_record_fk;

alter table public.guardian_notification_events
  add constraint guardian_notification_events_record_fk
  foreign key (attendance_record_id)
  references public.attendance_records(id)
  on delete cascade;
