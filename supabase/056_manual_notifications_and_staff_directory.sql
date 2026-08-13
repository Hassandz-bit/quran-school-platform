-- QuranOS V2 - manual notification composer and staff job directory
-- V2 only. Production remains unchanged until the release gate is approved.

begin;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (code, module, name_ar, description)
values
  ('notifications.send', 'notifications', 'إرسال الإشعارات', 'إنشاء إشعارات فردية وجماعية داخل المدرسة'),
  ('staff.view', 'staff', 'عرض الموظفين', 'عرض المسميات الوظيفية لموظفي المدرسة'),
  ('staff.manage', 'staff', 'إدارة الموظفين', 'إسناد المسميات الوظيفية وتعديلها')
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description,
    updated_at = timezone('utc', now());

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'notifications.send'),
    ('school_admin', 'staff.view'),
    ('school_admin', 'staff.manage'),
    ('branch_manager', 'staff.view'),
    ('finance_officer', 'staff.view')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants
join public.roles as role
  on role.code = grants.role_code
 and role.status = 'active'
join public.permissions as permission
  on permission.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Staff job titles are deliberately separate from authorization roles.
-- ---------------------------------------------------------------------------

create table public.staff_positions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  membership_id uuid not null,
  branch_id uuid,
  job_code text not null,
  custom_job_title text,
  status text not null default 'active',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_positions_membership_school_fk
    foreign key (school_id, membership_id)
    references public.school_memberships(school_id, id) on delete cascade,
  constraint staff_positions_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id) on delete restrict,
  constraint staff_positions_job_code_check
    check (job_code in (
      'manager', 'deputy_manager', 'bursar', 'teacher',
      'guard', 'cleaner', 'driver', 'other'
    )),
  constraint staff_positions_custom_title_check check (
    (job_code = 'other' and char_length(btrim(custom_job_title)) between 2 and 100)
    or (job_code <> 'other' and custom_job_title is null)
  ),
  constraint staff_positions_status_check check (status in ('active', 'inactive')),
  constraint staff_positions_membership_unique unique (school_id, membership_id)
);

comment on table public.staff_positions is
  'School job directory. A job title describes employment and never grants application permissions.';

create index staff_positions_school_status_idx
  on public.staff_positions (school_id, status, job_code);
create index staff_positions_branch_status_idx
  on public.staff_positions (branch_id, status)
  where branch_id is not null;

create trigger staff_positions_set_updated_at
before update on public.staff_positions
for each row execute function public.set_updated_at();

alter table public.staff_positions enable row level security;
revoke all on public.staff_positions from public, anon, authenticated;

