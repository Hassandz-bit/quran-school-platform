-- QuranOS V2 - explicit teacher/student notification center categories
-- Additive follow-up to Migration 025. V2 only.

begin;

alter table public.app_notifications
  drop constraint app_notifications_category_check;

alter table public.app_notifications
  add constraint app_notifications_category_check
  check (
    category in (
      'administration',
      'teachers',
      'students',
      'learning',
      'attendance',
      'finance',
      'guardians',
      'system'
    )
  );

create or replace function public.create_app_notification_internal(
  target_school_id uuid,
  target_recipient_profile_id uuid,
  target_sender_profile_id uuid,
  target_student_id uuid,
  target_category text,
  target_event_type text,
  target_title text,
  target_body text,
  target_path text,
  target_source_type text,
  target_source_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_notification_id uuid;
begin
  if target_school_id is null
    or target_recipient_profile_id is null
    or target_source_id is null
    or target_category not in (
      'administration', 'teachers', 'students', 'learning',
      'attendance', 'finance', 'guardians', 'system'
    )
    or target_event_type is null
    or target_event_type !~ '^[a-z][a-z0-9_]{1,63}$'
    or target_source_type is null
    or target_source_type !~ '^[a-z][a-z0-9_]{1,63}$'
    or target_title is null
    or char_length(btrim(target_title)) not between 1 and 160
    or target_body is null
    or char_length(btrim(target_body)) not between 1 and 700
    or (
      target_path is not null
      and (
        char_length(target_path) not between 1 and 300
        or target_path !~ '^/[^/\\[:cntrl:]](?:[^\\[:cntrl:]]*)?$'
        or target_path ~ '://'
      )
    )
  then
    raise exception using errcode = '22023', message = 'invalid app notification input';
  end if;

  if not exists (
    select 1
    from public.schools as school
    where school.id = target_school_id
      and school.status = 'active'
  ) or not exists (
    select 1
    from public.profiles as recipient
    where recipient.id = target_recipient_profile_id
      and recipient.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'notification recipient unavailable';
  end if;

  if target_sender_profile_id is not null and not exists (
    select 1
    from public.profiles as sender
    where sender.id = target_sender_profile_id
      and sender.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'notification sender unavailable';
  end if;

  if target_student_id is not null and not exists (
    select 1
    from public.students as student
    where student.id = target_student_id
      and student.school_id = target_school_id
  ) then
    raise exception using errcode = '23514', message = 'notification student scope mismatch';
  end if;

  insert into public.app_notifications (
    school_id,
    recipient_profile_id,
    sender_profile_id,
    student_id,
    category,
    event_type,
    title,
    body,
    target_path,
    source_type,
    source_id
  ) values (
    target_school_id,
    target_recipient_profile_id,
    target_sender_profile_id,
    target_student_id,
    target_category,
    target_event_type,
    btrim(target_title),
    btrim(target_body),
    target_path,
    target_source_type,
    target_source_id
  )
  on conflict (recipient_profile_id, source_type, source_id) do nothing
  returning id into created_notification_id;

  return created_notification_id;
end;
$$;

revoke all on function public.create_app_notification_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_app_notification_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, uuid
) to service_role;

create or replace function public.list_my_app_notifications(
  target_box text default 'inbox',
  target_category text default null,
  target_limit integer default 100
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
  if target_box not in ('inbox', 'sent')
    or target_limit is null
    or target_limit < 1
    or target_limit > 200
    or (
      target_category is not null
      and target_category not in (
        'administration', 'teachers', 'students', 'learning',
        'attendance', 'finance', 'guardians', 'system'
      )
    )
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
    case
      when student.id is null then null
      else concat_ws(' ', student.first_name, student.last_name)
    end,
    notification.category,
    notification.event_type,
    notification.title,
    notification.body,
    notification.target_path,
    notification.created_at,
    notification.read_at
  from public.app_notifications as notification
  join public.schools as school
    on school.id = notification.school_id
  join public.profiles as recipient
    on recipient.id = notification.recipient_profile_id
  left join public.profiles as sender
    on sender.id = notification.sender_profile_id
  left join public.students as student
    on student.id = notification.student_id
   and student.school_id = notification.school_id
  where (
      (target_box = 'inbox' and notification.recipient_profile_id = current_user_id)
      or (target_box = 'sent' and notification.sender_profile_id = current_user_id)
    )
    and (target_category is null or notification.category = target_category)
  order by notification.created_at desc, notification.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_my_app_notifications(text, text, integer)
from public, anon;
grant execute on function public.list_my_app_notifications(text, text, integer)
to authenticated;

commit;
