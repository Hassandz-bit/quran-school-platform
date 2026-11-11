-- Supplemental schema for the smart learning follow-up migration test.
alter table public.memorization_records
  add column session_type text,
  add column surah_number smallint,
  add column ayah_start smallint,
  add column ayah_end smallint,
  add column recitation_result text;

create table public.memorization_follow_up_notes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  surah_number smallint not null,
  ayah_start smallint not null,
  ayah_end smallint not null,
  status text not null,
  observed_on date not null
);

create table public.attendance_sessions (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  session_date date not null
);

create table public.attendance_records (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status text not null
);

create or replace function public.can_access_attendance_class(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_permission_code in ('attendance.view','attendance.manage')
    and public.can_access_memorization_class(
      target_school_id,target_branch_id,target_class_id,'memorization.view'
    );
$$;

create table public.student_guardians (
  school_id uuid not null,
  student_id uuid not null,
  guardian_profile_id uuid not null,
  status text not null
);

create or replace function public.is_active_guardian_of_student(
  target_school_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_guardians g
    where g.school_id = target_school_id
      and g.student_id = target_student_id
      and g.guardian_profile_id = (select auth.uid())
      and g.status = 'active'
  );
$$;
