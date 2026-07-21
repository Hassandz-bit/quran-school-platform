-- Restrict direct access to authorization helpers and add missing FK indexes.

begin;

revoke execute on function public.current_profile_is_active() from anon;
revoke execute on function public.current_profile_is_active() from public;
grant execute on function public.current_profile_is_active() to authenticated;

revoke execute on function public.is_active_school_member(uuid) from anon;
revoke execute on function public.is_active_school_member(uuid) from public;
grant execute on function public.is_active_school_member(uuid) to authenticated;

revoke execute on function public.has_any_active_membership() from anon;
revoke execute on function public.has_any_active_membership() from public;
grant execute on function public.has_any_active_membership() to authenticated;

revoke execute on function public.has_school_permission(uuid, text) from anon;
revoke execute on function public.has_school_permission(uuid, text) from public;
grant execute on function public.has_school_permission(uuid, text) to authenticated;

revoke execute on function public.has_branch_permission(uuid, uuid, text) from anon;
revoke execute on function public.has_branch_permission(uuid, uuid, text) from public;
grant execute on function public.has_branch_permission(uuid, uuid, text) to authenticated;

revoke execute on function public.can_view_profile(uuid) from anon;
revoke execute on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to authenticated;

create index if not exists classes_created_by_idx
  on public.classes (created_by);

create index if not exists students_created_by_idx
  on public.students (created_by);

create index if not exists students_school_branch_class_idx
  on public.students (school_id, branch_id, class_id);

commit;
