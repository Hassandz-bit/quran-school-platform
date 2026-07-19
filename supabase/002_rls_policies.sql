-- Quran School SaaS - reviewed RLS policies (phase 1)
-- Run after supabase-schema.sql and seed-data.sql.
-- The browser uses only the anon/publishable key. Never expose service_role/secret keys.

begin;

-- Security-definer helpers avoid recursive RLS evaluation. Every relation is
-- schema-qualified and search_path is empty.
create or replace function public.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

create or replace function public.is_active_school_member(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_profile_is_active()
    and exists (
      select 1
      from public.school_memberships sm
      join public.schools s on s.id = sm.school_id
      where sm.school_id = target_school_id
        and sm.profile_id = (select auth.uid())
        and sm.status = 'active'
        and s.status = 'active'
    );
$$;

create or replace function public.has_any_active_membership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_memberships sm
    join public.schools s on s.id = sm.school_id
    where sm.profile_id = (select auth.uid())
      and sm.status = 'active'
      and s.status = 'active'
      and public.current_profile_is_active()
  );
$$;

-- School-wide permission only. Branch-scoped assignments do not grant school-wide access.
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
    and exists (
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
    );
$$;

-- Branch permission accepts a school-wide grant or a grant scoped to the same branch.
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
      from public.school_memberships sm
      join public.membership_roles mr
        on mr.school_id = sm.school_id and mr.membership_id = sm.id
      join public.roles r
        on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
      join public.role_permissions rp
        on rp.school_id = r.school_id and rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      join public.branches b
        on b.school_id = target_school_id and b.id = target_branch_id
      where sm.school_id = target_school_id
        and sm.profile_id = (select auth.uid())
        and sm.status = 'active'
        and (mr.branch_id is null or mr.branch_id = target_branch_id)
        and p.code = target_permission_code
    );
$$;

-- Used only to display profiles of members in schools the viewer may administer.
create or replace function public.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.school_memberships target_membership
      where target_membership.profile_id = target_profile_id
        and target_membership.status <> 'revoked'
        and public.has_school_permission(target_membership.school_id, 'members.view')
        and public.has_school_permission(target_membership.school_id, 'profiles.view')
    );
$$;

revoke all on function public.current_profile_is_active() from public;
revoke all on function public.is_active_school_member(uuid) from public;
revoke all on function public.has_any_active_membership() from public;
revoke all on function public.has_school_permission(uuid, text) from public;
revoke all on function public.has_branch_permission(uuid, uuid, text) from public;
revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.current_profile_is_active() to authenticated;
grant execute on function public.is_active_school_member(uuid) to authenticated;
grant execute on function public.has_any_active_membership() to authenticated;
grant execute on function public.has_school_permission(uuid, text) to authenticated;
grant execute on function public.has_branch_permission(uuid, uuid, text) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;

alter table public.schools enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.school_memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;

-- Remove broad privileges first, then grant only the required operations/columns.
revoke all on public.schools, public.branches, public.profiles,
  public.school_memberships, public.roles, public.permissions,
  public.role_permissions, public.membership_roles from public, anon, authenticated;

grant select on public.schools to authenticated;
grant update (name, slug, default_locale, timezone) on public.schools to authenticated;

grant select, insert, delete on public.branches to authenticated;
grant update (name, code, status, is_main) on public.branches to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, phone, locale) on public.profiles to authenticated;

grant select, insert, delete on public.school_memberships to authenticated;
grant update (status, joined_at) on public.school_memberships to authenticated;

grant select, insert, delete on public.roles to authenticated;
grant update (code, name_ar, description, status) on public.roles to authenticated;

grant select on public.permissions to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.membership_roles to authenticated;

-- SCHOOLS: active members can read their tenant; only school-wide authorized admins update it.
create policy schools_select_member on public.schools
for select to authenticated
using (public.is_active_school_member(id));

create policy schools_update_authorized on public.schools
for update to authenticated
using (public.has_school_permission(id, 'school.update'))
with check (public.has_school_permission(id, 'school.update'));

-- Intentionally no school INSERT/DELETE policy: tenant bootstrap is trusted-only.

-- BRANCHES: members can read their school's branches. A branch-scoped manager may
-- modify only the branch matching the assignment; creating a new branch is school-wide only.
create policy branches_select_member on public.branches
for select to authenticated
using (public.is_active_school_member(school_id));

create policy branches_insert_authorized on public.branches
for insert to authenticated
with check (public.has_school_permission(school_id, 'branches.manage'));

create policy branches_update_authorized on public.branches
for update to authenticated
using (public.has_branch_permission(school_id, id, 'branches.manage'))
with check (public.has_branch_permission(school_id, id, 'branches.manage'));

