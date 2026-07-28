-- Quran School SaaS - secure invitations for existing teacher records
-- This migration is committed for review only. Do not apply it to production in this PR.

begin;

create table public.teacher_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  branch_id uuid not null,
  teacher_id uuid not null,
  email text not null,
  idempotency_key uuid not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'processing',
  sent_at timestamptz,
  accepted_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_invitations_teacher_scope_fk
    foreign key (school_id, branch_id, teacher_id)
    references public.teachers(school_id, branch_id, id),
  constraint teacher_invitations_branch_scope_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint teacher_invitations_status_check
    check (status in ('processing', 'sent', 'accepted', 'failed')),
  constraint teacher_invitations_email_normalized_check
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint teacher_invitations_failure_code_check
    check (
      failure_code is null
      or (
        char_length(failure_code) between 3 and 64
        and failure_code ~ '^[a-z][a-z0-9_]*$'
      )
    ),
  constraint teacher_invitations_state_timestamps_check
    check (
      (status = 'processing' and sent_at is null and accepted_at is null and failed_at is null and failure_code is null)
      or
      (status = 'sent' and sent_at is not null and accepted_at is null and failed_at is null and failure_code is null and invited_user_id is not null)
      or
      (status = 'accepted' and sent_at is not null and accepted_at is not null and failed_at is null and failure_code is null and invited_user_id is not null)
      or
      (status = 'failed' and accepted_at is null and failed_at is not null and failure_code is not null)
    )
);

comment on table public.teacher_invitations is
  'Auditable teacher-account invitation attempts. Tokens, invite links, passwords and internal errors are never stored.';
comment on column public.teacher_invitations.email is
  'Normalized invitation email: trimmed and lowercase.';
comment on column public.teacher_invitations.idempotency_key is
  'Client-generated opaque UUID used only to make one submission idempotent.';
comment on column public.teacher_invitations.failure_code is
  'General non-sensitive failure category; never stores SQL, Auth or SMTP error details.';

create unique index teacher_invitations_active_teacher_unique_idx
  on public.teacher_invitations (teacher_id)
  where status in ('processing', 'sent');

create unique index teacher_invitations_active_school_email_unique_idx
  on public.teacher_invitations (school_id, email)
  where status in ('processing', 'sent');

create unique index teacher_invitations_school_idempotency_unique_idx
  on public.teacher_invitations (school_id, idempotency_key);

create unique index teacher_invitations_invited_user_unique_idx
  on public.teacher_invitations (invited_user_id)
  where invited_user_id is not null;

create index teacher_invitations_school_status_idx
  on public.teacher_invitations (school_id, status, created_at desc);

create index teacher_invitations_invited_by_idx
  on public.teacher_invitations (invited_by, created_at desc);

-- A profile represents at most one teacher globally, including across schools.
create unique index teachers_profile_unique_idx
  on public.teachers (profile_id)
  where profile_id is not null;

-- Treat teacher email addresses case-insensitively inside a school.
create unique index teachers_school_normalized_email_unique_idx
  on public.teachers (school_id, lower(btrim(email)))
  where email is not null;

create or replace function public.validate_teacher_invitation_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(new.email));
  eligible_teacher boolean;
begin
  if tg_op = 'INSERT' and new.status <> 'processing' then
    raise exception using errcode = '23514', message = 'teacher_invitation_must_start_processing';
  end if;

  if tg_op = 'UPDATE' then
    if new.school_id <> old.school_id
      or new.branch_id <> old.branch_id
      or new.teacher_id <> old.teacher_id
      or new.email <> old.email
      or new.idempotency_key <> old.idempotency_key
      or new.invited_by <> old.invited_by
    then
      raise exception using errcode = '23514', message = 'teacher_invitation_identity_is_immutable';
    end if;

    if not (
      (old.status = 'processing' and new.status in ('processing', 'sent', 'failed'))
      or (old.status = 'sent' and new.status in ('sent', 'accepted'))
      or (old.status = 'accepted' and new.status = 'accepted')
      or (old.status = 'failed' and new.status = 'failed')
    ) then
      raise exception using errcode = '23514', message = 'teacher_invitation_invalid_transition';
    end if;
  end if;

  if normalized_email is null or normalized_email <> new.email then
    raise exception using errcode = '23514', message = 'teacher_invitation_email_not_normalized';
  end if;

  if new.status = 'processing' then
    select exists (
      select 1
      from public.teachers as teacher
      join public.branches as branch
        on branch.school_id = teacher.school_id
       and branch.id = teacher.branch_id
       and branch.status = 'active'
      join public.schools as school
        on school.id = teacher.school_id
       and school.status = 'active'
      where teacher.id = new.teacher_id
        and teacher.school_id = new.school_id
        and teacher.branch_id = new.branch_id
        and teacher.status = 'active'
        and teacher.profile_id is null
        and (
          teacher.email is null
          or lower(btrim(teacher.email)) = normalized_email
        )
    ) into eligible_teacher;

    if not eligible_teacher then
      raise exception using errcode = '23514', message = 'teacher_not_eligible';
    end if;
  end if;

  return new;
