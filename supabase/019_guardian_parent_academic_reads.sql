-- Quran School SaaS - parent academic read RPCs
-- Guardian / Parent Portal PR C only. Read-only access to the guardian's own
-- active children, attendance, and memorization. No finance and no core RLS widening.

begin;

create or replace function public.list_my_guardian_students()
returns table (
  school_id uuid,
  school_name text,
  student_id uuid,
  student_first_name text,
  student_last_name text,
  branch_id uuid,
  branch_name text,
  class_id uuid,
  class_name text,
  relationship_type text,
  is_primary boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  return query
  select
    school.id,
    school.name,
    student.id,
    student.first_name,
    student.last_name,
    branch.id,
    branch.name,
    student.class_id,
    target_class.name,
    relationship.relationship_type,
    relationship.is_primary
  from public.student_guardians as relationship
  join public.profiles as guardian_profile
    on guardian_profile.id = relationship.guardian_profile_id
   and guardian_profile.status = 'active'
  join public.schools as school
    on school.id = relationship.school_id
   and school.status = 'active'
  join public.students as student
    on student.school_id = relationship.school_id
   and student.id = relationship.student_id
   and student.status not in ('transferred', 'graduated', 'withdrawn')
  join public.branches as branch
    on branch.school_id = student.school_id
   and branch.id = student.branch_id
  left join public.classes as target_class
    on target_class.school_id = student.school_id
   and target_class.branch_id = student.branch_id
   and target_class.id = student.class_id
  where relationship.guardian_profile_id = (select auth.uid())
    and relationship.status = 'active'
  order by school.name, student.first_name, student.last_name, student.id;
end;
$$;

comment on function public.list_my_guardian_students() is
  'Returns only students currently reachable through the caller active guardian relationships. No school membership is required.';

create or replace function public.get_my_guardian_student_attendance_summary(
  target_school_id uuid,
  target_student_id uuid
)
returns table (
  total_records bigint,
  present_count bigint,
  absent_count bigint,
  late_count bigint,
  excused_absence_count bigint,
  last_session_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_school_id is null
    or target_student_id is null
    or not public.is_active_guardian_of_student(
      target_school_id,
      target_student_id
    )
  then
    raise exception using errcode = '42501', message = 'student access denied';
  end if;

  return query
  select
    count(record.id)::bigint,
    count(*) filter (where record.status = 'present')::bigint,
    count(*) filter (where record.status = 'absent')::bigint,
    count(*) filter (where record.status = 'late')::bigint,
    count(*) filter (where record.status = 'excused_absence')::bigint,
    max(session.session_date)
  from public.attendance_records as record
  join public.attendance_sessions as session
    on session.school_id = record.school_id
   and session.branch_id = record.branch_id
   and session.class_id = record.class_id
   and session.id = record.session_id
  where record.school_id = target_school_id
    and record.student_id = target_student_id;
end;
$$;

create or replace function public.list_my_guardian_student_attendance(
  target_school_id uuid,
  target_student_id uuid,
  target_limit integer default 30
)
returns table (
  attendance_record_id uuid,
  session_date date,
  attendance_status text,
  arrival_time time without time zone
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_limit is null or target_limit < 1 or target_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid attendance limit';
  end if;

  if target_school_id is null
    or target_student_id is null
    or not public.is_active_guardian_of_student(
      target_school_id,
      target_student_id
    )
  then
    raise exception using errcode = '42501', message = 'student access denied';
  end if;

  return query
  select
    record.id,
    session.session_date,
    record.status,
    record.arrival_time
  from public.attendance_records as record
  join public.attendance_sessions as session
    on session.school_id = record.school_id
   and session.branch_id = record.branch_id
   and session.class_id = record.class_id
   and session.id = record.session_id
  where record.school_id = target_school_id
    and record.student_id = target_student_id
  order by session.session_date desc, record.id desc
  limit target_limit;
end;
$$;

create or replace function public.get_my_guardian_student_memorization_summary(
  target_school_id uuid,
  target_student_id uuid
)
returns table (
  total_records bigint,
  average_rating numeric,
  total_errors bigint,
  last_record_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_school_id is null
    or target_student_id is null
    or not public.is_active_guardian_of_student(
      target_school_id,
      target_student_id
    )
  then
    raise exception using errcode = '42501', message = 'student access denied';
  end if;

  return query
  select
    count(record.id)::bigint,
    round(avg(record.rating)::numeric, 2),
    coalesce(sum(record.errors_count), 0)::bigint,
    max(record.record_date)
  from public.memorization_records as record
  where record.school_id = target_school_id
    and record.student_id = target_student_id;
end;
$$;

create or replace function public.list_my_guardian_student_memorization(
  target_school_id uuid,
  target_student_id uuid,
  target_limit integer default 20
)
returns table (
  memorization_record_id uuid,
  record_date date,
  session_type text,
  surah_number smallint,
  ayah_start smallint,
  ayah_end smallint,
  rating smallint,
  errors_count smallint,
  next_assignment text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_limit is null or target_limit < 1 or target_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid memorization limit';
  end if;

  if target_school_id is null
    or target_student_id is null
    or not public.is_active_guardian_of_student(
      target_school_id,
      target_student_id
    )
  then
    raise exception using errcode = '42501', message = 'student access denied';
  end if;

  return query
  select
    record.id,
    record.record_date,
    record.session_type,
    record.surah_number,
    record.ayah_start,
    record.ayah_end,
    record.rating,
    record.errors_count,
    record.next_assignment
  from public.memorization_records as record
  where record.school_id = target_school_id
    and record.student_id = target_student_id
  order by record.record_date desc, record.created_at desc, record.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_my_guardian_students()
from public, anon;
grant execute on function public.list_my_guardian_students()
to authenticated;

revoke all on function public.get_my_guardian_student_attendance_summary(uuid, uuid)
from public, anon;
grant execute on function public.get_my_guardian_student_attendance_summary(uuid, uuid)
to authenticated;

revoke all on function public.list_my_guardian_student_attendance(uuid, uuid, integer)
from public, anon;
grant execute on function public.list_my_guardian_student_attendance(uuid, uuid, integer)
to authenticated;

revoke all on function public.get_my_guardian_student_memorization_summary(uuid, uuid)
from public, anon;
grant execute on function public.get_my_guardian_student_memorization_summary(uuid, uuid)
to authenticated;

revoke all on function public.list_my_guardian_student_memorization(uuid, uuid, integer)
from public, anon;
grant execute on function public.list_my_guardian_student_memorization(uuid, uuid, integer)
to authenticated;

commit;
