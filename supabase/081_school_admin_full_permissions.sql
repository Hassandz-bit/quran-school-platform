-- Ensure a school-wide school_admin assignment has every school and branch permission.
-- This is intentionally limited to the school_admin role with branch_id IS NULL.
-- Branch-scoped staff continue to require explicit role_permissions grants.

begin;

create or replace function public.has_school_permission(
  target_school_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_school_member(target_school_id)
    and (
      exists (
        select 1
        from public.school_memberships sm
        join public.membership_roles mr
          on mr.school_id = sm.school_id and mr.membership_id = sm.id
        join public.roles r
          on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        where sm.school_id = target_school_id
          and sm.profile_id = (select auth.uid())
          and sm.status = 'active'
          and mr.branch_id is null
          and r.code = 'school_admin'
      )
      or exists (
        select 1
        from public.school_memberships sm
        join public.membership_roles mr
          on mr.school_id = sm.school_id and mr.membership_id = sm.id
        join public.roles r
          on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        join public.role_permissions rp
          on rp.school_id = r.school_id and rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where sm.school_id = target_school_id
          and sm.profile_id = (select auth.uid())
          and sm.status = 'active'
          and mr.branch_id is null
          and p.code = target_permission_code
      )
    );
$$;

create or replace function public.has_branch_permission(
  target_school_id uuid,
  target_branch_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.branches b
      where b.school_id = target_school_id
        and b.id = target_branch_id
    )
    and (
      exists (
        select 1
        from public.school_memberships sm
        join public.membership_roles mr
          on mr.school_id = sm.school_id and mr.membership_id = sm.id
        join public.roles r
          on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        where sm.school_id = target_school_id
          and sm.profile_id = (select auth.uid())
          and sm.status = 'active'
          and mr.branch_id is null
          and r.code = 'school_admin'
      )
      or exists (
        select 1
        from public.school_memberships sm
        join public.membership_roles mr
          on mr.school_id = sm.school_id and mr.membership_id = sm.id
        join public.roles r
          on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        join public.role_permissions rp
          on rp.school_id = r.school_id and rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where sm.school_id = target_school_id
          and sm.profile_id = (select auth.uid())
          and sm.status = 'active'
          and (mr.branch_id is null or mr.branch_id = target_branch_id)
          and p.code = target_permission_code
      )
    );
$$;

revoke all on function public.has_school_permission(uuid, text) from public;
revoke all on function public.has_branch_permission(uuid, uuid, text) from public;
revoke all on function public.has_school_permission(uuid, text) from anon;
revoke all on function public.has_branch_permission(uuid, uuid, text) from anon;
grant execute on function public.has_school_permission(uuid, text) to authenticated;
grant execute on function public.has_branch_permission(uuid, uuid, text) to authenticated;

commit;