end;
$$;

create trigger teacher_invitations_validate_write
before insert or update on public.teacher_invitations
for each row execute function public.validate_teacher_invitation_write();

create trigger teacher_invitations_set_updated_at
before update on public.teacher_invitations
for each row execute function public.set_updated_at();

alter table public.teacher_invitations enable row level security;

revoke all on public.teacher_invitations from public, anon, authenticated;
grant select on public.teacher_invitations to authenticated;
grant select, insert, update on public.teacher_invitations to service_role;

create policy teacher_invitations_select_authorized
on public.teacher_invitations
for select
to authenticated
using (
  public.has_school_permission(school_id, 'members.manage')
  and public.has_school_permission(school_id, 'members.assign_roles')
  and public.has_school_permission(school_id, 'teachers.manage')
);

-- Trusted atomic provisioning endpoint. The Edge Function supplies only values it
-- obtained from verified Auth and locked database rows. Role and branch are always
-- resolved again inside the transaction.
create or replace function public.provision_teacher_invitation(
  target_invitation_id uuid,
  target_school_id uuid,
  target_teacher_id uuid,
  target_invited_user_id uuid,
  target_email text,
  target_invited_by uuid
)
returns table (
  invitation_id uuid,
  membership_id uuid,
  profile_id uuid,
  branch_id uuid,
  role_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.teacher_invitations%rowtype;
  teacher_record public.teachers%rowtype;
  normalized_email text := lower(btrim(target_email));
  invited_auth_email text;
  teacher_full_name text;
  teacher_role_id uuid;
  created_membership_id uuid;
  inviter_authorized boolean;
begin
  if target_invitation_id is null
    or target_school_id is null
    or target_teacher_id is null
    or target_invited_user_id is null
    or target_invited_by is null
    or normalized_email is null
    or normalized_email <> target_email
  then
    raise exception using errcode = '22023', message = 'invalid_provisioning_input';
  end if;

  select invitation.*
  into invitation_record
  from public.teacher_invitations as invitation
  where invitation.id = target_invitation_id
  for update;

  if not found
    or invitation_record.school_id <> target_school_id
    or invitation_record.teacher_id <> target_teacher_id
    or invitation_record.email <> normalized_email
    or invitation_record.invited_by <> target_invited_by
    or invitation_record.status <> 'processing'
    or invitation_record.invited_user_id is not null
  then
    raise exception using errcode = '23514', message = 'invitation_not_provisionable';
  end if;

  select lower(btrim(auth_user.email))
  into invited_auth_email
  from auth.users as auth_user
  where auth_user.id = target_invited_user_id;

  if not found
    or invited_auth_email is null
    or invited_auth_email <> normalized_email
    or invited_auth_email <> invitation_record.email
  then
    raise exception using errcode = '23514', message = 'invited_auth_email_mismatch';
  end if;

  select count(distinct permission.code) = 3
  into inviter_authorized
  from public.profiles as inviter_profile
  join public.school_memberships as inviter_membership
    on inviter_membership.profile_id = inviter_profile.id
   and inviter_membership.school_id = target_school_id
   and inviter_membership.status = 'active'
  join public.schools as school
    on school.id = inviter_membership.school_id
   and school.status = 'active'
  join public.membership_roles as membership_role
    on membership_role.school_id = inviter_membership.school_id
   and membership_role.membership_id = inviter_membership.id
   and membership_role.branch_id is null
  join public.roles as inviter_role
    on inviter_role.school_id = membership_role.school_id
   and inviter_role.id = membership_role.role_id
   and inviter_role.status = 'active'
  join public.role_permissions as role_permission
    on role_permission.school_id = inviter_role.school_id
   and role_permission.role_id = inviter_role.id
  join public.permissions as permission
    on permission.id = role_permission.permission_id
  where inviter_profile.id = target_invited_by
    and inviter_profile.status = 'active'
    and permission.code in (
      'members.manage',
      'members.assign_roles',
      'teachers.manage'
    );

  if not coalesce(inviter_authorized, false) then
    raise exception using errcode = '42501', message = 'inviter_not_authorized';
  end if;

  select teacher.*
  into teacher_record
  from public.teachers as teacher
  join public.branches as branch
    on branch.school_id = teacher.school_id
   and branch.id = teacher.branch_id
   and branch.status = 'active'
  join public.schools as school
    on school.id = teacher.school_id
   and school.status = 'active'
  where teacher.id = target_teacher_id
    and teacher.school_id = target_school_id
    and teacher.branch_id = invitation_record.branch_id
  for update of teacher;

  if not found
    or teacher_record.status <> 'active'
    or teacher_record.profile_id is not null
    or (
      teacher_record.email is not null
      and lower(btrim(teacher_record.email)) <> normalized_email
    )
  then
    raise exception using errcode = '23514', message = 'teacher_not_eligible';
  end if;

  teacher_full_name := btrim(concat_ws(
    ' ',
    nullif(btrim(teacher_record.first_name), ''),
    nullif(btrim(teacher_record.last_name), '')
  ));

  if teacher_full_name is null
    or char_length(teacher_full_name) not between 2 and 150
  then
    raise exception using errcode = '23514', message = 'teacher_name_invalid';
  end if;

  select role.id
  into teacher_role_id
  from public.roles as role
  where role.school_id = target_school_id
    and role.code = 'teacher'
    and role.status = 'active';

  if teacher_role_id is null then
    raise exception using errcode = '23514', message = 'teacher_role_unavailable';
  end if;

  if exists (
    select 1
    from public.teachers as other_teacher
    where other_teacher.profile_id = target_invited_user_id
  ) then
    raise exception using errcode = '23505', message = 'profile_already_linked_to_teacher';
  end if;

  insert into public.profiles (
    id,
    full_name,
    locale,
    status
  ) values (
    target_invited_user_id,
    teacher_full_name,
    'ar',
    'active'
  );

  insert into public.school_memberships (
    school_id,
    profile_id,
    status,
    joined_at
  ) values (
    target_school_id,
    target_invited_user_id,
    'active',
    now()
  ) returning id into created_membership_id;

  insert into public.membership_roles (
    school_id,
    membership_id,
    role_id,
    branch_id
  ) values (
    target_school_id,
    created_membership_id,
    teacher_role_id,
    teacher_record.branch_id
  );

  update public.teachers as target_teacher
  set profile_id = target_invited_user_id,
      email = coalesce(target_teacher.email, normalized_email)
  where target_teacher.id = teacher_record.id
    and target_teacher.school_id = teacher_record.school_id
    and target_teacher.branch_id = teacher_record.branch_id
    and target_teacher.status = 'active'
    and target_teacher.profile_id is null;

  if not found then
    raise exception using errcode = '40001', message = 'teacher_link_race_detected';
  end if;

  update public.teacher_invitations as target_invitation
  set invited_user_id = target_invited_user_id,
      status = 'sent',
      sent_at = now(),
      accepted_at = null,
      failed_at = null,
      failure_code = null
  where target_invitation.id = invitation_record.id
    and target_invitation.status = 'processing';

  if not found then
    raise exception using errcode = '40001', message = 'invitation_state_race_detected';
  end if;

  return query
  select
    invitation_record.id,
    created_membership_id,
    target_invited_user_id,
    teacher_record.branch_id,
    teacher_role_id;
end;
$$;

revoke all on function public.provision_teacher_invitation(uuid, uuid, uuid, uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.provision_teacher_invitation(uuid, uuid, uuid, uuid, text, uuid)
to service_role;

-- Invitation recipients may read only their own safe context.
create or replace function public.get_my_teacher_invitation()
returns table (
  invitation_id uuid,
  school_name text,
  teacher_name text,
  branch_name text,
  invitation_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invitation.id,
    school.name,
    concat_ws(' ', btrim(teacher.first_name), btrim(teacher.last_name)),
    branch.name,
    invitation.status
  from public.teacher_invitations as invitation
  join public.schools as school
    on school.id = invitation.school_id
  join public.teachers as teacher
    on teacher.id = invitation.teacher_id
   and teacher.school_id = invitation.school_id
   and teacher.branch_id = invitation.branch_id
  join public.branches as branch
    on branch.id = invitation.branch_id
   and branch.school_id = invitation.school_id
  where invitation.invited_user_id = (select auth.uid())
    and invitation.status in ('sent', 'accepted')
  order by invitation.created_at desc
  limit 1;
$$;

revoke all on function public.get_my_teacher_invitation()
from public, anon;
grant execute on function public.get_my_teacher_invitation()
to authenticated;

-- The recipient can mark only the invitation bound to auth.uid() as accepted.
create or replace function public.accept_teacher_invitation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authenticated_user_required';
  end if;

  update public.teacher_invitations as invitation
  set status = 'accepted',
      accepted_at = now()
  where invitation.invited_user_id = current_user_id
    and invitation.status = 'sent';

  return found;
end;
$$;

revoke all on function public.accept_teacher_invitation()
from public, anon;
grant execute on function public.accept_teacher_invitation()
to authenticated;

commit;
