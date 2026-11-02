-- Minimal FK-faithful notification tables for the demo cleanup integration test.
-- The production tables are introduced by migrations 024/025; this isolated test
-- double models the restrictive attendance-record FK and cascading deliveries.
create table public.guardian_notification_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.students(id),
  attendance_session_id uuid not null references public.attendance_sessions(id),
  attendance_record_id uuid not null references public.attendance_records(id),
  event_type text not null default 'absence_confirmed',
  unique (attendance_record_id, event_type)
);

create table public.guardian_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.guardian_notification_events(id) on delete cascade
);
