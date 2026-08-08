-- Quran School SaaS - guardian invitation and activation
-- Guardian / Parent Portal PR B only. No parent-facing academic or finance access.

begin;

create table public.guardian_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  student_guardian_id uuid not null,
  guardian_profile_id uuid not null,
  invited_by uuid not null,
  target_email text not null,
  status text not null default 'prepared',
  requires_password_setup boolean not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  sent_at timestamptz,
  accepted_at timestamptz,
  failed_at timestamptz,
  revoked_at timestamptz,
  failure_code text,
  idempotency_key_hash text not null,
  request_payload_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_invitations_relationship_scope_fk
    foreign key (
      school_id,
      student_id,
      student_guardian_id,
      guardian_profile_id
    )
    references public.student_guardians (
      school_id,
      student_id,
      id,
      guardian_profile_id
    )
    on delete restrict,
  constraint guardian_invitations_invited_by_fk
    foreign key (invited_by)
    references public.profiles(id)
    on delete restrict,
  constraint guardian_invitations_status_check
    check (
      status in (
        'prepared',
        'sent',
        'accepted',
        'failed',
        'expired',
        'revoked'
      )
    ),
  constraint guardian_invitations_email_normalized_check
    check (
      target_email = lower(btrim(target_email))
      and char_length(target_email) between 3 and 254
      and target_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint guardian_invitations_idempotency_hash_check
    check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  constraint guardian_invitations_payload_hash_check
    check (request_payload_hash ~ '^[0-9a-f]{64}$'),
  constraint guardian_invitations_failure_code_check
    check (
      failure_code is null
      or (
        char_length(failure_code) between 3 and 64
        and failure_code ~ '^[a-z][a-z0-9_]*$'
      )
    ),
  constraint guardian_invitations_expiration_check
    check (expires_at > created_at),
  constraint guardian_invitations_lifecycle_check
    check (
      (
        status = 'prepared'
        and sent_at is null
        and accepted_at is null
        and failed_at is null
        and revoked_at is null
        and failure_code is null
      )
      or (
        status = 'sent'
        and sent_at is not null
        and accepted_at is null
        and failed_at is null
        and revoked_at is null
        and failure_code is null
      )
      or (
        status = 'accepted'
        and sent_at is not null
        and accepted_at is not null
        and failed_at is null
        and revoked_at is null
        and failure_code is null
      )
      or (
        status = 'failed'
        and accepted_at is null
        and failed_at is not null
        and revoked_at is null
        and failure_code is not null
      )
      or (
        status = 'expired'
        and accepted_at is null
        and failed_at is null
        and revoked_at is null
        and failure_code is null
      )
      or (
        status = 'revoked'
        and accepted_at is null
        and failed_at is null
        and revoked_at is not null
        and failure_code is null
      )
    )
);

comment on table public.guardian_invitations is
  'Tenant-safe guardian invitation lifecycle. No credentials, Auth tokens, OTP values, confirmation tokens, or raw idempotency keys are stored.';
comment on column public.guardian_invitations.target_email is
  'Normalized PII used only for delivery and account matching; it is never an authorization source.';
comment on column public.guardian_invitations.idempotency_key_hash is
  'SHA-256 hash of the caller-provided Idempotency-Key; the raw key is never persisted.';
comment on column public.guardian_invitations.request_payload_hash is
  'SHA-256 hash of the normalized request payload used to reject key reuse with different input.';
comment on column public.guardian_invitations.requires_password_setup is
  'Recipient-only acceptance hint. It is never returned to the inviting staff member.';

create unique index guardian_invitations_idempotency_unique_idx
  on public.guardian_invitations (idempotency_key_hash);

create unique index guardian_invitations_live_relationship_unique_idx
  on public.guardian_invitations (student_guardian_id)
  where status in ('prepared', 'sent');

create index guardian_invitations_school_student_status_idx
  on public.guardian_invitations (
    school_id,
    student_id,
    status,
    created_at desc
  );

create index guardian_invitations_guardian_status_idx
  on public.guardian_invitations (
    guardian_profile_id,
    status,
    created_at desc
  );

create unique index guardian_access_events_relationship_activation_unique_idx
  on public.guardian_access_events (student_guardian_id)
  where event_type = 'relationship_activated';

