-- Quran School SaaS - guardian push notification foundation
-- Stores browser push subscriptions without exposing them to the Data API.
-- Attendance-triggered notification delivery is intentionally deferred to a later PR.

begin;

create table public.guardian_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  guardian_profile_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_push_subscriptions_guardian_profile_fk
    foreign key (guardian_profile_id)
    references public.profiles(id)
    on delete cascade,
  constraint guardian_push_subscriptions_endpoint_unique
    unique (endpoint),
  constraint guardian_push_subscriptions_endpoint_check
    check (
      endpoint ~ '^https://'
      and octet_length(endpoint) between 16 and 4096
    ),
  constraint guardian_push_subscriptions_p256dh_check
    check (
      p256dh ~ '^[A-Za-z0-9_-]+$'
      and char_length(p256dh) between 40 and 256
    ),
  constraint guardian_push_subscriptions_auth_key_check
    check (
      auth_key ~ '^[A-Za-z0-9_-]+$'
      and char_length(auth_key) between 8 and 128
    ),
  constraint guardian_push_subscriptions_user_agent_check
    check (
      user_agent is null
      or octet_length(user_agent) <= 512
    )
);

comment on table public.guardian_push_subscriptions is
  'Private Web Push subscriptions. Browser table access is denied; guardians register and remove only their own device through scoped RPCs.';
comment on column public.guardian_push_subscriptions.endpoint is
  'Push-service endpoint. Treated as sensitive device-routing data and never exposed to staff or other guardians.';

create index guardian_push_subscriptions_guardian_idx
  on public.guardian_push_subscriptions (guardian_profile_id, updated_at desc);

create trigger guardian_push_subscriptions_set_updated_at
before update on public.guardian_push_subscriptions
for each row execute function public.set_updated_at();

alter table public.guardian_push_subscriptions enable row level security;

revoke all on public.guardian_push_subscriptions
from public, anon, authenticated;

-- A browser push endpoint belongs to exactly one signed-in guardian at a time.
-- Re-registering the same browser under another guardian atomically transfers
-- ownership, preventing notifications for the previous account on a shared device.
create or replace function public.register_my_guardian_push_subscription(
  target_endpoint text,
  target_p256dh text,
  target_auth_key text,
  target_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_endpoint text := btrim(target_endpoint);
  normalized_p256dh text := btrim(target_p256dh);
  normalized_auth_key text := btrim(target_auth_key);
  normalized_user_agent text := nullif(btrim(target_user_agent), '');
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = current_user_id
      and profile.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'active profile required';
  end if;

  if not exists (
    select 1
    from public.student_guardians as relationship
    join public.students as student
      on student.school_id = relationship.school_id
     and student.id = relationship.student_id
    join public.schools as school
      on school.id = relationship.school_id
    where relationship.guardian_profile_id = current_user_id
      and relationship.status = 'active'
      and student.status not in ('transferred', 'graduated', 'withdrawn')
      and school.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'active guardian relationship required';
  end if;

  if normalized_endpoint is null
    or normalized_endpoint !~ '^https://'
    or octet_length(normalized_endpoint) not between 16 and 4096
    or normalized_p256dh is null
    or normalized_p256dh !~ '^[A-Za-z0-9_-]+$'
    or char_length(normalized_p256dh) not between 40 and 256
    or normalized_auth_key is null
    or normalized_auth_key !~ '^[A-Za-z0-9_-]+$'
    or char_length(normalized_auth_key) not between 8 and 128
    or (
      normalized_user_agent is not null
      and octet_length(normalized_user_agent) > 512
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid push subscription';
  end if;

  insert into public.guardian_push_subscriptions (
    guardian_profile_id,
    endpoint,
    p256dh,
    auth_key,
    user_agent,
    last_seen_at
  ) values (
    current_user_id,
    normalized_endpoint,
    normalized_p256dh,
    normalized_auth_key,
    normalized_user_agent,
    now()
  )
  on conflict (endpoint) do update
  set guardian_profile_id = excluded.guardian_profile_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      user_agent = excluded.user_agent,
      last_seen_at = now();

  return true;
end;
$$;

create or replace function public.delete_my_guardian_push_subscription(
  target_endpoint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_endpoint text := btrim(target_endpoint);
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if normalized_endpoint is null
    or normalized_endpoint !~ '^https://'
    or octet_length(normalized_endpoint) not between 16 and 4096
  then
    raise exception using
      errcode = '22023',
      message = 'invalid push endpoint';
  end if;

  delete from public.guardian_push_subscriptions as subscription
  where subscription.guardian_profile_id = current_user_id
    and subscription.endpoint = normalized_endpoint;

  return true;
end;
$$;

revoke all on function public.register_my_guardian_push_subscription(text, text, text, text)
from public;
revoke execute on function public.register_my_guardian_push_subscription(text, text, text, text)
from anon;
grant execute on function public.register_my_guardian_push_subscription(text, text, text, text)
to authenticated;

revoke all on function public.delete_my_guardian_push_subscription(text)
from public;
revoke execute on function public.delete_my_guardian_push_subscription(text)
from anon;
grant execute on function public.delete_my_guardian_push_subscription(text)
to authenticated;

commit;