create or replace function public.list_school_staff(target_school_id uuid)
returns table (
  position_id uuid,
  membership_id uuid,
  profile_id uuid,
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
    or not (
      public.has_school_permission(target_school_id, 'staff.view')
      or public.has_school_permission(target_school_id, 'staff.manage')
    )
  then
    raise exception using errcode = '42501', message = 'STAFF_VIEW_REQUIRED';
  end if;

  return query
  select
    position.id,
    membership.id,
    profile.id,
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
  join public.profiles as profile
    on profile.id = membership.profile_id
  left join public.branches as branch
    on branch.school_id = position.school_id
   and branch.id = position.branch_id
  where position.school_id = target_school_id
    and position.status = 'active'
    and membership.status = 'active'
    and profile.status = 'active'
  order by profile.full_name, position.id;
end;
$$;

create or replace function public.upsert_staff_position(
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
  normalized_custom_title text := nullif(btrim(target_custom_job_title), '');
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.has_school_permission(target_school_id, 'staff.manage')
  then
    raise exception using errcode = '42501', message = 'STAFF_MANAGE_REQUIRED';
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

  if not exists (
    select 1
    from public.school_memberships as membership
    join public.profiles as profile on profile.id = membership.profile_id
    where membership.school_id = target_school_id
      and membership.id = target_membership_id
      and membership.status = 'active'
      and profile.status = 'active'
  ) or (
    target_branch_id is not null
    and not exists (
      select 1 from public.branches as branch
      where branch.school_id = target_school_id
        and branch.id = target_branch_id
        and branch.status = 'active'
    )
  ) then
    raise exception using errcode = '23514', message = 'STAFF_SCOPE_INVALID';
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

create or replace function public.deactivate_staff_position(
  target_school_id uuid,
  target_position_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.has_school_permission(target_school_id, 'staff.manage')
  then
    raise exception using errcode = '42501', message = 'STAFF_MANAGE_REQUIRED';
  end if;

  update public.staff_positions
  set status = 'inactive', updated_at = timezone('utc', now())
  where school_id = target_school_id
    and id = target_position_id
    and status = 'active';
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual notification campaigns and recipient resolution
-- ---------------------------------------------------------------------------

create table public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id),
  category text not null,
  title text not null,
  body text not null,
  target_path text,
  targeting_summary jsonb not null default '{}'::jsonb,
  recipient_count integer not null,
  created_at timestamptz not null default now(),
  constraint notification_campaigns_category_check check (category in (
    'administration', 'teachers', 'students', 'learning',
    'attendance', 'finance', 'guardians', 'system'
  )),
  constraint notification_campaigns_title_check
    check (char_length(btrim(title)) between 1 and 160),
  constraint notification_campaigns_body_check
    check (char_length(btrim(body)) between 1 and 700),
  constraint notification_campaigns_target_path_check check (
    target_path is null or (
      char_length(target_path) between 1 and 300
      and target_path ~ '^/[^/\\[:cntrl:]](?:[^\\[:cntrl:]]*)?$'
      and target_path !~ '://'
    )
  ),
  constraint notification_campaigns_recipient_count_check
    check (recipient_count between 1 and 500)
);

comment on table public.notification_campaigns is
  'Audit envelope for each manual in-app send. Recipient rows remain in app_notifications.';

create index notification_campaigns_school_created_idx
  on public.notification_campaigns (school_id, created_at desc);

alter table public.notification_campaigns enable row level security;
revoke all on public.notification_campaigns from public, anon, authenticated;

create or replace function public.can_send_school_notifications(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.current_profile_is_active()
    and public.has_school_permission(target_school_id, 'notifications.send');
$$;

create or replace function public.list_manual_notification_recipients(
  target_school_id uuid
)
returns table (
  profile_id uuid,
  full_name text,
  audience_types text[],
  branch_ids uuid[],
  class_ids uuid[],
  related_students text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_send_school_notifications(target_school_id) then
    raise exception using errcode = '42501', message = 'NOTIFICATION_SEND_REQUIRED';
  end if;

  return query
  with member_scope as (
    select
      profile.id as profile_id,
      profile.full_name,
      array_remove(array[
        'staff',
        case when bool_or(role.code = 'teacher' or position.job_code = 'teacher')
          then 'teachers' end
      ], null)::text[] as audience_types,
      coalesce(array_agg(distinct membership_role.branch_id)
        filter (where membership_role.branch_id is not null), '{}'::uuid[]) as branch_ids
    from public.school_memberships as membership
    join public.profiles as profile
      on profile.id = membership.profile_id and profile.status = 'active'
    left join public.membership_roles as membership_role
      on membership_role.school_id = membership.school_id
     and membership_role.membership_id = membership.id
    left join public.roles as role
      on role.school_id = membership_role.school_id
     and role.id = membership_role.role_id
     and role.status = 'active'
    left join public.staff_positions as position
      on position.school_id = membership.school_id
     and position.membership_id = membership.id
     and position.status = 'active'
    where membership.school_id = target_school_id
      and membership.status = 'active'
    group by profile.id, profile.full_name
  ), guardian_scope as (
    select
      profile.id as profile_id,
      profile.full_name,
      array['guardians', 'students']::text[] as audience_types,
      coalesce(array_agg(distinct student.branch_id), '{}'::uuid[]) as branch_ids,
      coalesce(array_agg(distinct student.class_id)
        filter (where student.class_id is not null), '{}'::uuid[]) as class_ids,
      coalesce(array_agg(distinct concat_ws(' ', student.first_name, student.last_name)), '{}'::text[]) as related_students
    from public.student_guardians as relationship
    join public.profiles as profile
      on profile.id = relationship.guardian_profile_id and profile.status = 'active'
    join public.students as student
      on student.school_id = relationship.school_id
     and student.id = relationship.student_id
     and student.status = 'active'
    where relationship.school_id = target_school_id
      and relationship.status = 'active'
    group by profile.id, profile.full_name
  ), combined as (
    select member.profile_id, member.full_name, member.audience_types,
      member.branch_ids, '{}'::uuid[] as class_ids, '{}'::text[] as related_students
    from member_scope as member
    union all
    select guardian.profile_id, guardian.full_name, guardian.audience_types,
      guardian.branch_ids, guardian.class_ids, guardian.related_students
    from guardian_scope as guardian
  )
  select
    combined.profile_id,
    max(combined.full_name),
    array_agg(distinct audience_value.value order by audience_value.value),
    coalesce(array_agg(distinct branch_value.value)
      filter (where branch_value.value is not null), '{}'::uuid[]),
    coalesce(array_agg(distinct class_value.value)
      filter (where class_value.value is not null), '{}'::uuid[]),
    coalesce(array_agg(distinct student_value.value)
      filter (where student_value.value is not null), '{}'::text[])
  from combined
  left join lateral unnest(combined.audience_types) as audience_value(value) on true
  left join lateral unnest(combined.branch_ids) as branch_value(value) on true
  left join lateral unnest(combined.class_ids) as class_value(value) on true
  left join lateral unnest(combined.related_students) as student_value(value) on true
  group by combined.profile_id
  order by max(combined.full_name), combined.profile_id;
end;
$$;

create or replace function public.send_manual_app_notification(
  target_school_id uuid,
  target_recipient_profile_ids uuid[],
  target_category text,
  target_title text,
  target_body text,
  target_path text default null,
  target_targeting_summary jsonb default '{}'::jsonb
)
returns table (campaign_id uuid, recipient_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_campaign_id uuid;
  recipient_profile_id uuid;
  normalized_recipient_ids uuid[];
  normalized_target_path text := nullif(btrim(target_path), '');
begin
  if not public.can_send_school_notifications(target_school_id) then
    raise exception using errcode = '42501', message = 'NOTIFICATION_SEND_REQUIRED';
  end if;

  select array_agg(distinct selected_id order by selected_id)
  into normalized_recipient_ids
  from unnest(target_recipient_profile_ids) as selected_id
  where selected_id is not null;

  if coalesce(cardinality(normalized_recipient_ids), 0) not between 1 and 500
    or target_category not in (
      'administration', 'teachers', 'students', 'learning',
      'attendance', 'finance', 'guardians', 'system'
    )
    or char_length(btrim(target_title)) not between 1 and 160
    or char_length(btrim(target_body)) not between 1 and 700
    or jsonb_typeof(coalesce(target_targeting_summary, '{}'::jsonb)) <> 'object'
  then
    raise exception using errcode = '22023', message = 'NOTIFICATION_INPUT_INVALID';
  end if;

  if exists (
    select 1
    from unnest(normalized_recipient_ids) as selected_id
    where not exists (
      select 1
      from public.list_manual_notification_recipients(target_school_id) as recipient
      where recipient.profile_id = selected_id
    )
  ) then
    raise exception using errcode = '42501', message = 'NOTIFICATION_RECIPIENT_INVALID';
  end if;

  insert into public.notification_campaigns (
    school_id, sender_profile_id, category, title, body, target_path,
    targeting_summary, recipient_count
  ) values (
    target_school_id, (select auth.uid()), target_category,
    btrim(target_title), btrim(target_body), normalized_target_path,
    coalesce(target_targeting_summary, '{}'::jsonb),
    cardinality(normalized_recipient_ids)
  ) returning id into created_campaign_id;

  foreach recipient_profile_id in array normalized_recipient_ids loop
    perform public.create_app_notification_internal(
      target_school_id,
      recipient_profile_id,
      (select auth.uid()),
      null,
      target_category,
      'manual_notification',
      btrim(target_title),
      btrim(target_body),
      normalized_target_path,
      'manual_campaign',
      created_campaign_id
    );
  end loop;

  return query select created_campaign_id, cardinality(normalized_recipient_ids);
end;
$$;

-- Migration 026 temporarily exposed the internal helper to authenticated.
-- Manual sends now go through the authorization-aware campaign RPC only.
revoke all on function public.create_app_notification_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, uuid
) from authenticated;

revoke all on function public.list_school_staff(uuid) from public, anon;
revoke all on function public.upsert_staff_position(uuid, uuid, text, text, uuid) from public, anon;
revoke all on function public.deactivate_staff_position(uuid, uuid) from public, anon;
revoke all on function public.can_send_school_notifications(uuid) from public, anon;
revoke all on function public.list_manual_notification_recipients(uuid) from public, anon;
revoke all on function public.send_manual_app_notification(uuid, uuid[], text, text, text, text, jsonb) from public, anon;

grant execute on function public.list_school_staff(uuid) to authenticated;
grant execute on function public.upsert_staff_position(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.deactivate_staff_position(uuid, uuid) to authenticated;
grant execute on function public.can_send_school_notifications(uuid) to authenticated;
grant execute on function public.list_manual_notification_recipients(uuid) to authenticated;
grant execute on function public.send_manual_app_notification(uuid, uuid[], text, text, text, text, jsonb) to authenticated;

commit;
