-- Quran School SaaS - secure finance student directory
-- Exposes only the student fields required by finance workflows.

begin;

create or replace function public.list_finance_students(target_school_id uuid)
returns table (
  id uuid,
  branch_id uuid,
  first_name text,
  last_name text,
  guardian_name text,
  guardian_phone text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    student.id,
    student.branch_id,
    student.first_name,
    student.last_name,
    student.guardian_name,
    student.guardian_phone,
    student.status
  from public.students as student
  where (select auth.uid()) is not null
    and student.school_id = target_school_id
    and (
      public.has_branch_permission(
        student.school_id,
        student.branch_id,
        'finance.view'
      )
      or public.has_branch_permission(
        student.school_id,
        student.branch_id,
        'finance.manage'
      )
    )
  order by student.last_name, student.first_name, student.id;
$$;

revoke all on function public.list_finance_students(uuid)
from public, anon, authenticated;

grant execute on function public.list_finance_students(uuid)
to authenticated;

comment on function public.list_finance_students(uuid) is
  'Exposes the minimum student data required by finance, limited to branches where the caller has finance.view or finance.manage.';

commit;
