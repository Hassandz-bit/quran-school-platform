-- QuranOS V2: strict role-scoped notification inboxes.
-- Keeps the shared notification store, but records the intended recipient context
-- and enforces that context in every self-service read operation.

begin;

alter table public.app_notifications
  add column if not exists recipient_audiences text[] not null default '{}'::text[],
  add column if not exists sender_audiences text[] not null default '{}'::text[];

alter table public.app_notifications
  drop constraint if exists app_notifications_recipient_audiences_check;
alter table public.app_notifications
  add constraint app_notifications_recipient_audiences_check
  check (recipient_audiences <@ array['staff','teacher','guardian','student']::text[]);
alter table public.app_notifications
  drop constraint if exists app_notifications_sender_audiences_check;
alter table public.app_notifications
  add constraint app_notifications_sender_audiences_check
  check (sender_audiences <@ array['staff','teacher','guardian','student']::text[]);

create index if not exists app_notifications_recipient_audience_inbox_idx
  on public.app_notifications (recipient_profile_id, created_at desc)
  where cardinality(recipient_audiences) > 0;
create index if not exists app_notifications_sender_audience_sent_idx
  on public.app_notifications (sender_profile_id, created_at desc)
  where cardinality(sender_audiences) > 0;

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
      select 1 from public.teachers teacher
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
      where membership.school_id = target_school_id
        and membership.profile_id = target_profile_id
        and membership.status = 'active'
        and role.code not in ('teacher','guardian','student')
    ) then 'staff'::text end,
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
      where membership.school_id = target_school_id
        and membership.profile_id = target_profile_id
        and membership.status = 'active'
        and role.code = 'student'
    ) then 'student'::text end
  ], null);
$$;

