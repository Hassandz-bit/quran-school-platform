-- Minimal later-module relations for the focused Demo cleanup migration test.
-- Production definitions remain in migrations 024, 027, 028, 035, 040, 043, 059, and 067.
create table public.guardian_notification_events (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.students(id),
  attendance_session_id uuid not null references public.attendance_sessions(id),
  attendance_record_id uuid not null references public.attendance_records(id)
);
create table public.guardian_notification_deliveries (
  id uuid primary key,
  event_id uuid not null references public.guardian_notification_events(id) on delete cascade
);

create table public.school_track_results (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid references public.classes(id),
  student_id uuid not null references public.students(id)
);
create table public.school_track_result_history (
  id uuid primary key,
  school_id uuid not null,
  result_id uuid not null references public.school_track_results(id) on delete restrict
);

create table public.memorization_follow_up_notes (
  id uuid primary key,
  school_id uuid not null,
  class_id uuid not null references public.classes(id),
  student_id uuid not null references public.students(id),
  teacher_id uuid not null references public.teachers(id),
  source_record_id uuid references public.memorization_records(id)
);
create table public.memorization_follow_up_note_history (
  id uuid primary key,
  school_id uuid not null,
  follow_up_note_id uuid not null references public.memorization_follow_up_notes(id) on delete restrict,
  student_id uuid not null references public.students(id),
  teacher_id uuid not null references public.teachers(id)
);

create table public.official_receipts (
  id uuid primary key,
  school_id uuid not null,
  student_id uuid not null references public.students(id),
  payment_id uuid references public.payments(id),
  charge_id uuid references public.student_charges(id)
);
create table public.student_import_rows (
  id uuid primary key default gen_random_uuid(),
  duplicate_student_id uuid references public.students(id),
  created_student_id uuid references public.students(id)
);
create table public.document_records (
  id uuid primary key,
  school_id uuid not null,
  student_id uuid references public.students(id),
  object_path text
);

create table public.payroll_compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  teacher_id uuid references public.teachers(id)
);
create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  teacher_id uuid references public.teachers(id)
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  linked_teacher_id uuid references public.teachers(id)
);

create table public.demo_cleanup_unknown_refs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id)
);
