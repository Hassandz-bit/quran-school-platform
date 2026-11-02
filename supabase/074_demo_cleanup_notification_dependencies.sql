-- Keep notification events derived from demo attendance inside the demo lifecycle.
-- The attendance notification trigger creates events for absent demo records even
-- when no guardian is linked. Those events reference attendance_records and block
-- the demo cleanup unless removed before the parent attendance row.
begin;

create or replace function public.cleanup_demo_attendance_notification_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.demo_seed_records as demo_record
    where demo_record.school_id = old.school_id
      and demo_record.entity_type = 'attendance_record'
      and demo_record.record_id = old.id
  ) then
    delete from public.guardian_notification_events as event
    where event.school_id = old.school_id
      and event.attendance_record_id = old.id;
  end if;

  return old;
end;
$$;

revoke all on function public.cleanup_demo_attendance_notification_events()
from public, anon, authenticated;

drop trigger if exists attendance_records_cleanup_demo_notifications
on public.attendance_records;

create trigger attendance_records_cleanup_demo_notifications
before delete on public.attendance_records
for each row
execute function public.cleanup_demo_attendance_notification_events();

comment on function public.cleanup_demo_attendance_notification_events() is
  'Deletes guardian notification events only when their source attendance record is tracked as demo data; delivery rows cascade with the event.';

commit;
