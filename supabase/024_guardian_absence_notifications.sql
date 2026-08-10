-- Quran School SaaS - guardian absence notification outbox
-- Queues guardian Web Push work from confirmed attendance transitions without
-- making external network delivery part of the attendance transaction.

begin;

create table public.guardian_notification_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  attendance_session_id uuid not null,
  attendance_record_id uuid not null,
  event_type text not null,
  old_status text,
  new_status text not null,
  school_name text not null,
  student_name text not null,
  class_name text not null,
  session_date date not null,
  created_at timestamptz not null default now(),
  constraint guardian_notification_events_school_fk
    foreign key (school_id) references public.schools(id),
  constraint guardian_notification_events_student_fk
    foreign key (student_id) references public.students(id),
  constraint guardian_notification_events_session_fk
    foreign key (attendance_session_id)
    references public.attendance_sessions(id),
  constraint guardian_notification_events_record_fk
    foreign key (attendance_record_id)
    references public.attendance_records(id),
  constraint guardian_notification_events_type_check
    check (event_type in ('absence_confirmed', 'absence_corrected')),
  constraint guardian_notification_events_old_status_check
    check (
      old_status is null
      or old_status in ('present', 'absent', 'late', 'excused_absence')
    ),
  constraint guardian_notification_events_new_status_check
    check (new_status in ('present', 'absent', 'late', 'excused_absence')),
  constraint guardian_notification_events_record_event_unique
    unique (attendance_record_id, event_type)
);

comment on table public.guardian_notification_events is
  'Server-only attendance notification events. At most one absence alert and one correction are emitted per student attendance record.';

create table public.guardian_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  guardian_profile_id uuid not null,
  subscription_id uuid,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_notification_deliveries_event_fk
    foreign key (event_id)
    references public.guardian_notification_events(id)
    on delete cascade,
  constraint guardian_notification_deliveries_guardian_fk
    foreign key (guardian_profile_id)
    references public.profiles(id),
  constraint guardian_notification_deliveries_subscription_fk
    foreign key (subscription_id)
    references public.guardian_push_subscriptions(id)
    on delete set null,
  constraint guardian_notification_deliveries_status_check
    check (
      status in (
        'pending',
        'processing',
        'retry',
        'delivered',
        'invalid_subscription',
        'failed',
        'cancelled'
      )
    ),
  constraint guardian_notification_deliveries_attempts_check
    check (attempts between 0 and 5),
  constraint guardian_notification_deliveries_event_subscription_unique
    unique (event_id, subscription_id)
);

comment on table public.guardian_notification_deliveries is
  'Server-only Web Push outbox. Delivery always rechecks the active guardian relationship and current subscription ownership before claim.';

create index guardian_notification_events_school_created_idx
  on public.guardian_notification_events (school_id, created_at desc);

create index guardian_notification_deliveries_pending_idx
  on public.guardian_notification_deliveries (status, next_attempt_at, created_at)
  where status in ('pending', 'retry');

create index guardian_notification_deliveries_guardian_idx
  on public.guardian_notification_deliveries (guardian_profile_id, created_at desc);

create trigger guardian_notification_deliveries_set_updated_at
before update on public.guardian_notification_deliveries
for each row execute function public.set_updated_at();

alter table public.guardian_notification_events enable row level security;
alter table public.guardian_notification_deliveries enable row level security;

revoke all on public.guardian_notification_events,
  public.guardian_notification_deliveries
from public, anon, authenticated;

