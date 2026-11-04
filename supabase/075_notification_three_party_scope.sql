-- QuranOS: notification communication is limited to administration, teachers and guardians.
-- "staff" remains the internal key for authorized school administration only.
-- Students and non-administrative employees are not notification participants.

begin;

create or replace function public.resolve_app_notification_audiences(
  target_school_id uuid,
  target_profile_id uuid,
  target_student_id uuid default null
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when exists (
      select 1
      from public.student_guardians relationship
      where relationship.school_id = target_school_id
        and relationship.guardian_profile_id = target_profile_id
        and relationship.status = 'active'
        and (target_student_id is null or relationship.student_id = target_student_id)
    ) then 'guardian'::text end,
    case when exists (
      select 1
      from public.teachers teacher
      where teacher.school_id = target_school_id
        and teacher.profile_id = target_profile_id
        and teacher.status = 'active'
    ) or exists (
      select 1
      from public.school_memberships membership
      join public.membership_roles membership_role
        on membership_role.school_id = membership.school_id
       and membership_role.membership_id = membership.id
      join public.roles role
        on role.school_id = membership_role.school_id
       and role.id = membership_role.role_id
       and role.status = 'active'
      where membership.school_id = target_school_id
        and membership.profile_id = target_profile_id
        and membership.status = 'active'
        and role.code = 'teacher'
    ) then 'teacher'::text end,
    case when exists (
      select 1
      from public.school_memberships membership
      join public.membership_roles membership_role
        on membership_role.school_id = membership.school_id
       and membership_role.membership_id = membership.id
      join public.roles role
        on role.school_id = membership_role.school_id
       and role.id = membership_role.role_id
       and role.status = 'active'
      join public.role_permissions role_permission
        on role_permission.school_id = role.school_id
       and role_permission.role_id = role.id
      join public.permissions permission
        on permission.id = role_permission.permission_id
       and permission.code = 'notifications.send'
      where membership.school_id = target_school_id
        and membership.profile_id = target_profile_id
        and membership.status = 'active'
    ) then 'staff'::text end
  ], null);
$$;