revoke all on function public.resolve_app_notification_audiences(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.get_my_notification_contexts()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  resolved_contexts text[];
begin
  if current_user_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select coalesce(array_agg(distinct context_value), '{}'::text[])
  into resolved_contexts
  from (
    select unnest(public.resolve_app_notification_audiences(
      scoped_school.school_id, current_user_id, null
    )) as context_value
    from (
      select membership.school_id
      from public.school_memberships membership
      where membership.profile_id = current_user_id and membership.status = 'active'
      union
      select relationship.school_id
      from public.student_guardians relationship
      where relationship.guardian_profile_id = current_user_id and relationship.status = 'active'
      union
      select teacher.school_id
      from public.teachers teacher
      where teacher.profile_id = current_user_id and teacher.status = 'active'
    ) scoped_school
  ) contexts;

  return resolved_contexts;
end;
$$;

revoke all on function public.get_my_notification_contexts()
  from public, anon;
grant execute on function public.get_my_notification_contexts()
  to authenticated;

create or replace function public.set_app_notification_audiences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_audiences text[];
  allowed_audiences text[];
  campaign_summary jsonb;
  campaign_sender_kind text;
begin
  if cardinality(coalesce(new.recipient_audiences, '{}'::text[])) = 0
    and new.source_type = 'manual_campaign'
  then
    select campaign.targeting_summary
    into campaign_summary
    from public.notification_campaigns campaign
    where campaign.id = new.source_id;

    if campaign_summary is not null
      and jsonb_typeof(campaign_summary->'recipientAudiences') = 'object'
      and jsonb_typeof(campaign_summary->'recipientAudiences'->new.recipient_profile_id::text) = 'array'
    then
      select coalesce(array_agg(distinct item.value), '{}'::text[])
      into requested_audiences
      from jsonb_array_elements_text(
        campaign_summary->'recipientAudiences'->new.recipient_profile_id::text
      ) as item(value)
      where item.value in ('staff','teacher','guardian','student');

      allowed_audiences := public.resolve_app_notification_audiences(
        new.school_id, new.recipient_profile_id, new.student_id
      );

      if cardinality(coalesce(requested_audiences, '{}'::text[])) = 0
        or not (requested_audiences <@ coalesce(allowed_audiences, '{}'::text[]))
      then
        raise exception using errcode = '42501',
          message = 'NOTIFICATION_RECIPIENT_AUDIENCE_INVALID';
      end if;

      new.recipient_audiences := requested_audiences;
    end if;
  end if;

  if cardinality(coalesce(new.recipient_audiences, '{}'::text[])) = 0 then
    if new.source_type = 'guardian_attendance'
      or new.event_type in ('fee_due_soon','fee_overdue')
    then
      new.recipient_audiences := array['guardian']::text[];
    else
      new.recipient_audiences := public.resolve_app_notification_audiences(
        new.school_id, new.recipient_profile_id, new.student_id
      );
    end if;
  end if;

  if cardinality(coalesce(new.recipient_audiences, '{}'::text[])) = 0 then
    raise exception using errcode = '42501',
      message = 'NOTIFICATION_RECIPIENT_CONTEXT_UNRESOLVED';
  end if;

  if new.sender_profile_id is not null
    and cardinality(coalesce(new.sender_audiences, '{}'::text[])) = 0
  then
    if new.source_type = 'manual_campaign' then
      select campaign.targeting_summary->>'senderKind'
      into campaign_sender_kind
      from public.notification_campaigns campaign
      where campaign.id = new.source_id;

      if campaign_sender_kind in ('staff','teacher','guardian') then
        new.sender_audiences := array[
          case when campaign_sender_kind = 'teacher' then 'teacher'
               when campaign_sender_kind = 'guardian' then 'guardian'
               else 'staff' end
        ]::text[];
      end if;
    end if;

    if cardinality(coalesce(new.sender_audiences, '{}'::text[])) = 0 then
      new.sender_audiences := public.resolve_app_notification_audiences(
        new.school_id, new.sender_profile_id, null
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.set_app_notification_audiences()
  from public, anon, authenticated;

drop trigger if exists app_notifications_set_audiences on public.app_notifications;
create trigger app_notifications_set_audiences
before insert or update
on public.app_notifications
for each row execute function public.set_app_notification_audiences();

-- Backfill old rows without deleting or changing their notification content.
update public.app_notifications notification
set recipient_audiences = case
      when notification.source_type = 'guardian_attendance'
        or notification.event_type in ('fee_due_soon','fee_overdue')
        then array['guardian']::text[]
      else public.resolve_app_notification_audiences(
        notification.school_id, notification.recipient_profile_id, notification.student_id
      )
    end,
    sender_audiences = case
      when notification.source_type = 'manual_campaign' then
        case (
          select campaign.targeting_summary->>'senderKind'
          from public.notification_campaigns campaign
          where campaign.id = notification.source_id
        )
          when 'teacher' then array['teacher']::text[]
          when 'guardian' then array['guardian']::text[]
          when 'staff' then array['staff']::text[]
          else public.resolve_app_notification_audiences(
            notification.school_id, notification.sender_profile_id, null
          )
        end
      else public.resolve_app_notification_audiences(
        notification.school_id, notification.sender_profile_id, null
      )
    end
where cardinality(notification.recipient_audiences) = 0
   or (notification.sender_profile_id is not null and cardinality(notification.sender_audiences) = 0);

-- Remove the old unscoped RPC so callers cannot bypass the role context argument.
drop function if exists public.list_my_app_notifications(text, text, integer);

create function public.list_my_app_notifications(
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
    or target_context not in ('staff','teacher','guardian','student')
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
      and notification.recipient_audiences @> array[target_context]::text[])
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

-- Context-aware unread count for portal badges. Keep the legacy no-argument
-- function for staff shell compatibility; it returns only a count, not rows.
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
    or target_context not in ('staff','teacher','guardian','student')
  then
    return 0;
  end if;

  return (
    select count(*)::integer
    from public.app_notifications notification
    where notification.recipient_profile_id = current_user_id
      and notification.read_at is null
      and notification.recipient_audiences @> array[target_context]::text[]
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

-- A notification ID alone is not sufficient to mark an item from another
-- portal context as read.
drop function if exists public.mark_my_app_notification_read(uuid);
create function public.mark_my_app_notification_read(
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
    or target_context not in ('staff','teacher','guardian','student')
  then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  update public.app_notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = target_notification_id
    and notification.recipient_profile_id = (select auth.uid())
    and notification.recipient_audiences @> array[target_context]::text[]
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


-- Sender-side context is also explicit. This prevents a profile that is both
-- teacher and guardian from accidentally composing from the other portal.
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
  sender_context text := nullif(current_setting('quranos.notification_sender_context', true), '');
begin
  if current_user_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if sender_context is not null and sender_context not in ('staff','teacher','guardian') then
    raise exception using errcode = '22023', message = 'invalid notification sender context';
  end if;

  return query
  with membership_access as (
    select
      school.id as school_id,
      school.name as school_name,
      case
        when sender_context = 'teacher' then 'teacher'
        when sender_context = 'staff' then 'staff'
        when public.has_school_permission(school.id, 'notifications.send') then 'staff'
        else 'teacher'
      end as sender_kind,
      true as can_group_send,
      case
        when sender_context = 'staff'
          or (sender_context is null and public.has_school_permission(school.id, 'notifications.send')) then 1
        else 2
      end as sender_rank
    from public.school_memberships membership
    join public.schools school
      on school.id = membership.school_id
     and school.status = 'active'
    where membership.profile_id = current_user_id
      and membership.status = 'active'
      and (
        (sender_context is null and (
          public.has_school_permission(school.id, 'notifications.send')
          or exists (
            select 1 from public.teachers teacher
            where teacher.school_id = school.id
              and teacher.profile_id = current_user_id
              and teacher.status = 'active'
          )
          or exists (
            select 1
            from public.membership_roles membership_role
            join public.roles role
              on role.id = membership_role.role_id
             and role.school_id = membership_role.school_id
             and role.status = 'active'
            where membership_role.school_id = school.id
              and membership_role.membership_id = membership.id
              and role.code = 'teacher'
          )
        ))
        or (sender_context = 'staff'
          and public.has_school_permission(school.id, 'notifications.send'))
        or (sender_context = 'teacher' and (
          exists (
            select 1 from public.teachers teacher
            where teacher.school_id = school.id
              and teacher.profile_id = current_user_id
              and teacher.status = 'active'
          )
          or exists (
            select 1
            from public.membership_roles membership_role
            join public.roles role
              on role.id = membership_role.role_id
             and role.school_id = membership_role.school_id
             and role.status = 'active'
            where membership_role.school_id = school.id
              and membership_role.membership_id = membership.id
              and role.code = 'teacher'
          )
        ))
      )
  ), guardian_access as (
    select distinct
      school.id as school_id,
      school.name as school_name,
      'guardian'::text as sender_kind,
      false as can_group_send,
      3 as sender_rank
    from public.student_guardians relationship
    join public.schools school
      on school.id = relationship.school_id
     and school.status = 'active'
    join public.students student
      on student.id = relationship.student_id
     and student.school_id = relationship.school_id
     and student.status = 'active'
    where relationship.guardian_profile_id = current_user_id
      and relationship.status = 'active'
      and (sender_context is null or sender_context = 'guardian')
  ), combined as (
    select * from membership_access
    union all
    select * from guardian_access
  )
  select distinct on (combined.school_id)
    combined.school_id, combined.school_name,
    combined.sender_kind, combined.can_group_send
  from combined
  order by combined.school_id, combined.sender_rank;
end;
$$;

create or replace function public.list_my_notification_sender_schools_for_context(
  target_sender_context text
)
returns table (
  school_id uuid,
  school_name text,
  sender_kind text,
  can_group_send boolean
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
  return query select * from public.list_my_notification_sender_schools();
end;
$$;

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
    from public.list_manual_notification_recipients(target_school_id) recipient;
end;
$$;

create or replace function public.send_manual_app_notification_for_context(
  target_school_id uuid,
  target_recipient_profile_ids uuid[],
  target_category text,
  target_title text,
  target_body text,
  target_path text,
  target_targeting_summary jsonb,
  target_sender_context text
)
returns table (campaign_id uuid, recipient_count integer)
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
    select * from public.send_manual_app_notification(
      target_school_id,
      target_recipient_profile_ids,
      target_category,
      target_title,
      target_body,
      target_path,
      target_targeting_summary
    );
end;
$$;

-- The old context-free composer RPCs are not a public path around the new
-- sender-context wrappers. Nested calls still work as the SECURITY DEFINER owner.
revoke all on function public.list_my_notification_sender_schools()
  from public, anon, authenticated;
revoke all on function public.list_manual_notification_recipients(uuid)
  from public, anon, authenticated;
revoke all on function public.send_manual_app_notification(uuid, uuid[], text, text, text, text, jsonb)
  from public, anon, authenticated;

revoke all on function public.list_my_notification_sender_schools_for_context(text)
  from public, anon;
revoke all on function public.list_manual_notification_recipients_for_context(uuid, text)
  from public, anon;
revoke all on function public.send_manual_app_notification_for_context(
  uuid, uuid[], text, text, text, text, jsonb, text
) from public, anon;

grant execute on function public.list_my_notification_sender_schools_for_context(text)
  to authenticated;
grant execute on function public.list_manual_notification_recipients_for_context(uuid, text)
  to authenticated;
grant execute on function public.send_manual_app_notification_for_context(
  uuid, uuid[], text, text, text, text, jsonb, text
) to authenticated;

commit;
