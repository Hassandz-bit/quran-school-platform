-- QuranOS: align the internal notification writer with the category set
-- enforced by migration 078, including teacher follow-up alerts.

begin;

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
      'administration', 'teachers', 'finance', 'guardians', 'system'
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
    source_id,
    recipient_audiences
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
    target_source_id,
    case
      when target_category = 'teachers' then array['teacher']::text[]
      when target_category = 'guardians' then array['guardian']::text[]
      else array['staff']::text[]
    end
  )
  on conflict (recipient_profile_id, source_type, source_id) do nothing
  returning id into created_notification_id;

  return created_notification_id;
end;
$$;

revoke all on function public.create_app_notification_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;

commit;
