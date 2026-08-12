\set ON_ERROR_STOP on

-- Upgrade the shared memorization fixture to the production-era authorization/teacher
-- shape required by the payroll migration. These changes are test-only.
alter table public.teachers
  add constraint teachers_school_id_id_unique unique (school_id, id);

alter table public.roles add column name_ar text;
update public.roles
set name_ar = case code
  when 'teacher' then 'معلم'
  when 'academic_supervisor' then 'مشرف أكاديمي'
  when 'school_admin' then 'مدير المدرسة'
  else 'موظف'
end;
alter table public.roles alter column name_ar set not null;

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

revoke all on function public.current_profile_is_active() from public;
revoke all on function public.is_active_school_member(uuid) from public;
revoke all on function public.has_school_permission(uuid, text) from public;
revoke all on function public.has_branch_permission(uuid, uuid, text) from public;
grant execute on function public.current_profile_is_active() to authenticated;
grant execute on function public.is_active_school_member(uuid) to authenticated;
grant execute on function public.has_school_permission(uuid, text) to authenticated;
grant execute on function public.has_branch_permission(uuid, uuid, text) to authenticated;

-- Finance permissions used by the new module.
insert into public.permissions (id, code) values
  ('33000000-0000-4000-8000-000000000003', 'finance.view'),
  ('33000000-0000-4000-8000-000000000004', 'finance.manage'),
  ('33000000-0000-4000-8000-000000000005', 'finance.expenses');

insert into public.role_permissions (school_id, role_id, permission_id) values
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000005');

-- A second branch in School One and a branch-scoped finance officer let tests prove
-- that school-wide and branch-scoped payroll access remain distinct.
insert into public.branches (id, school_id, name, status) values
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Branch Three', 'active');

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000006', 'finance-branch@example.test');
insert into public.profiles (id, full_name, status) values
  ('30000000-0000-4000-8000-000000000006', 'Branch Finance User', 'active');
insert into public.school_memberships (id, school_id, profile_id, status) values
  ('31000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'active');
insert into public.roles (id, school_id, code, status, name_ar) values
  ('32000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'finance_officer', 'active', 'مسؤول مالي');
insert into public.role_permissions (school_id, role_id, permission_id) values
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000006', '33000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000006', '33000000-0000-4000-8000-000000000004');
insert into public.membership_roles (id, school_id, membership_id, role_id, branch_id) values
  ('34000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000006', '32000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001');

insert into public.teachers (id, school_id, branch_id, profile_id, first_name, last_name, status) values
  ('50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', null, 'Third', 'Teacher', 'active');