-- Queue only meaningful attendance state transitions. Re-saving the same absent
-- state is a no-op. The unique event key also prevents repeated alerts for the
-- same student/session if an operator toggles the state more than once.
create or replace function public.queue_guardian_attendance_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_event_id uuid;
  queued_event_type text;
  resolved_school_name text;
  resolved_student_name text;
  resolved_class_name text;
  resolved_session_date date;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'absent' then
      return new;
    end if;
    queued_event_type := 'absence_confirmed';
  elsif old.status is not distinct from new.status then
    return new;
  elsif old.status <> 'absent' and new.status = 'absent' then
    queued_event_type := 'absence_confirmed';
  elsif old.status = 'absent'
    and new.status in ('present', 'late', 'excused_absence')
  then
    if not exists (
      select 1
      from public.guardian_notification_events as prior_event
      where prior_event.attendance_record_id = new.id
        and prior_event.event_type = 'absence_confirmed'
    ) then
      return new;
    end if;
    queued_event_type := 'absence_corrected';
  else
    return new;
  end if;

  select school.name
  into strict resolved_school_name
  from public.schools as school
  where school.id = new.school_id;

  select concat_ws(' ', student.first_name, student.last_name)
  into strict resolved_student_name
  from public.students as student
  where student.id = new.student_id
    and student.school_id = new.school_id;

  select class.name
  into strict resolved_class_name
  from public.classes as class
  where class.id = new.class_id
    and class.school_id = new.school_id
    and class.branch_id = new.branch_id;

  select session.session_date
  into strict resolved_session_date
  from public.attendance_sessions as session
  where session.id = new.session_id
    and session.school_id = new.school_id
    and session.branch_id = new.branch_id
    and session.class_id = new.class_id;

  insert into public.guardian_notification_events (
    school_id,
    student_id,
    attendance_session_id,
    attendance_record_id,
    event_type,
    old_status,
    new_status,
    school_name,
    student_name,
    class_name,
    session_date
  ) values (
    new.school_id,
    new.student_id,
    new.session_id,
    new.id,
    queued_event_type,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    resolved_school_name,
    resolved_student_name,
    resolved_class_name,
    resolved_session_date
  )
  on conflict (attendance_record_id, event_type) do nothing
  returning id into queued_event_id;

  if queued_event_id is null then
    return new;
  end if;

  insert into public.guardian_notification_deliveries (
    event_id,
    guardian_profile_id,
    subscription_id
  )
  select
    queued_event_id,
    relationship.guardian_profile_id,
    subscription.id
  from public.student_guardians as relationship
  join public.profiles as guardian_profile
    on guardian_profile.id = relationship.guardian_profile_id
   and guardian_profile.status = 'active'
  join public.guardian_push_subscriptions as subscription
    on subscription.guardian_profile_id = relationship.guardian_profile_id
  where relationship.school_id = new.school_id
    and relationship.student_id = new.student_id
    and relationship.status = 'active'
  on conflict (event_id, subscription_id) do nothing;

  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23503',
      message = 'GUARDIAN_NOTIFICATION_ATTENDANCE_SCOPE_NOT_FOUND';
end;
$$;

revoke all on function public.queue_guardian_attendance_notification()
from public;
revoke execute on function public.queue_guardian_attendance_notification()
from anon, authenticated;

create trigger attendance_records_guardian_notification
after insert or update of status on public.attendance_records
for each row execute function public.queue_guardian_attendance_notification();

