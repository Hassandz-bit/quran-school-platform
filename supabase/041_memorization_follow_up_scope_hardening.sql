-- Quran School SaaS - harden memorization follow-up status scope
-- V2 review migration only. Do not apply to Production manually.
-- Removes note-existence distinctions outside the student's current class scope while
-- preserving access to historical notes after a same-school class transfer.

begin;

create or replace function public.set_memorization_follow_up_note_status(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_note_id uuid,
  target_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_student_id uuid;
  current_status text;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_AUTH_REQUIRED';
  end if;

  if target_status is null or target_status not in ('open', 'improved', 'resolved') then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_STATUS_INVALID';
  end if;

  if not public.can_access_memorization_class(
    target_school_id,
    target_branch_id,
    target_class_id,
    'memorization.manage'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_MANAGE_REQUIRED';
  end if;

  select note.student_id, note.status
    into target_student_id, current_status
  from public.memorization_follow_up_notes as note
  join public.students as student
    on student.id = note.student_id
   and student.school_id = target_school_id
   and student.branch_id = target_branch_id
   and student.class_id = target_class_id
   and student.status = 'active'
  where note.id = target_note_id
    and note.school_id = target_school_id
  for update of note, student;

  if not found then
    return false;
  end if;

  if current_status = target_status then
    return true;
  end if;

  update public.memorization_follow_up_notes
  set status = target_status
  where id = target_note_id
    and school_id = target_school_id
    and student_id = target_student_id;

  return found;
end;
$$;

revoke all on function public.set_memorization_follow_up_note_status(
  uuid, uuid, uuid, uuid, text
) from public;
revoke execute on function public.set_memorization_follow_up_note_status(
  uuid, uuid, uuid, uuid, text
) from anon;
grant execute on function public.set_memorization_follow_up_note_status(
  uuid, uuid, uuid, uuid, text
) to authenticated;

commit;
