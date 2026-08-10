-- QuranOS V2 - staff guardian directory + unified in-app notification center
-- V2 only. This migration is not applied to the frozen V1 Production line.

begin;

-- ---------------------------------------------------------------------------
-- Staff-facing guardian directory
-- ---------------------------------------------------------------------------

create or replace function public.get_guardian_management_access(
  target_school_id uuid
)
returns table (
  can_view boolean,
  can_invite boolean,
  can_view_contacts boolean,
  can_revoke boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.students as student
      where student.school_id = target_school_id
        and public.can_manage_student_guardian(
          student.school_id,
          student.id,
          'guardians.view'
        )
    ),
    exists (
      select 1
      from public.students as student
      where student.school_id = target_school_id
        and public.can_manage_student_guardian(
          student.school_id,
          student.id,
          'guardians.invite'
        )
        and public.can_manage_student_guardian(
          student.school_id,
          student.id,
          'guardians.link'
        )
    ),
    exists (
      select 1
      from public.students as student
      where student.school_id = target_school_id
        and public.can_manage_student_guardian(
          student.school_id,
          student.id,
          'guardians.view_contacts'
        )
    ),
    exists (
      select 1
      from public.students as student
      where student.school_id = target_school_id
        and public.can_manage_student_guardian(
          student.school_id,
          student.id,
          'guardians.revoke'
        )
    );
$$;