-- Service-only claim RPC. It first cancels work whose guardian link was revoked
-- or whose subscription no longer belongs to that guardian, then atomically
-- claims due work with SKIP LOCKED for safe concurrent workers.
create or replace function public.claim_guardian_push_deliveries(
  target_limit integer default 25
)
returns table (
  delivery_id uuid,
  event_id uuid,
  subscription_id uuid,
  guardian_profile_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  event_type text,
  school_name text,
  student_name text,
  class_name text,
  session_date date,
  new_status text,
  attempt_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_limit is null or target_limit < 1 or target_limit > 100 then
    raise exception using
      errcode = '22023',
      message = 'invalid delivery claim limit';
  end if;

  update public.guardian_notification_deliveries as delivery
  set status = 'cancelled',
      last_error_code = 'guardian_or_subscription_inactive'
  from public.guardian_notification_events as event
  where event.id = delivery.event_id
    and delivery.status in ('pending', 'retry')
    and (
      delivery.subscription_id is null
      or not exists (
        select 1
        from public.guardian_push_subscriptions as subscription
        where subscription.id = delivery.subscription_id
          and subscription.guardian_profile_id = delivery.guardian_profile_id
      )
      or not exists (
        select 1
        from public.student_guardians as relationship
        where relationship.school_id = event.school_id
          and relationship.student_id = event.student_id
          and relationship.guardian_profile_id = delivery.guardian_profile_id
          and relationship.status = 'active'
      )
    );

  return query
  with candidates as (
    select delivery.id
    from public.guardian_notification_deliveries as delivery
    join public.guardian_notification_events as event
      on event.id = delivery.event_id
    join public.guardian_push_subscriptions as subscription
      on subscription.id = delivery.subscription_id
     and subscription.guardian_profile_id = delivery.guardian_profile_id
    where delivery.status in ('pending', 'retry')
      and delivery.next_attempt_at <= now()
      and delivery.attempts < 5
      and exists (
        select 1
        from public.student_guardians as relationship
        where relationship.school_id = event.school_id
          and relationship.student_id = event.student_id
          and relationship.guardian_profile_id = delivery.guardian_profile_id
          and relationship.status = 'active'
      )
    order by delivery.created_at, delivery.id
    for update of delivery skip locked
    limit target_limit
  ), claimed as (
    update public.guardian_notification_deliveries as delivery
    set status = 'processing',
        attempts = delivery.attempts + 1,
        processing_started_at = now(),
        last_error_code = null
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select
    claimed.id,
    event.id,
    subscription.id,
    claimed.guardian_profile_id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth_key,
    event.event_type,
    event.school_name,
    event.student_name,
    event.class_name,
    event.session_date,
    event.new_status,
    claimed.attempts
  from claimed
  join public.guardian_notification_events as event
    on event.id = claimed.event_id
  join public.guardian_push_subscriptions as subscription
    on subscription.id = claimed.subscription_id
   and subscription.guardian_profile_id = claimed.guardian_profile_id
  order by claimed.created_at, claimed.id;
end;
$$;

create or replace function public.finish_guardian_push_delivery(
  target_delivery_id uuid,
  target_outcome text,
  target_error_code text default null,
  target_retry_after_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempts integer;
  current_subscription_id uuid;
begin
  if target_outcome not in ('delivered', 'retry', 'invalid_subscription', 'failed') then
    raise exception using
      errcode = '22023',
      message = 'invalid guardian push delivery outcome';
  end if;

  if target_retry_after_seconds is null
    or target_retry_after_seconds < 1
    or target_retry_after_seconds > 3600
  then
    raise exception using
      errcode = '22023',
      message = 'invalid guardian push retry delay';
  end if;

  select delivery.attempts, delivery.subscription_id
  into current_attempts, current_subscription_id
  from public.guardian_notification_deliveries as delivery
  where delivery.id = target_delivery_id
    and delivery.status = 'processing'
  for update;

  if not found then
    return false;
  end if;

  if target_outcome = 'delivered' then
    update public.guardian_notification_deliveries
    set status = 'delivered',
        delivered_at = now(),
        processing_started_at = null,
        last_error_code = null
    where id = target_delivery_id;
  elsif target_outcome = 'invalid_subscription' then
    update public.guardian_notification_deliveries
    set status = 'invalid_subscription',
        processing_started_at = null,
        last_error_code = left(coalesce(target_error_code, 'push_subscription_invalid'), 120)
    where id = target_delivery_id;

    if current_subscription_id is not null then
      delete from public.guardian_push_subscriptions
      where id = current_subscription_id;
    end if;
  elsif target_outcome = 'retry' and current_attempts < 5 then
    update public.guardian_notification_deliveries
    set status = 'retry',
        next_attempt_at = now() + make_interval(secs => target_retry_after_seconds),
        processing_started_at = null,
        last_error_code = left(coalesce(target_error_code, 'push_transient_failure'), 120)
    where id = target_delivery_id;
  else
    update public.guardian_notification_deliveries
    set status = 'failed',
        processing_started_at = null,
        last_error_code = left(coalesce(target_error_code, 'push_delivery_failed'), 120)
    where id = target_delivery_id;
  end if;

  return true;
end;
$$;

-- Requeue a worker claim that was abandoned without a completion callback.
create or replace function public.requeue_stale_guardian_push_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer;
begin
  update public.guardian_notification_deliveries
  set status = case when attempts < 5 then 'retry' else 'failed' end,
      next_attempt_at = now(),
      processing_started_at = null,
      last_error_code = 'worker_claim_timeout'
  where status = 'processing'
    and processing_started_at < now() - interval '5 minutes';

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.claim_guardian_push_deliveries(integer)
from public;
revoke execute on function public.claim_guardian_push_deliveries(integer)
from anon, authenticated;
grant execute on function public.claim_guardian_push_deliveries(integer)
to service_role;

revoke all on function public.finish_guardian_push_delivery(uuid, text, text, integer)
from public;
revoke execute on function public.finish_guardian_push_delivery(uuid, text, text, integer)
from anon, authenticated;
grant execute on function public.finish_guardian_push_delivery(uuid, text, text, integer)
to service_role;

revoke all on function public.requeue_stale_guardian_push_deliveries()
from public;
revoke execute on function public.requeue_stale_guardian_push_deliveries()
from anon, authenticated;
grant execute on function public.requeue_stale_guardian_push_deliveries()
to service_role;

commit;
