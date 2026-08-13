-- QuranOS V2 - manage employment jobs from Finance > Payroll
-- V2 only. Production remains unchanged until the release gate is approved.

begin;

create or replace function public.list_payroll_staff_candidates(
  target_school_id uuid,
  target_branch_id uuid default null
)
returns table (
  membership_id uuid,
  profile_id uuid,
  teacher_id uuid,
  full_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_VIEW_REQUIRED';
  end if;

  return query
  select
    membership.id,
    profile.id,
    teacher.id,
    profile.full_name
  from public.school_memberships as membership
  join public.profiles as profile
    on profile.id = membership.profile_id
   and profile.status = 'active'
  left join lateral (
    select candidate_teacher.id
    from public.teachers as candidate_teacher
    where candidate_teacher.school_id = membership.school_id
      and candidate_teacher.profile_id = membership.profile_id
      and candidate_teacher.status <> 'archived'
      and candidate_teacher.branch_id is not distinct from target_branch_id
    order by candidate_teacher.created_at, candidate_teacher.id
    limit 1
  ) as teacher on true
  where membership.school_id = target_school_id
    and membership.status = 'active'
    and exists (
      select 1
      from public.membership_roles as membership_role
      join public.roles as role
        on role.school_id = membership_role.school_id
       and role.id = membership_role.role_id
       and role.status = 'active'
      where membership_role.school_id = membership.school_id
        and membership_role.membership_id = membership.id
        and (
          (target_branch_id is null and membership_role.branch_id is null)
          or (target_branch_id is not null and (
            membership_role.branch_id is null
            or membership_role.branch_id = target_branch_id
          ))
        )
    )
  order by profile.full_name, membership.id;
end;
$$;

create or replace function public.list_payroll_staff(
  target_school_id uuid,
  target_branch_id uuid default null
)
returns table (
  position_id uuid,
  membership_id uuid,
  profile_id uuid,
  teacher_id uuid,
  full_name text,
  branch_id uuid,
  branch_name text,
  job_code text,
  custom_job_title text,
  status text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_VIEW_REQUIRED';
  end if;

  return query
  select
    position.id,
    membership.id,
    profile.id,
    teacher.id,
    profile.full_name,
    position.branch_id,
    branch.name,
    position.job_code,
    position.custom_job_title,
    position.status,
    position.updated_at
  from public.staff_positions as position
  join public.school_memberships as membership
    on membership.school_id = position.school_id
   and membership.id = position.membership_id
  join public.profiles as profile on profile.id = membership.profile_id
  left join lateral (
    select candidate_teacher.id
    from public.teachers as candidate_teacher
    where candidate_teacher.school_id = membership.school_id
      and candidate_teacher.profile_id = membership.profile_id
      and candidate_teacher.status <> 'archived'
      and candidate_teacher.branch_id is not distinct from position.branch_id
    order by candidate_teacher.created_at, candidate_teacher.id
    limit 1
  ) as teacher on true
  left join public.branches as branch
    on branch.school_id = position.school_id
   and branch.id = position.branch_id
  where position.school_id = target_school_id
    and position.branch_id is not distinct from target_branch_id
    and position.status = 'active'
    and membership.status = 'active'
    and profile.status = 'active'
  order by profile.full_name, position.id;
end;
$$;

create or replace function public.upsert_payroll_staff_position(
  target_school_id uuid,
  target_membership_id uuid,
  target_job_code text,
  target_custom_job_title text default null,
  target_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  position_id uuid;
  existing_branch_id uuid;
  normalized_custom_title text := nullif(btrim(target_custom_job_title), '');
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_MANAGE_REQUIRED';
  end if;

  if target_job_code not in (
    'manager', 'deputy_manager', 'bursar', 'teacher',
    'guard', 'cleaner', 'driver', 'other'
  ) or (target_job_code = 'other' and (
    normalized_custom_title is null
    or char_length(normalized_custom_title) not between 2 and 100
  )) or (target_job_code <> 'other' and normalized_custom_title is not null)
  then
    raise exception using errcode = '22023', message = 'STAFF_JOB_INPUT_INVALID';
  end if;

  if target_branch_id is not null and not exists (
    select 1 from public.branches as branch
    where branch.school_id = target_school_id
      and branch.id = target_branch_id
      and branch.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'STAFF_SCOPE_INVALID';
  end if;

  if not exists (
    select 1
    from public.list_payroll_staff_candidates(target_school_id, target_branch_id) as candidate
    where candidate.membership_id = target_membership_id
  ) then
    raise exception using errcode = '23514', message = 'STAFF_SCOPE_INVALID';
  end if;

  select position.branch_id into existing_branch_id
  from public.staff_positions as position
  where position.school_id = target_school_id
    and position.membership_id = target_membership_id;
  if found
    and existing_branch_id is distinct from target_branch_id
    and not public.has_school_permission(target_school_id, 'finance.manage')
  then
    raise exception using errcode = '42501', message = 'STAFF_SCOPE_CHANGE_REQUIRED';
  end if;

  insert into public.staff_positions as position (
    school_id, membership_id, branch_id, job_code,
    custom_job_title, status, created_by
  ) values (
    target_school_id, target_membership_id, target_branch_id, target_job_code,
    case when target_job_code = 'other' then normalized_custom_title else null end,
    'active', (select auth.uid())
  )
  on conflict (school_id, membership_id) do update
  set branch_id = excluded.branch_id,
      job_code = excluded.job_code,
      custom_job_title = excluded.custom_job_title,
      status = 'active',
      updated_at = timezone('utc', now())
  returning position.id into position_id;

  return position_id;
end;
$$;

create or replace function public.deactivate_payroll_staff_position(
  target_school_id uuid,
  target_position_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  position_branch_id uuid;
begin
  select position.branch_id into position_branch_id
  from public.staff_positions as position
  where position.school_id = target_school_id
    and position.id = target_position_id
    and position.status = 'active';
  if not found then return false; end if;

  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id, position_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_MANAGE_REQUIRED';
  end if;

  update public.staff_positions
  set status = 'inactive', updated_at = timezone('utc', now())
  where school_id = target_school_id
    and id = target_position_id
    and status = 'active';
  return found;
end;
$$;

revoke all on function public.list_payroll_staff_candidates(uuid, uuid) from public, anon;
revoke all on function public.list_payroll_staff(uuid, uuid) from public, anon;
revoke all on function public.upsert_payroll_staff_position(uuid, uuid, text, text, uuid) from public, anon;
revoke all on function public.deactivate_payroll_staff_position(uuid, uuid) from public, anon;

grant execute on function public.list_payroll_staff_candidates(uuid, uuid) to authenticated;
grant execute on function public.list_payroll_staff(uuid, uuid) to authenticated;
grant execute on function public.upsert_payroll_staff_position(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.deactivate_payroll_staff_position(uuid, uuid) to authenticated;

commit;