create or replace function public.list_school_guardians(
  target_school_id uuid
)
returns table (
  relationship_id uuid,
  student_id uuid,
  student_name text,
  branch_id uuid,
  branch_name text,
  class_name text,
  guardian_profile_id uuid,
  guardian_name text,
  guardian_email text,
  guardian_phone text,
  relationship_type text,
  is_primary boolean,
  relationship_status text,
  invitation_status text,
  created_at timestamptz,
  activated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    relationship.id,
    student.id,
    concat_ws(' ', student.first_name, student.last_name),
    student.branch_id,
    branch.name,
    class.name,
    relationship.guardian_profile_id,
    guardian_profile.full_name,
    case
      when public.can_manage_student_guardian(
        relationship.school_id,
        relationship.student_id,
        'guardians.view_contacts'
      ) then lower(btrim(auth_user.email))
      else null
    end,
    case
      when public.can_manage_student_guardian(
        relationship.school_id,
        relationship.student_id,
        'guardians.view_contacts'
      ) then guardian_profile.phone
      else null
    end,
    relationship.relationship_type,
    relationship.is_primary,
    relationship.status,
    latest_invitation.status,
    relationship.created_at,
    relationship.activated_at
  from public.student_guardians as relationship
  join public.students as student
    on student.school_id = relationship.school_id
   and student.id = relationship.student_id
  join public.branches as branch
    on branch.school_id = student.school_id
   and branch.id = student.branch_id
  left join public.classes as class
    on class.school_id = student.school_id
   and class.branch_id = student.branch_id
   and class.id = student.class_id
  join public.profiles as guardian_profile
    on guardian_profile.id = relationship.guardian_profile_id
  left join auth.users as auth_user
    on auth_user.id = relationship.guardian_profile_id
  left join lateral (
    select invitation.status
    from public.guardian_invitations as invitation
    where invitation.student_guardian_id = relationship.id
    order by invitation.created_at desc, invitation.id desc
    limit 1
  ) as latest_invitation on true
  where relationship.school_id = target_school_id
    and public.can_manage_student_guardian(
      relationship.school_id,
      relationship.student_id,
      'guardians.view'
    )
  order by student.last_name, student.first_name, relationship.is_primary desc,
    relationship.created_at desc;
$$;

create or replace function public.list_guardian_invite_students(
  target_school_id uuid
)
returns table (
  student_id uuid,
  student_name text,
  branch_id uuid,
  branch_name text,
  class_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    student.id,
    concat_ws(' ', student.first_name, student.last_name),
    student.branch_id,
    branch.name,
    class.name
  from public.students as student
  join public.branches as branch
    on branch.school_id = student.school_id
   and branch.id = student.branch_id
  left join public.classes as class
    on class.school_id = student.school_id
   and class.branch_id = student.branch_id
   and class.id = student.class_id
  where student.school_id = target_school_id
    and student.status = 'active'
    and public.can_manage_student_guardian(
      student.school_id,
      student.id,
      'guardians.invite'
    )
    and public.can_manage_student_guardian(
      student.school_id,
      student.id,
      'guardians.link'
    )
  order by student.last_name, student.first_name;
$$;

revoke all on function public.get_guardian_management_access(uuid)
from public, anon;
revoke all on function public.list_school_guardians(uuid)
from public, anon;
revoke all on function public.list_guardian_invite_students(uuid)
from public, anon;
grant execute on function public.get_guardian_management_access(uuid)
to authenticated;
grant execute on function public.list_school_guardians(uuid)
to authenticated;
grant execute on function public.list_guardian_invite_students(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Unified in-app notification center
--
-- One row is one recipient-facing notification. sender_profile_id records the
-- actor whose action produced the notification when there is one. Future
-- modules (finance, administration, learning, guardians) can write through the
-- internal helper below without opening this table to the browser.
-- ---------------------------------------------------------------------------

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  category text not null,
  event_type text not null,
  title text not null,
  body text not null,
  target_path text,
  source_type text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint app_notifications_category_check
    check (
      category in (
        'administration',
        'learning',
        'attendance',
        'finance',
        'guardians',
        'system'
      )
    ),
  constraint app_notifications_event_type_check
    check (
      char_length(event_type) between 2 and 64
      and event_type ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint app_notifications_source_type_check
    check (
      char_length(source_type) between 2 and 64
      and source_type ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint app_notifications_title_check
    check (char_length(btrim(title)) between 1 and 160),
  constraint app_notifications_body_check
    check (char_length(btrim(body)) between 1 and 700),
  constraint app_notifications_target_path_check
    check (
      target_path is null
      or (
        char_length(target_path) between 1 and 300
        and target_path ~ '^/[^/\\[:cntrl:]](?:[^\\[:cntrl:]]*)?$'
        and target_path !~ '://'
      )
    ),
  constraint app_notifications_read_at_check
    check (read_at is null or read_at >= created_at),
  constraint app_notifications_recipient_source_unique
    unique (recipient_profile_id, source_type, source_id)
);

comment on table public.app_notifications is
  'Private per-recipient in-app notification center shared by QuranOS modules. Browser access is RPC-only.';
comment on column public.app_notifications.sender_profile_id is
  'Actor whose action produced the notification; NULL means a system-originated event.';
comment on column public.app_notifications.student_id is
  'Optional student subject. Students are records unless/until they have their own authenticated profile.';
comment on column public.app_notifications.target_path is
  'Bounded same-origin application path only; never an external URL.';

create index app_notifications_recipient_created_idx
  on public.app_notifications (recipient_profile_id, created_at desc, id desc);
create index app_notifications_recipient_unread_idx
  on public.app_notifications (recipient_profile_id, created_at desc)
  where read_at is null;
create index app_notifications_sender_created_idx
  on public.app_notifications (sender_profile_id, created_at desc, id desc)
  where sender_profile_id is not null;
create index app_notifications_school_category_created_idx
  on public.app_notifications (school_id, category, created_at desc);
create index app_notifications_student_created_idx
  on public.app_notifications (student_id, created_at desc)
  where student_id is not null;

alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from public, anon, authenticated;

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
      'administration', 'learning', 'attendance', 'finance', 'guardians', 'system'
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
) from public, anon, authenticated, service_role;

create or replace function public.queue_guardian_attendance_app_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid;
  guardian_profile_id uuid;
  notification_title text;
  notification_body text;
begin
  select attendance_record.last_modified_by
  into actor_profile_id
  from public.attendance_records as attendance_record
  where attendance_record.id = new.attendance_record_id;

  if new.event_type = 'absence_confirmed' then
    notification_title := 'تنبيه حضور — ' || new.school_name;
    notification_body := 'لم يُسجَّل حضور ' || new.student_name
      || ' في ' || new.class_name || ' بتاريخ ' || new.session_date::text
      || '. يرجى التأكد من سلامته.';
  else
    notification_title := 'تحديث الحضور — ' || new.school_name;
    notification_body := case new.new_status
      when 'late' then 'تم تسجيل حضور ' || new.student_name || ' متأخرًا في '
        || new.class_name || ' بتاريخ ' || new.session_date::text || '.'
      when 'present' then 'تم تصحيح الحضور: سُجّل ' || new.student_name
        || ' حاضرًا في ' || new.class_name || ' بتاريخ ' || new.session_date::text || '.'
      else 'تم تحديث حالة ' || new.student_name || ' إلى غياب بعذر في '
        || new.class_name || ' بتاريخ ' || new.session_date::text || '.'
    end;
  end if;

  for guardian_profile_id in
    select distinct relationship.guardian_profile_id
    from public.student_guardians as relationship
    join public.profiles as guardian_profile
      on guardian_profile.id = relationship.guardian_profile_id
     and guardian_profile.status = 'active'
    where relationship.school_id = new.school_id
      and relationship.student_id = new.student_id
      and relationship.status = 'active'
  loop
    perform public.create_app_notification_internal(
      new.school_id,
      guardian_profile_id,
      actor_profile_id,
      new.student_id,
      'attendance',
      new.event_type,
      notification_title,
      notification_body,
      '/parent/students/' || new.student_id::text,
      'guardian_attendance',
      new.id
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.queue_guardian_attendance_app_notification()
from public, anon, authenticated;

create trigger guardian_notification_events_app_center
after insert on public.guardian_notification_events
for each row execute function public.queue_guardian_attendance_app_notification();

-- Backfill any V2 events that might have been created between migrations 024 and
-- 025. sender_profile_id is deliberately NULL rather than guessing a historical
-- actor from the current attendance row.
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
  created_at
)
select
  event.school_id,
  relationship.guardian_profile_id,
  null,
  event.student_id,
  'attendance',
  event.event_type,
  case event.event_type
    when 'absence_confirmed' then 'تنبيه حضور — ' || event.school_name
    else 'تحديث الحضور — ' || event.school_name
  end,
  case
    when event.event_type = 'absence_confirmed' then
      'لم يُسجَّل حضور ' || event.student_name || ' في ' || event.class_name
      || ' بتاريخ ' || event.session_date::text || '. يرجى التأكد من سلامته.'
    when event.new_status = 'late' then
      'تم تسجيل حضور ' || event.student_name || ' متأخرًا في ' || event.class_name
      || ' بتاريخ ' || event.session_date::text || '.'
    when event.new_status = 'present' then
      'تم تصحيح الحضور: سُجّل ' || event.student_name || ' حاضرًا في '
      || event.class_name || ' بتاريخ ' || event.session_date::text || '.'
    else
      'تم تحديث حالة ' || event.student_name || ' إلى غياب بعذر في '
      || event.class_name || ' بتاريخ ' || event.session_date::text || '.'
  end,
  '/parent/students/' || event.student_id::text,
  'guardian_attendance',
  event.id,
  event.created_at
from public.guardian_notification_events as event
join public.student_guardians as relationship
  on relationship.school_id = event.school_id
 and relationship.student_id = event.student_id
 and relationship.status = 'active'
join public.profiles as guardian_profile
  on guardian_profile.id = relationship.guardian_profile_id
 and guardian_profile.status = 'active'
on conflict (recipient_profile_id, source_type, source_id) do nothing;

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
        'administration', 'learning', 'attendance', 'finance', 'guardians', 'system'
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

create or replace function public.get_my_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or not public.current_profile_is_active() then 0
    else (
      select count(*)::integer
      from public.app_notifications as notification
      where notification.recipient_profile_id = (select auth.uid())
        and notification.read_at is null
    )
  end;
$$;

create or replace function public.mark_my_app_notification_read(
  target_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  update public.app_notifications as notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = target_notification_id
    and notification.recipient_profile_id = (select auth.uid());

  return found;
end;
$$;

revoke all on function public.list_my_app_notifications(text, text, integer)
from public, anon;
revoke all on function public.get_my_unread_notification_count()
from public, anon;
revoke all on function public.mark_my_app_notification_read(uuid)
from public, anon;
grant execute on function public.list_my_app_notifications(text, text, integer)
to authenticated;
grant execute on function public.get_my_unread_notification_count()
to authenticated;
grant execute on function public.mark_my_app_notification_read(uuid)
to authenticated;

commit;
