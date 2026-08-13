-- QuranOS V2 - teacher and guardian notification messaging
-- Extends the existing inbox/sent center with least-privilege compose scopes.

begin;

create index if not exists notification_campaigns_sender_created_idx
  on public.notification_campaigns (sender_profile_id, created_at desc);

create or replace function public.list_my_notification_sender_schools()
returns table (
  school_id uuid,
  school_name text,
  sender_kind text,
  can_group_send boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  return query
  with membership_access as (
    select
      school.id as school_id,
      school.name as school_name,
      case
        when public.has_school_permission(school.id, 'notifications.send') then 'staff'
        else 'teacher'
      end as sender_kind,
      true as can_group_send,
      case
        when public.has_school_permission(school.id, 'notifications.send') then 1
        else 2
      end as sender_rank
    from public.school_memberships as membership
    join public.schools as school
      on school.id = membership.school_id
     and school.status = 'active'
    where membership.profile_id = current_user_id
      and membership.status = 'active'
      and (
        public.has_school_permission(school.id, 'notifications.send')
        or exists (
          select 1
          from public.teachers as teacher
          where teacher.school_id = school.id
            and teacher.profile_id = current_user_id
            and teacher.status = 'active'
        )
        or exists (
          select 1
          from public.membership_roles as membership_role
          join public.roles as role
            on role.id = membership_role.role_id
           and role.school_id = membership_role.school_id
           and role.status = 'active'
          where membership_role.school_id = school.id
            and membership_role.membership_id = membership.id
            and role.code = 'teacher'
        )
      )
  ), guardian_access as (
    select distinct
      school.id as school_id,
      school.name as school_name,
      'guardian'::text as sender_kind,
      false as can_group_send,
      3 as sender_rank
    from public.student_guardians as relationship
    join public.schools as school
      on school.id = relationship.school_id
     and school.status = 'active'
    join public.students as student
      on student.id = relationship.student_id
     and student.school_id = relationship.school_id
     and student.status = 'active'
    where relationship.guardian_profile_id = current_user_id
      and relationship.status = 'active'
  ), combined as (
    select * from membership_access
    union all
    select * from guardian_access
  )
  select distinct on (combined.school_id)
    combined.school_id,
    combined.school_name,
    combined.sender_kind,
    combined.can_group_send
  from combined
  order by combined.school_id, combined.sender_rank;
end;
$$;

create or replace function public.can_send_school_notifications(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.list_my_notification_sender_schools() as sender_school
    where sender_school.school_id = target_school_id
  );
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
declare
  current_user_id uuid := (select auth.uid());
  current_sender_kind text;
begin
  select sender_school.sender_kind
  into current_sender_kind
  from public.list_my_notification_sender_schools() as sender_school
  where sender_school.school_id = target_school_id;

  if current_sender_kind is null then
    raise exception using errcode = '42501', message = 'NOTIFICATION_SEND_REQUIRED';
  end if;

  return query
  with all_members as (
    select
      profile.id as profile_id,
      profile.full_name,
      array_remove(array[
        'staff',
        case when bool_or(role.code = 'teacher' or position.job_code = 'teacher')
          then 'teachers' end
      ], null)::text[] as audience_types,
      coalesce(array_agg(distinct membership_role.branch_id)
        filter (where membership_role.branch_id is not null), '{}'::uuid[]) as branch_ids,
      array_agg(distinct role.code)
        filter (where role.code is not null) as role_codes
    from public.school_memberships as membership
    join public.profiles as profile
      on profile.id = membership.profile_id
     and profile.status = 'active'
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
  ), administration_scope as (
    select
      member.profile_id,
      member.full_name,
      member.audience_types,
      member.branch_ids,
      '{}'::uuid[] as class_ids,
      '{}'::text[] as related_students
    from all_members as member
    where member.role_codes && array[
      'school_admin', 'branch_manager', 'academic_supervisor',
      'registrar', 'finance_officer'
    ]::text[]
  ), all_guardians as (
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
      on profile.id = relationship.guardian_profile_id
     and profile.status = 'active'
    join public.students as student
      on student.school_id = relationship.school_id
     and student.id = relationship.student_id
     and student.status = 'active'
    where relationship.school_id = target_school_id
      and relationship.status = 'active'
    group by profile.id, profile.full_name
  ), my_teacher_classes as (
    select distinct class_teacher.class_id
    from public.teachers as teacher
    join public.class_teachers as class_teacher
      on class_teacher.school_id = teacher.school_id
     and class_teacher.teacher_id = teacher.id
     and class_teacher.status = 'active'
    where teacher.school_id = target_school_id
      and teacher.profile_id = current_user_id
      and teacher.status = 'active'
  ), teacher_guardians as (
    select guardian.*
    from all_guardians as guardian
    where exists (
      select 1
      from public.student_guardians as relationship
      join public.students as student
        on student.id = relationship.student_id
       and student.school_id = relationship.school_id
       and student.status = 'active'
      join my_teacher_classes as teacher_class
        on teacher_class.class_id = student.class_id
      where relationship.school_id = target_school_id
        and relationship.guardian_profile_id = guardian.profile_id
        and relationship.status = 'active'
    )
  ), guardian_teachers as (
    select
      teacher_profile.id as profile_id,
      teacher_profile.full_name,
      array['staff', 'teachers']::text[] as audience_types,
      coalesce(array_agg(distinct student.branch_id), '{}'::uuid[]) as branch_ids,
      coalesce(array_agg(distinct student.class_id)
        filter (where student.class_id is not null), '{}'::uuid[]) as class_ids,
      coalesce(array_agg(distinct concat_ws(' ', student.first_name, student.last_name)), '{}'::text[]) as related_students
    from public.student_guardians as relationship
    join public.students as student
      on student.id = relationship.student_id
     and student.school_id = relationship.school_id
     and student.status = 'active'
    join public.class_teachers as class_teacher
      on class_teacher.school_id = student.school_id
     and class_teacher.class_id = student.class_id
     and class_teacher.status = 'active'
    join public.teachers as teacher
      on teacher.id = class_teacher.teacher_id
     and teacher.school_id = class_teacher.school_id
     and teacher.status = 'active'
    join public.profiles as teacher_profile
      on teacher_profile.id = teacher.profile_id
     and teacher_profile.status = 'active'
    where relationship.school_id = target_school_id
      and relationship.guardian_profile_id = current_user_id
      and relationship.status = 'active'
    group by teacher_profile.id, teacher_profile.full_name
  ), combined as (
    select member.profile_id, member.full_name, member.audience_types,
      member.branch_ids, '{}'::uuid[] as class_ids, '{}'::text[] as related_students
    from all_members as member
    where current_sender_kind = 'staff'
    union all
    select guardian.profile_id, guardian.full_name, guardian.audience_types,
      guardian.branch_ids, guardian.class_ids, guardian.related_students
    from all_guardians as guardian
    where current_sender_kind = 'staff'
    union all
    select administrator.*
    from administration_scope as administrator
    where current_sender_kind in ('teacher', 'guardian')
    union all
    select guardian.*
    from teacher_guardians as guardian
    where current_sender_kind = 'teacher'
    union all
    select teacher.*
    from guardian_teachers as teacher
    where current_sender_kind = 'guardian'
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
  where combined.profile_id <> current_user_id
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
  current_user_id uuid := (select auth.uid());
  current_sender_kind text;
  created_campaign_id uuid;
  recipient_profile_id uuid;
  normalized_recipient_ids uuid[];
  normalized_target_path text := nullif(btrim(target_path), '');
  recent_send_count integer;
begin
  select sender_school.sender_kind
  into current_sender_kind
  from public.list_my_notification_sender_schools() as sender_school
  where sender_school.school_id = target_school_id;

  if current_sender_kind is null then
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

  if current_sender_kind = 'guardian' and cardinality(normalized_recipient_ids) <> 1 then
    raise exception using errcode = '42501', message = 'GUARDIAN_NOTIFICATION_INDIVIDUAL_ONLY';
  end if;

  if current_sender_kind = 'guardian'
    and target_category not in ('administration', 'learning', 'attendance', 'guardians')
  then
    raise exception using errcode = '42501', message = 'GUARDIAN_NOTIFICATION_CATEGORY_INVALID';
  end if;

  if current_sender_kind = 'teacher'
    and target_category not in ('administration', 'learning', 'attendance', 'guardians', 'teachers')
  then
    raise exception using errcode = '42501', message = 'TEACHER_NOTIFICATION_CATEGORY_INVALID';
  end if;

  if current_sender_kind <> 'staff' then
    normalized_target_path := null;
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

  select count(*)::integer
  into recent_send_count
  from public.notification_campaigns as campaign
  where campaign.sender_profile_id = current_user_id
    and campaign.created_at >= now() - interval '24 hours';

  if (current_sender_kind = 'guardian' and recent_send_count >= 10)
    or (current_sender_kind = 'teacher' and recent_send_count >= 50)
  then
    raise exception using errcode = '54000', message = 'NOTIFICATION_DAILY_LIMIT_REACHED';
  end if;

  insert into public.notification_campaigns (
    school_id, sender_profile_id, category, title, body, target_path,
    targeting_summary, recipient_count
  ) values (
    target_school_id, current_user_id, target_category,
    btrim(target_title), btrim(target_body), normalized_target_path,
    coalesce(target_targeting_summary, '{}'::jsonb) ||
      jsonb_build_object('senderKind', current_sender_kind),
    cardinality(normalized_recipient_ids)
  ) returning id into created_campaign_id;

  foreach recipient_profile_id in array normalized_recipient_ids loop
    perform public.create_app_notification_internal(
      target_school_id,
      recipient_profile_id,
      current_user_id,
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

revoke all on function public.list_my_notification_sender_schools()
from public, anon, authenticated;
revoke all on function public.can_send_school_notifications(uuid)
from public, anon, authenticated;
revoke all on function public.list_manual_notification_recipients(uuid)
from public, anon, authenticated;
revoke all on function public.send_manual_app_notification(uuid, uuid[], text, text, text, text, jsonb)
from public, anon, authenticated;

grant execute on function public.list_my_notification_sender_schools()
to authenticated;
grant execute on function public.can_send_school_notifications(uuid)
to authenticated;
grant execute on function public.list_manual_notification_recipients(uuid)
to authenticated;
grant execute on function public.send_manual_app_notification(uuid, uuid[], text, text, text, text, jsonb)
to authenticated;

commit;
