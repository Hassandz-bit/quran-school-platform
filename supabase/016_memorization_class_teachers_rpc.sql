-- Quran School SaaS - scoped memorization class teacher RPC
-- This migration is committed for review only. Do not apply it to production manually.

begin;

create or replace function public.list_memorization_class_teachers(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid
)
returns table (
  id uuid,
  profile_id uuid,
  first_name text,
  last_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    teacher.id,
    teacher.profile_id,
    teacher.first_name,
    teacher.last_name
  from public.classes as target_class
  join public.class_teachers as class_teacher
    on class_teacher.school_id = target_class.school_id
   and class_teacher.branch_id = target_class.branch_id
   and class_teacher.class_id = target_class.id
   and class_teacher.status = 'active'
  join public.teachers as teacher
    on teacher.school_id = class_teacher.school_id
   and teacher.branch_id = class_teacher.branch_id
   and teacher.id = class_teacher.teacher_id
   and teacher.status = 'active'
  where target_class.school_id = target_school_id
    and target_class.branch_id = target_branch_id
    and target_class.id = target_class_id
    and target_class.status = 'active'
    and (
      public.can_access_memorization_class(
        target_school_id,
        target_branch_id,
        target_class_id,
        'memorization.view'
      )
      or public.can_access_memorization_class(
        target_school_id,
        target_branch_id,
        target_class_id,
        'memorization.manage'
      )
    )
  order by teacher.last_name asc, teacher.first_name asc, teacher.id asc;
$$;

revoke all on function public.list_memorization_class_teachers(uuid, uuid, uuid)
from public;
revoke execute on function public.list_memorization_class_teachers(uuid, uuid, uuid)
from anon;
grant execute on function public.list_memorization_class_teachers(uuid, uuid, uuid)
to authenticated;

commit;
