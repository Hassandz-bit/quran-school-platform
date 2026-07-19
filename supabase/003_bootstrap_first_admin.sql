-- Quran School SaaS
-- 003_bootstrap_first_admin.sql
--
-- Purpose:
--   Link one existing Supabase Auth user to "مدرسة النور القرآنية"
--   and grant the school-wide "school_admin" role.
--
-- Before execution, replace exactly:
--   __AUTH_USER_ID__  -> the existing auth.users UUID
--
-- This script does NOT create an Auth user, email, password, or modify RLS.

begin;

do $bootstrap$
declare
  v_auth_user_id_text constant text := '__AUTH_USER_ID__';
  v_auth_user_id uuid;
  v_school_id uuid;
  v_main_branch_id uuid;
  v_school_admin_role_id uuid;
  v_membership_id uuid;
  v_match_count integer;
begin
  -- Fail before touching data when the required placeholder was not replaced.
  if v_auth_user_id_text = '__AUTH_USER_ID__' then
    raise exception using
      message = 'BOOTSTRAP_STOP: replace __AUTH_USER_ID__ with the existing Auth user UUID before execution.';
  end if;

  begin
    v_auth_user_id := v_auth_user_id_text::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        message = 'BOOTSTRAP_STOP: __AUTH_USER_ID__ must be a valid UUID.';
  end;

  -- The user must already exist in Supabase Auth. This script never creates it.
  select count(*)
    into v_match_count
  from auth.users as auth_user
  where auth_user.id = v_auth_user_id;

  if v_match_count = 0 then
    raise exception using
      message = 'BOOTSTRAP_STOP: no auth.users row matches the supplied UUID.';
  end if;

  -- Resolve exactly one seeded school by its current canonical name.
  select count(*)
    into v_match_count
  from public.schools as school
  where btrim(school.name) = 'مدرسة النور القرآنية';

  if v_match_count = 0 then
    raise exception using
      message = 'BOOTSTRAP_STOP: مدرسة النور القرآنية was not found.';
  elsif v_match_count > 1 then
    raise exception using
      message = 'BOOTSTRAP_STOP: more than one school named مدرسة النور القرآنية was found.';
  end if;

  select school.id
    into strict v_school_id
  from public.schools as school
  where btrim(school.name) = 'مدرسة النور القرآنية';

  -- Verify the single main branch belonging to the resolved school.
  select count(*)
    into v_match_count
  from public.branches as branch
  where branch.school_id = v_school_id
    and branch.is_main = true;

  if v_match_count = 0 then
    raise exception using
      message = 'BOOTSTRAP_STOP: no main branch was found for مدرسة النور القرآنية.';
  elsif v_match_count > 1 then
    raise exception using
      message = 'BOOTSTRAP_STOP: more than one main branch was found for مدرسة النور القرآنية.';
  end if;

  select branch.id
    into strict v_main_branch_id
  from public.branches as branch
  where branch.school_id = v_school_id
    and branch.is_main = true;

  -- Resolve exactly one active school_admin role inside this same school.
  select count(*)
    into v_match_count
  from public.roles as role
  where role.school_id = v_school_id
    and role.code = 'school_admin'
    and role.status = 'active';

  if v_match_count = 0 then
    raise exception using
      message = 'BOOTSTRAP_STOP: school_admin role was not found in مدرسة النور القرآنية.';
  elsif v_match_count > 1 then
    raise exception using
      message = 'BOOTSTRAP_STOP: more than one school_admin role was found in مدرسة النور القرآنية.';
  end if;

  select role.id
    into strict v_school_admin_role_id
  from public.roles as role
  where role.school_id = v_school_id
    and role.code = 'school_admin'
    and role.status = 'active';

  -- profiles.full_name is NOT NULL in 001. Existing names are preserved.
  insert into public.profiles as profile (
    id,
    full_name,
    locale,
    status
  )
  values (
    v_auth_user_id,
    'مدير المدرسة الأول',
    'ar',
    'active'
  )
  on conflict (id) do update
  set status = 'active',
      updated_at = timezone('utc', now());

  -- Make the membership active. joined_at is required for active memberships.
  insert into public.school_memberships as membership (
    school_id,
    profile_id,
    status,
    joined_at
  )
  values (
    v_school_id,
    v_auth_user_id,
    'active',
    timezone('utc', now())
  )
  on conflict (school_id, profile_id) do update
  set status = 'active',
      joined_at = coalesce(membership.joined_at, excluded.joined_at),
      updated_at = timezone('utc', now())
  returning membership.id into v_membership_id;

  -- The schema scopes roles through membership_roles.branch_id.
  -- NULL means school-wide, which is correct for school_admin.
  insert into public.membership_roles as membership_role (
    school_id,
    membership_id,
    role_id,
    branch_id
  )
  values (
    v_school_id,
    v_membership_id,
    v_school_admin_role_id,
    null
  )
  on conflict (membership_id, role_id) where branch_id is null do update
  set school_id = excluded.school_id,
      branch_id = null,
      updated_at = timezone('utc', now());

  -- v_main_branch_id is intentionally verified but not written to the assignment:
  -- school_admin is school-wide, so membership_roles.branch_id remains NULL.
  perform v_main_branch_id;
end;
$bootstrap$;

commit;

-- Verification 1: application profile (no Auth credentials are selected).
select
  profile.id,
  profile.full_name,
  profile.locale,
  profile.status,
  profile.created_at,
  profile.updated_at
from public.profiles as profile
where profile.id = '__AUTH_USER_ID__'::uuid;

-- Verification 2: active membership, school name, and the school's main branch.
select
  membership.id as membership_id,
  membership.profile_id,
  membership.status as membership_status,
  membership.joined_at,
  school.id as school_id,
  school.name as school_name,
  main_branch.id as main_branch_id,
  main_branch.name as main_branch_name
from public.school_memberships as membership
join public.schools as school
  on school.id = membership.school_id
left join public.branches as main_branch
  on main_branch.school_id = school.id
 and main_branch.is_main = true
where membership.profile_id = '__AUTH_USER_ID__'::uuid
  and btrim(school.name) = 'مدرسة النور القرآنية';

-- Verification 3: assigned role and scope. assigned_branch_name must be NULL
-- because school_admin is deliberately granted at school level.
select
  membership_role.id as membership_role_id,
  membership_role.membership_id,
  role.id as role_id,
  role.code as role_code,
  role.name_ar as role_name,
  school.name as school_name,
  membership_role.branch_id,
  assigned_branch.name as assigned_branch_name,
  case
    when membership_role.branch_id is null then 'school_wide'
    else 'branch_scoped'
  end as assignment_scope
from public.membership_roles as membership_role
join public.school_memberships as membership
  on membership.school_id = membership_role.school_id
 and membership.id = membership_role.membership_id
join public.roles as role
  on role.school_id = membership_role.school_id
 and role.id = membership_role.role_id
join public.schools as school
  on school.id = membership_role.school_id
left join public.branches as assigned_branch
  on assigned_branch.school_id = membership_role.school_id
 and assigned_branch.id = membership_role.branch_id
where membership.profile_id = '__AUTH_USER_ID__'::uuid
  and role.code = 'school_admin'
  and membership_role.branch_id is null;