create or replace function public.validate_guardian_invitation_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'prepared' then
      raise exception using
        errcode = '23514',
        message = 'guardian invitation must start prepared';
    end if;

    if new.expires_at <= now()
      or new.expires_at > now() + interval '30 days'
    then
      raise exception using
        errcode = '23514',
        message = 'guardian invitation expiration is invalid';
    end if;
  else
    if new.school_id <> old.school_id
      or new.student_id <> old.student_id
      or new.student_guardian_id <> old.student_guardian_id
      or new.guardian_profile_id <> old.guardian_profile_id
      or new.invited_by <> old.invited_by
      or new.target_email <> old.target_email
      or new.requires_password_setup <> old.requires_password_setup
      or new.expires_at <> old.expires_at
      or new.idempotency_key_hash <> old.idempotency_key_hash
      or new.request_payload_hash <> old.request_payload_hash
      or new.created_at <> old.created_at
    then
      raise exception using
        errcode = '23514',
        message = 'guardian invitation identity is immutable';
    end if;

    if not (
      (old.status = 'prepared' and new.status in (
        'prepared', 'sent', 'failed', 'expired', 'revoked'
      ))
      or (old.status = 'sent' and new.status in (
        'sent', 'accepted', 'failed', 'expired', 'revoked'
      ))
      or (old.status = 'accepted' and new.status = 'accepted')
      or (old.status = 'failed' and new.status = 'failed')
      or (old.status = 'expired' and new.status = 'expired')
      or (old.status = 'revoked' and new.status = 'revoked')
    ) then
      raise exception using
        errcode = '23514',
        message = 'guardian invitation transition is invalid';
    end if;
  end if;

  return new;
end;
$$;

create trigger guardian_invitations_validate_write
before insert or update on public.guardian_invitations
for each row execute function public.validate_guardian_invitation_write();

create trigger guardian_invitations_set_updated_at
before update on public.guardian_invitations
for each row execute function public.set_updated_at();

alter table public.guardian_invitations enable row level security;

revoke all on public.guardian_invitations
from public, anon, authenticated;
grant select, insert, update on public.guardian_invitations to service_role;

