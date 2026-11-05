-- QuranOS: remove student-linked fields from notification RPC payloads.
-- Student records remain in academic modules; notification APIs expose only the three parties.
begin;

drop function if exists public.list_my_app_notifications(text, text, integer, text);
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
      'administration','teachers','finance','guardians','system'
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

drop function if exists public.list_manual_notification_recipients_for_context(uuid, text);
create function public.list_manual_notification_recipients_for_context(
  target_school_id uuid,
  target_sender_context text
)
returns table (
  profile_id uuid,
  full_name text,
  audience_types text[],
  branch_ids uuid[],
  class_ids uuid[],
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
      array_remove(array[
        case when 'staff' = any(resolved.contexts) then 'staff'::text end,
        case when 'teacher' = any(resolved.contexts) then 'teachers'::text end,
        case when 'guardian' = any(resolved.contexts) then 'guardians'::text end
      ], null),
      recipient.branch_ids,
      recipient.class_ids,
      resolved.contexts as notification_contexts
    from public.list_manual_notification_recipients(target_school_id) recipient
    cross join lateral (
      select public.resolve_app_notification_audiences(
        target_school_id, recipient.profile_id, null
      ) as contexts
    ) resolved
    where cardinality(resolved.contexts) > 0;
end;
$$;

revoke all on function public.list_manual_notification_recipients_for_context(uuid, text)
  from public, anon;
grant execute on function public.list_manual_notification_recipients_for_context(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