create policy branches_delete_authorized on public.branches
for delete to authenticated
using (public.has_branch_permission(school_id, id, 'branches.manage'));

-- PROFILES: active users see/update self. School-wide membership administrators may read,
-- but cannot change status or identity columns through the browser.
create policy profiles_select_authorized on public.profiles
for select to authenticated
using (public.current_profile_is_active() and public.can_view_profile(id));

create policy profiles_update_self on public.profiles
for update to authenticated
using (public.current_profile_is_active() and id = (select auth.uid()))
with check (public.current_profile_is_active() and id = (select auth.uid()));

-- Profile creation and status changes are trusted operations only.

-- MEMBERSHIPS: ordinary users see only their own rows. School-wide member administrators
-- manage memberships for their school. Branch-scoped roles do not receive school-wide rights.
create policy memberships_select_own_or_authorized on public.school_memberships
for select to authenticated
using (
  public.current_profile_is_active()
  and (
    profile_id = (select auth.uid())
    or public.has_school_permission(school_id, 'members.view')
  )
);

create policy memberships_insert_authorized on public.school_memberships
for insert to authenticated
with check (public.has_school_permission(school_id, 'members.manage'));

create policy memberships_update_authorized on public.school_memberships
for update to authenticated
using (public.has_school_permission(school_id, 'members.manage'))
with check (public.has_school_permission(school_id, 'members.manage'));

create policy memberships_delete_authorized on public.school_memberships
for delete to authenticated
using (public.has_school_permission(school_id, 'members.manage'));

-- ROLES: all active members can read tenant roles. Only school-wide roles.manage mutates them.
create policy roles_select_member on public.roles
for select to authenticated
using (public.is_active_school_member(school_id));

create policy roles_insert_authorized on public.roles
for insert to authenticated
with check (public.has_school_permission(school_id, 'roles.manage'));

create policy roles_update_authorized on public.roles
for update to authenticated
using (public.has_school_permission(school_id, 'roles.manage'))
with check (public.has_school_permission(school_id, 'roles.manage'));

create policy roles_delete_authorized on public.roles
for delete to authenticated
using (public.has_school_permission(school_id, 'roles.manage') and not is_system);

-- PERMISSIONS: immutable from the browser. Reading requires at least one active membership.
create policy permissions_select_active_member on public.permissions
for select to authenticated
using (public.has_any_active_membership());

-- ROLE PERMISSIONS: tenant members may inspect grants. School-wide role administrators mutate them.
create policy role_permissions_select_member on public.role_permissions
for select to authenticated
using (public.is_active_school_member(school_id));

create policy role_permissions_insert_authorized on public.role_permissions
for insert to authenticated
with check (public.has_school_permission(school_id, 'roles.manage'));

create policy role_permissions_update_authorized on public.role_permissions
for update to authenticated
using (public.has_school_permission(school_id, 'roles.manage'))
with check (public.has_school_permission(school_id, 'roles.manage'));

create policy role_permissions_delete_authorized on public.role_permissions
for delete to authenticated
using (public.has_school_permission(school_id, 'roles.manage'));

-- MEMBERSHIP ROLES: users see their own assignments. School-wide administrators see all;
-- branch-scoped viewers see assignments scoped to their own authorized branch only.
create policy membership_roles_select_own_or_authorized on public.membership_roles
for select to authenticated
using (
  public.current_profile_is_active()
  and (
    exists (
      select 1 from public.school_memberships own_membership
      where own_membership.id = membership_id
        and own_membership.profile_id = (select auth.uid())
        and own_membership.status = 'active'
    )
    or public.has_school_permission(school_id, 'members.view')
    or (
      branch_id is not null
      and public.has_branch_permission(school_id, branch_id, 'members.view')
    )
  )
);

create policy membership_roles_insert_authorized on public.membership_roles
for insert to authenticated
with check (
  (branch_id is null and public.has_school_permission(school_id, 'members.assign_roles'))
  or
  (branch_id is not null and public.has_branch_permission(school_id, branch_id, 'members.assign_roles'))
);

create policy membership_roles_update_authorized on public.membership_roles
for update to authenticated
using (
  (branch_id is null and public.has_school_permission(school_id, 'members.assign_roles'))
  or
  (branch_id is not null and public.has_branch_permission(school_id, branch_id, 'members.assign_roles'))
)
with check (
  (branch_id is null and public.has_school_permission(school_id, 'members.assign_roles'))
  or
  (branch_id is not null and public.has_branch_permission(school_id, branch_id, 'members.assign_roles'))
);

create policy membership_roles_delete_authorized on public.membership_roles
for delete to authenticated
using (
  (branch_id is null and public.has_school_permission(school_id, 'members.assign_roles'))
  or
  (branch_id is not null and public.has_branch_permission(school_id, branch_id, 'members.assign_roles'))
);

commit;