-- Scoped preflight for retries. It runs before any Auth account work so reuse
-- of a key with a different payload cannot create or mutate an account.
create or replace function public.get_guardian_invitation_retry(
  target_school_id uuid,
  target_student_id uuid,
  target_idempotency_key_hash text,
  target_request_payload_hash text
)
returns table (
  invitation_id uuid,
  invitation_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  attempt public.guardian_invitations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if target_school_id is null
    or target_student_id is null
    or target_idempotency_key_hash !~ '^[0-9a-f]{64}$'
    or target_request_payload_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid invitation retry input';
  end if;

  if not public.can_manage_student_guardian(
    target_school_id,
    target_student_id,
    'guardians.invite'
  ) or not public.can_manage_student_guardian(
    target_school_id,
    target_student_id,
    'guardians.link'
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select invitation.*
  into attempt
  from public.guardian_invitations as invitation
  where invitation.idempotency_key_hash = target_idempotency_key_hash;

  if not found then
    return;
  end if;

  if attempt.school_id <> target_school_id
    or attempt.student_id <> target_student_id
    or attempt.request_payload_hash <> target_request_payload_hash
  then
    raise exception using errcode = '22023', message = 'idempotency payload mismatch';
  end if;

  return query select attempt.id, attempt.status;
end;
$$;

-- The Edge Function resolves the global Auth/Profile identity, then this RPC
-- prepares the relationship and invitation atomically after tenant/branch checks.
create or replace function public.prepare_guardian_invitation(
  target_school_id uuid,
  target_student_id uuid,
  target_student_guardian_id uuid,
  target_guardian_profile_id uuid,
  target_email text,
  target_relationship_type text,
  target_is_primary boolean,
  target_idempotency_key_hash text,
  target_request_payload_hash text,
  target_requires_password_setup boolean
)
returns table (
  invitation_id uuid,
  invitation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(target_email));
  auth_email text;
  relationship_record public.student_guardians%rowtype;
  existing_attempt public.guardian_invitations%rowtype;
  resolved_relationship_id uuid;
  created_invitation_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if target_school_id is null
    or target_student_id is null
    or target_guardian_profile_id is null
    or normalized_email is null
    or normalized_email <> target_email
    or target_relationship_type is null
    or target_relationship_type not in (
      'father',
      'mother',
      'legal_guardian',
      'relative',
      'other'
    )
    or target_is_primary is null
    or target_idempotency_key_hash !~ '^[0-9a-f]{64}$'
    or target_request_payload_hash !~ '^[0-9a-f]{64}$'
    or target_requires_password_setup is null
  then
    raise exception using errcode = '22023', message = 'invalid invitation input';
  end if;

  if not public.can_manage_student_guardian(
    target_school_id,
    target_student_id,
    'guardians.invite'
  ) or not public.can_manage_student_guardian(
    target_school_id,
    target_student_id,
    'guardians.link'
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_idempotency_key_hash, 0)
  );

  select invitation.*
  into existing_attempt
  from public.guardian_invitations as invitation
  where invitation.idempotency_key_hash = target_idempotency_key_hash
  for update;

  if found then
    if existing_attempt.school_id <> target_school_id
      or existing_attempt.student_id <> target_student_id
      or existing_attempt.guardian_profile_id <> target_guardian_profile_id
      or existing_attempt.target_email <> normalized_email
      or existing_attempt.request_payload_hash <> target_request_payload_hash
      or existing_attempt.requires_password_setup <> target_requires_password_setup
      or not exists (
        select 1
        from public.student_guardians as relationship
        where relationship.id = existing_attempt.student_guardian_id
          and relationship.school_id = existing_attempt.school_id
          and relationship.student_id = existing_attempt.student_id
          and relationship.guardian_profile_id = existing_attempt.guardian_profile_id
          and relationship.relationship_type = target_relationship_type
          and relationship.is_primary = target_is_primary
      )
    then
      raise exception using errcode = '22023', message = 'idempotency payload mismatch';
    end if;

    return query select existing_attempt.id, existing_attempt.status;
    return;
  end if;

  resolved_relationship_id := target_student_guardian_id;
  if resolved_relationship_id is null then
    resolved_relationship_id := public.prepare_student_guardian_link(
      target_school_id,
      target_student_id,
      target_guardian_profile_id,
      target_relationship_type,
      target_is_primary
    );
  end if;

  select relationship.*
  into relationship_record
  from public.student_guardians as relationship
  join public.students as student
    on student.school_id = relationship.school_id
   and student.id = relationship.student_id
   and student.status not in ('transferred', 'graduated', 'withdrawn')
  join public.schools as school
    on school.id = relationship.school_id
   and school.status = 'active'
  join public.profiles as guardian_profile
    on guardian_profile.id = relationship.guardian_profile_id
   and guardian_profile.status = 'active'
  where relationship.id = resolved_relationship_id
    and relationship.school_id = target_school_id
    and relationship.student_id = target_student_id
    and relationship.guardian_profile_id = target_guardian_profile_id
    and relationship.relationship_type = target_relationship_type
    and relationship.is_primary = target_is_primary
  for update of relationship;

  if not found or relationship_record.status <> 'pending' then
    raise exception using errcode = '23514', message = 'guardian relationship is not pending';
  end if;

  select lower(btrim(auth_user.email))
  into auth_email
  from auth.users as auth_user
  where auth_user.id = target_guardian_profile_id;

  if not found or auth_email is null or auth_email <> normalized_email then
    raise exception using errcode = '23514', message = 'guardian auth identity mismatch';
  end if;

  if exists (
    select 1
    from public.guardian_invitations as invitation
    where invitation.student_guardian_id = relationship_record.id
      and invitation.status in ('prepared', 'sent')
  ) then
    raise exception using errcode = '23505', message = 'live guardian invitation already exists';
  end if;

  insert into public.guardian_invitations (
    school_id,
    student_id,
    student_guardian_id,
    guardian_profile_id,
    invited_by,
    target_email,
    status,
    requires_password_setup,
    idempotency_key_hash,
    request_payload_hash
  ) values (
    relationship_record.school_id,
    relationship_record.student_id,
    relationship_record.id,
    relationship_record.guardian_profile_id,
    current_user_id,
    normalized_email,
    'prepared',
    target_requires_password_setup,
    target_idempotency_key_hash,
    target_request_payload_hash
  ) returning id into created_invitation_id;

  return query select created_invitation_id, 'prepared'::text;
end;
$$;

-- Claim delivery before contacting the external Auth mailer. The row lock makes
-- retries and concurrent requests deliver at most once.
create or replace function public.claim_guardian_invitation_delivery(
  target_invitation_id uuid
)
returns table (
  invitation_id uuid,
  invitation_status text,
  target_email text,
  delivery_claimed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.guardian_invitations%rowtype;
begin
  select invitation.*
  into attempt
  from public.guardian_invitations as invitation
  where invitation.id = target_invitation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'guardian invitation not found';
  end if;

  if attempt.status = 'prepared' and attempt.expires_at <= now() then
    update public.guardian_invitations as invitation
    set status = 'expired'
    where invitation.id = attempt.id
      and invitation.status = 'prepared';

    return query select attempt.id, 'expired'::text, attempt.target_email, false;
    return;
  end if;

  if attempt.status <> 'prepared' then
    return query select attempt.id, attempt.status, attempt.target_email, false;
    return;
  end if;

  update public.guardian_invitations as invitation
  set status = 'sent',
      sent_at = now()
  where invitation.id = attempt.id
    and invitation.status = 'prepared';

  if not found then
    raise exception using errcode = '40001', message = 'guardian delivery claim race';
  end if;

  return query select attempt.id, 'sent'::text, attempt.target_email, true;
end;
$$;

create or replace function public.fail_guardian_invitation_delivery(
  target_invitation_id uuid,
  target_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := lower(btrim(target_failure_code));
begin
  if normalized_code is null
    or normalized_code !~ '^[a-z][a-z0-9_]{2,63}$'
  then
    raise exception using errcode = '22023', message = 'invalid failure code';
  end if;

  update public.guardian_invitations as invitation
  set status = 'failed',
      failed_at = now(),
      failure_code = normalized_code
  where invitation.id = target_invitation_id
    and invitation.status in ('prepared', 'sent');

  return found;
end;
$$;

create or replace function public.get_my_guardian_invitation(
  target_invitation_id uuid
)
returns table (
  invitation_id uuid,
  invitation_status text,
  requires_password_setup boolean,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invitation.id,
    invitation.status,
    invitation.requires_password_setup,
    invitation.expires_at
  from public.guardian_invitations as invitation
  join public.student_guardians as relationship
    on relationship.school_id = invitation.school_id
   and relationship.student_id = invitation.student_id
   and relationship.id = invitation.student_guardian_id
   and relationship.guardian_profile_id = invitation.guardian_profile_id
  join public.profiles as guardian_profile
    on guardian_profile.id = invitation.guardian_profile_id
   and guardian_profile.status = 'active'
  where invitation.id = target_invitation_id
    and invitation.guardian_profile_id = (select auth.uid())
    and (
      (
        invitation.status = 'sent'
        and relationship.status = 'pending'
        and invitation.expires_at > now()
      )
      or (
        invitation.status = 'accepted'
        and relationship.status = 'active'
      )
    );
$$;

create or replace function public.activate_guardian_invitation(
  target_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invitation_snapshot public.guardian_invitations%rowtype;
  invitation_record public.guardian_invitations%rowtype;
  relationship_record public.student_guardians%rowtype;
  activation_time timestamptz := now();
  school_status text;
  student_status text;
  profile_status text;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select invitation.*
  into invitation_snapshot
  from public.guardian_invitations as invitation
  where invitation.id = target_invitation_id;

  if not found or invitation_snapshot.guardian_profile_id <> current_user_id then
    raise exception using errcode = '42501', message = 'invitation is unavailable';
  end if;

  select relationship.*
  into relationship_record
  from public.student_guardians as relationship
  where relationship.school_id = invitation_snapshot.school_id
    and relationship.student_id = invitation_snapshot.student_id
    and relationship.id = invitation_snapshot.student_guardian_id
    and relationship.guardian_profile_id = current_user_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'invitation relationship mismatch';
  end if;

  select invitation.*
  into invitation_record
  from public.guardian_invitations as invitation
  where invitation.id = invitation_snapshot.id
  for update;

  if not found or invitation_record.guardian_profile_id <> current_user_id then
    raise exception using errcode = '42501', message = 'invitation is unavailable';
  end if;

  select profile.status
  into profile_status
  from public.profiles as profile
  where profile.id = current_user_id;

  if not found or profile_status <> 'active' then
    raise exception using errcode = '23514', message = 'guardian profile is inactive';
  end if;

  if invitation_record.status = 'accepted' then
    if relationship_record.status = 'active'
      and relationship_record.activated_at is not null
      and invitation_record.accepted_at is not null
    then
      return true;
    end if;

    raise exception using errcode = '23514', message = 'accepted invitation state is inconsistent';
  end if;

  if invitation_record.status <> 'sent'
    or invitation_record.expires_at <= activation_time
  then
    raise exception using errcode = '23514', message = 'invitation is not activatable';
  end if;

  if relationship_record.status <> 'pending'
    or relationship_record.activated_at is not null
  then
    raise exception using errcode = '23514', message = 'guardian relationship is not pending';
  end if;

  select school.status
  into school_status
  from public.schools as school
  where school.id = invitation_record.school_id;

  if not found or school_status <> 'active' then
    raise exception using errcode = '23514', message = 'school is inactive';
  end if;

  select student.status
  into student_status
  from public.students as student
  where student.school_id = invitation_record.school_id
    and student.id = invitation_record.student_id
  for update;

  if not found or student_status in ('transferred', 'graduated', 'withdrawn') then
    raise exception using errcode = '23514', message = 'student is not eligible';
  end if;

  update public.student_guardians as relationship
  set status = 'active',
      activated_at = activation_time
  where relationship.id = relationship_record.id
    and relationship.school_id = relationship_record.school_id
    and relationship.student_id = relationship_record.student_id
    and relationship.guardian_profile_id = current_user_id
    and relationship.status = 'pending'
    and relationship.activated_at is null;

  if not found then
    raise exception using errcode = '40001', message = 'guardian activation race';
  end if;

  update public.guardian_invitations as invitation
  set status = 'accepted',
      accepted_at = activation_time
  where invitation.id = invitation_record.id
    and invitation.guardian_profile_id = current_user_id
    and invitation.status = 'sent';

  if not found then
    raise exception using errcode = '40001', message = 'invitation activation race';
  end if;

  insert into public.guardian_access_events (
    school_id,
    student_id,
    student_guardian_id,
    guardian_profile_id,
    event_type,
    actor_profile_id,
    reason_code
  ) values (
    invitation_record.school_id,
    invitation_record.student_id,
    invitation_record.student_guardian_id,
    invitation_record.guardian_profile_id,
    'relationship_activated',
    current_user_id,
    'invitation_accepted'
  );

  return true;
end;
$$;

create or replace function public.revoke_live_guardian_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'revoked' and old.status is distinct from new.status then
    update public.guardian_invitations as invitation
    set status = 'revoked',
        revoked_at = coalesce(new.revoked_at, now())
    where invitation.school_id = new.school_id
      and invitation.student_id = new.student_id
      and invitation.student_guardian_id = new.id
      and invitation.guardian_profile_id = new.guardian_profile_id
      and invitation.status in ('prepared', 'sent');
  end if;

  return new;
end;
$$;

create trigger student_guardians_revoke_live_invitations
after update of status on public.student_guardians
for each row execute function public.revoke_live_guardian_invitations();

revoke all on function public.validate_guardian_invitation_write()
from public, anon, authenticated;

revoke all on function public.get_guardian_invitation_retry(uuid, uuid, text, text)
from public, anon;
grant execute on function public.get_guardian_invitation_retry(uuid, uuid, text, text)
to authenticated;

revoke all on function public.prepare_guardian_invitation(uuid, uuid, uuid, uuid, text, text, boolean, text, text, boolean)
from public, anon;
grant execute on function public.prepare_guardian_invitation(uuid, uuid, uuid, uuid, text, text, boolean, text, text, boolean)
to authenticated;

revoke all on function public.claim_guardian_invitation_delivery(uuid)
from public, anon, authenticated;
grant execute on function public.claim_guardian_invitation_delivery(uuid)
to service_role;

revoke all on function public.fail_guardian_invitation_delivery(uuid, text)
from public, anon, authenticated;
grant execute on function public.fail_guardian_invitation_delivery(uuid, text)
to service_role;

revoke all on function public.get_my_guardian_invitation(uuid)
from public, anon;
grant execute on function public.get_my_guardian_invitation(uuid)
to authenticated;

revoke all on function public.activate_guardian_invitation(uuid)
from public, anon;
grant execute on function public.activate_guardian_invitation(uuid)
to authenticated;

revoke all on function public.revoke_live_guardian_invitations()
from public, anon, authenticated;

commit;