revoke all on function public.resolve_app_notification_audiences(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.resolve_manual_notification_recipient_audiences(
  target_school_id uuid,
  target_profile_id uuid,
  target_student_id uuid,
  target_sender_kind text
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  available_contexts text[] := public.resolve_app_notification_audiences(
    target_school_id, target_profile_id, target_student_id
  );
begin
  if target_sender_kind is null then
    if 'staff' = any(available_contexts) then return array['staff']::text[]; end if;
    if 'teacher' = any(available_contexts) then return array['teacher']::text[]; end if;
    if 'guardian' = any(available_contexts) then return array['guardian']::text[]; end if;
  end if;
  if target_sender_kind = 'teacher' and 'guardian' = any(available_contexts) then
    return array['guardian']::text[];
  end if;
  if target_sender_kind = 'guardian' and 'teacher' = any(available_contexts) then
    return array['teacher']::text[];
  end if;
  if target_sender_kind = 'guardian' and 'staff' = any(available_contexts) then
    return array['staff']::text[];
  end if;
  if target_sender_kind = 'staff' and 'staff' = any(available_contexts) then
    return array['staff']::text[];
  end if;
  if target_sender_kind = 'staff' and 'teacher' = any(available_contexts) then
    return array['teacher']::text[];
  end if;
  return coalesce(available_contexts, '{}'::text[]);
end;
$$;

revoke all on function public.resolve_manual_notification_recipient_audiences(uuid, uuid, uuid, text)
  from public, anon, authenticated;

-- Remove stale audiences from old rows without deleting notification history.
update public.app_notifications notification
set recipient_audiences = array(
      select distinct audience
      from unnest(coalesce(notification.recipient_audiences, '{}'::text[])) as audience
      where audience = any(public.resolve_app_notification_audiences(
        notification.school_id, notification.recipient_profile_id, notification.student_id
      ))
    ),
    sender_audiences = case
      when notification.sender_profile_id is null then '{}'::text[]
      else array(
        select distinct audience
        from unnest(coalesce(notification.sender_audiences, '{}'::text[])) as audience
        where audience = any(public.resolve_app_notification_audiences(
          notification.school_id, notification.sender_profile_id, null
        ))
      )
    end;

alter table public.app_notifications
  drop constraint if exists app_notifications_recipient_audiences_check;
alter table public.app_notifications
  add constraint app_notifications_recipient_audiences_check
  check (recipient_audiences <@ array['staff','teacher','guardian']::text[]);

alter table public.app_notifications
  drop constraint if exists app_notifications_sender_audiences_check;
alter table public.app_notifications
  add constraint app_notifications_sender_audiences_check
  check (sender_audiences <@ array['staff','teacher','guardian']::text[]);

-- The inbox now hides historic messages whose sender is no longer one of the
-- three authorized participants. System-generated events (null sender) remain.
create or replace function public.list_my_app_notifications(
  target_box text default 'inbox',
  target_category text default null,
  target_limit integer default 100,
  target_context text default 'staff'
)
returns table (
  notification_id uuid,
  school_id uuid,
  school_name text,
  recipient_name text,
  sender_name text,
  student_id uuid,
  student_name text,
  category text,
  event_type text,
  title text,
  body text,
  target_path text,
  created_at timestamptz,
  read_at timestamptz
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

  if target_box not in ('inbox','sent')
    or target_limit is null or target_limit < 1 or target_limit > 200
    or target_context not in ('staff','teacher','guardian')
    or (target_category is not null and target_category not in (
      'administration','teachers','students','learning',
      'attendance','finance','guardians','system'
    ))
  then
    raise exception using errcode = '22023', message = 'invalid notification list input';
  end if;

  return query
  select
    notification.id,
    notification.school_id,
    school.name,
    recipient.full_name,
    sender.full_name,
    notification.student_id,
    case when student.id is null then null
      else concat_ws(' ', student.first_name, student.last_name) end,
    notification.category,
    notification.event_type,
    notification.title,
    notification.body,
    notification.target_path,
    notification.created_at,
    notification.read_at
  from public.app_notifications notification
  join public.schools school on school.id = notification.school_id
  join public.profiles recipient on recipient.id = notification.recipient_profile_id
  left join public.profiles sender on sender.id = notification.sender_profile_id
  left join public.students student
    on student.id = notification.student_id
   and student.school_id = notification.school_id
  where (
    (target_box = 'inbox'
      and notification.recipient_profile_id = current_user_id
      and notification.recipient_audiences @> array[target_context]::text[]
      and (notification.sender_profile_id is null or cardinality(notification.sender_audiences) > 0))
    or
    (target_box = 'sent'
      and notification.sender_profile_id = current_user_id
      and notification.sender_audiences @> array[target_context]::text[])
  )
  and public.resolve_app_notification_audiences(
    notification.school_id, current_user_id, null
  ) @> array[target_context]::text[]
  and (target_category is null or notification.category = target_category)
  order by notification.created_at desc, notification.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_my_app_notifications(text, text, integer, text)
  from public, anon;
grant execute on function public.list_my_app_notifications(text, text, integer, text)
  to authenticated;

create or replace function public.get_my_unread_notification_count(target_context text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not public.current_profile_is_active()
    or target_context not in ('staff','teacher','guardian')
  then
    return 0;
  end if;

  return (
    select count(*)::integer
    from public.app_notifications notification
    where notification.recipient_profile_id = current_user_id
      and notification.read_at is null
      and notification.recipient_audiences @> array[target_context]::text[]
      and (notification.sender_profile_id is null or cardinality(notification.sender_audiences) > 0)
      and public.resolve_app_notification_audiences(
        notification.school_id, current_user_id, null
      ) @> array[target_context]::text[]
  );
end;
$$;

revoke all on function public.get_my_unread_notification_count(text)
  from public, anon;
grant execute on function public.get_my_unread_notification_count(text)
  to authenticated;

create or replace function public.mark_my_app_notification_read(
  target_notification_id uuid,
  target_context text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or target_context not in ('staff','teacher','guardian')
  then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  update public.app_notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = target_notification_id
    and notification.recipient_profile_id = (select auth.uid())
    and notification.recipient_audiences @> array[target_context]::text[]
    and (notification.sender_profile_id is null or cardinality(notification.sender_audiences) > 0)
    and public.resolve_app_notification_audiences(
      notification.school_id, (select auth.uid()), null
    ) @> array[target_context]::text[];

  return found;
end;
$$;

revoke all on function public.mark_my_app_notification_read(uuid, text)
  from public, anon;
grant execute on function public.mark_my_app_notification_read(uuid, text)
  to authenticated;

-- The composer returns only profiles whose active identity resolves to one
-- of the three allowed participant contexts. This excludes students and
-- non-administrative staff even if they are school members.
create or replace function public.list_manual_notification_recipients_for_context(
  target_school_id uuid,
  target_sender_context text
)
returns table (
  profile_id uuid,
  full_name text,
  audience_types text[],
  branch_ids uuid[],
  class_ids uuid[],
  related_students text[],
  notification_contexts text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_sender_context not in ('staff','teacher','guardian')
    or not (public.get_my_notification_contexts() @> array[target_sender_context]::text[])
  then
    raise exception using errcode = '42501', message = 'NOTIFICATION_SENDER_CONTEXT_REQUIRED';
  end if;

  perform set_config('quranos.notification_sender_context', target_sender_context, true);
  return query
    select
      recipient.profile_id,
      recipient.full_name,
      recipient.audience_types,
      recipient.branch_ids,
      recipient.class_ids,
      recipient.related_students,
      public.resolve_app_notification_audiences(
        target_school_id, recipient.profile_id, null
      ) as notification_contexts
    from public.list_manual_notification_recipients(target_school_id) recipient
    where cardinality(public.resolve_app_notification_audiences(
      target_school_id, recipient.profile_id, null
    )) > 0;
end;
$$;

revoke all on function public.list_manual_notification_recipients_for_context(uuid, text)
  from public, anon;
grant execute on function public.list_manual_notification_recipients_for_context(uuid, text)
  to authenticated;

commit;
