-- Quran School SaaS - guardian security foundation
-- Guardian / Parent Portal PR A only. No invitations or parent-facing data RPCs.

begin;

-- Student references in guardian-owned tables carry the tenant boundary in the
-- foreign key instead of trusting a browser-supplied student UUID alone.
alter table public.students
  add constraint students_school_id_id_unique unique (school_id, id);

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  guardian_profile_id uuid not null,
  relationship_type text not null,
  is_primary boolean not null default false,
  status text not null default 'pending',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revocation_reason text,
  updated_at timestamptz not null default now(),
  constraint student_guardians_student_school_fk
    foreign key (school_id, student_id)
    references public.students(school_id, id),
  constraint student_guardians_guardian_profile_fk
    foreign key (guardian_profile_id)
    references public.profiles(id)
    on delete restrict,
  constraint student_guardians_created_by_fk
    foreign key (created_by)
    references public.profiles(id)
    on delete restrict,
  constraint student_guardians_revoked_by_fk
    foreign key (revoked_by)
    references public.profiles(id)
    on delete restrict,
  constraint student_guardians_relationship_type_check
    check (
      relationship_type in (
        'father',
        'mother',
        'legal_guardian',
        'relative',
        'other'
      )
    ),
  constraint student_guardians_status_check
    check (status in ('pending', 'active', 'revoked')),
  constraint student_guardians_lifecycle_check
    check (
      (
        status = 'pending'
        and activated_at is null
        and revoked_at is null
        and revoked_by is null
        and revocation_reason is null
      )
      or (
        status = 'active'
        and activated_at is not null
        and revoked_at is null
        and revoked_by is null
        and revocation_reason is null
      )
      or (
        status = 'revoked'
        and revoked_at is not null
        and revocation_reason is not null
      )
    ),
  constraint student_guardians_revoked_state_check
    check (
      status <> 'revoked'
      or (
        revoked_at is not null
        and revocation_reason is not null
        and btrim(revocation_reason) <> ''
        and not is_primary
      )
    ),
  constraint student_guardians_revocation_reason_length_check
    check (
      revocation_reason is null
      or char_length(btrim(revocation_reason)) between 1 and 120
    ),
  constraint student_guardians_school_student_id_profile_unique
    unique (school_id, student_id, id, guardian_profile_id)
);

comment on table public.student_guardians is
  'Tenant-safe guardian-to-student relationships. Parent access is relationship-based, not membership- or role-based.';
comment on column public.student_guardians.school_id is
  'Explicit tenant boundary verified with student_id by a composite foreign key.';
comment on column public.student_guardians.guardian_profile_id is
  'Global profile that may have independent guardian relationships in multiple schools.';
comment on column public.student_guardians.status is
  'Only active relationships may authorize future parent RPCs; pending and revoked never do.';
comment on column public.student_guardians.is_primary is
  'At most one pending or active primary guardian is allowed per student.';

-- Preserve revoked history while preventing duplicate live relationships.
create unique index student_guardians_live_relationship_unique_idx
  on public.student_guardians (school_id, student_id, guardian_profile_id)
  where status in ('pending', 'active');

create unique index student_guardians_live_primary_unique_idx
  on public.student_guardians (school_id, student_id)
  where is_primary and status in ('pending', 'active');

create index student_guardians_guardian_active_idx
  on public.student_guardians (guardian_profile_id, school_id, student_id)
  where status = 'active';

create index student_guardians_created_by_idx
  on public.student_guardians (created_by);

create index student_guardians_revoked_by_idx
  on public.student_guardians (revoked_by)
  where revoked_by is not null;

create table public.guardian_access_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  student_guardian_id uuid not null,
  guardian_profile_id uuid not null,
  event_type text not null,
  actor_profile_id uuid,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint guardian_access_events_student_guardian_fk
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
    ),
  constraint guardian_access_events_actor_profile_fk
    foreign key (actor_profile_id)
    references public.profiles(id)
    on delete restrict,
  constraint guardian_access_events_event_type_check
    check (
      event_type in (
        'relationship_created',
        'relationship_activated',
        'relationship_updated',
        'primary_changed',
        'relationship_revoked',
        'automatic_revoked'
      )
    ),
  constraint guardian_access_events_reason_code_check
    check (
      reason_code is null
      or reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  constraint guardian_access_events_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 4096
    )
);

comment on table public.guardian_access_events is
  'Append-only security audit for guardian relationship changes. Browser writes, updates, and deletes are denied.';
comment on column public.guardian_access_events.metadata is
  'Bounded non-secret metadata only; never store credentials, tokens, links, or internal error details.';

create index guardian_access_events_school_student_occurred_idx
  on public.guardian_access_events (
    school_id,
    student_id,
    occurred_at desc,
    id
  );

create index guardian_access_events_relationship_occurred_idx
  on public.guardian_access_events (student_guardian_id, occurred_at desc);

create index guardian_access_events_guardian_occurred_idx
  on public.guardian_access_events (guardian_profile_id, occurred_at desc);

create index guardian_access_events_actor_idx
  on public.guardian_access_events (actor_profile_id)
  where actor_profile_id is not null;

create trigger student_guardians_set_updated_at
before update on public.student_guardians
for each row execute function public.set_updated_at();

insert into public.permissions (code, module, name_ar, description)
values
  (
    'guardians.view',
    'guardians',
    'عرض روابط أولياء الأمور',
    'عرض علاقات أولياء الأمور بالطلاب ضمن النطاق المصرح به'
  ),
  (
    'guardians.view_contacts',
    'guardians',
    'عرض بيانات اتصال أولياء الأمور',
    'عرض بيانات الاتصال الآمنة لولي الأمر مع صلاحية العرض الأساسية'
  ),
  (
    'guardians.link',
    'guardians',
    'ربط أولياء الأمور',
    'تجهيز علاقة معلقة بين ولي أمر وطالب ضمن النطاق المصرح به'
  ),
  (
    'guardians.invite',
    'guardians',
    'دعوة أولياء الأمور',
    'إرسال أو إعادة إرسال دعوة ولي الأمر في مرحلة الدعوات اللاحقة'
  ),
  (
    'guardians.revoke',
    'guardians',
    'إلغاء وصول أولياء الأمور',
    'إلغاء علاقة ولي الأمر بالطالب فورًا دون حذف سجلها'
  ),
  (
    'guardians.audit',
    'guardians',
    'تدقيق وصول أولياء الأمور',
    'عرض سجل تدقيق علاقات أولياء الأمور ضمن النطاق المصرح به'
  )
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'guardians.view'),
    ('school_admin', 'guardians.view_contacts'),
    ('school_admin', 'guardians.link'),
    ('school_admin', 'guardians.invite'),
    ('school_admin', 'guardians.revoke'),
    ('school_admin', 'guardians.audit'),
    ('registrar', 'guardians.view'),
    ('registrar', 'guardians.view_contacts'),
    ('registrar', 'guardians.link'),
    ('registrar', 'guardians.invite'),
    ('registrar', 'guardians.revoke')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

-- The legacy role remains reserved, but it is no longer a default access gate.
delete from public.role_permissions as role_permission
using public.roles as role, public.permissions as permission
where role_permission.school_id = role.school_id
  and role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and role.code = 'guardian'
  and permission.code in ('school.view', 'branches.view');

-- Administrative scope helper. It resolves the current student branch inside
-- the database and accepts only guardian-module permission codes.
create or replace function public.can_manage_student_guardian(
  target_school_id uuid,
  target_student_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and target_permission_code in (
      'guardians.view',
      'guardians.view_contacts',
      'guardians.link',
      'guardians.invite',
      'guardians.revoke',
      'guardians.audit'
    )
    and exists (
      select 1
      from public.students as student
      where student.school_id = target_school_id
        and student.id = target_student_id
        and public.has_branch_permission(
          student.school_id,
          student.branch_id,
          target_permission_code
        )
    );
$$;

-- Internal helper for future parent RPCs. It deliberately has no direct
-- browser EXECUTE grant in PR A.
create or replace function public.is_active_guardian_of_student(
  target_school_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.student_guardians as relationship
      join public.profiles as guardian_profile
        on guardian_profile.id = relationship.guardian_profile_id
       and guardian_profile.status = 'active'
      join public.students as student
        on student.school_id = relationship.school_id
       and student.id = relationship.student_id
       and student.status not in ('transferred', 'graduated', 'withdrawn')
      join public.schools as school
        on school.id = relationship.school_id
       and school.status = 'active'
      where relationship.school_id = target_school_id
        and relationship.student_id = target_student_id
        and relationship.guardian_profile_id = (select auth.uid())
        and relationship.status = 'active'
    );
$$;

create or replace function public.prepare_student_guardian_link(
  target_school_id uuid,
  target_student_id uuid,
  target_guardian_profile_id uuid,
  target_relationship_type text,
  target_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  student_status text;
  guardian_status text;
  existing_relationship public.student_guardians%rowtype;
  created_relationship_id uuid;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if target_school_id is null
    or target_student_id is null
    or target_guardian_profile_id is null
    or target_relationship_type is null
    or target_relationship_type not in (
      'father',
      'mother',
      'legal_guardian',
      'relative',
      'other'
    )
    or target_is_primary is null
  then
    raise exception using
      errcode = '22023',
      message = 'invalid guardian relationship input';
  end if;

  if not public.can_manage_student_guardian(
    target_school_id,
    target_student_id,
    'guardians.link'
  ) then
    raise exception using
      errcode = '42501',
      message = 'permission denied';
  end if;

  select student.status
  into student_status
  from public.students as student
  where student.school_id = target_school_id
    and student.id = target_student_id
  for update;

  if not found
    or student_status in ('transferred', 'graduated', 'withdrawn')
  then
    raise exception using
      errcode = '23514',
      message = 'student is not eligible for guardian linking';
  end if;

  select profile.status
  into guardian_status
  from public.profiles as profile
  where profile.id = target_guardian_profile_id;

  if not found or guardian_status <> 'active' then
    raise exception using
      errcode = '23514',
      message = 'guardian profile is not active';
  end if;

  select relationship.*
  into existing_relationship
  from public.student_guardians as relationship
  where relationship.school_id = target_school_id
    and relationship.student_id = target_student_id
    and relationship.guardian_profile_id = target_guardian_profile_id
    and relationship.status in ('pending', 'active')
  for update;

  if found then
    if existing_relationship.relationship_type = target_relationship_type
      and existing_relationship.is_primary = target_is_primary
    then
      return existing_relationship.id;
    end if;

    raise exception using
      errcode = '23505',
      message = 'guardian relationship already exists with different attributes';
  end if;

  begin
    insert into public.student_guardians (
      school_id,
      student_id,
      guardian_profile_id,
      relationship_type,
      is_primary,
      status,
      created_by
    ) values (
      target_school_id,
      target_student_id,
      target_guardian_profile_id,
      target_relationship_type,
      target_is_primary,
      'pending',
      current_user_id
    ) returning id into created_relationship_id;
  exception
    when unique_violation then
      select relationship.*
      into existing_relationship
      from public.student_guardians as relationship
      where relationship.school_id = target_school_id
        and relationship.student_id = target_student_id
        and relationship.guardian_profile_id = target_guardian_profile_id
        and relationship.status in ('pending', 'active');

      if found
        and existing_relationship.relationship_type = target_relationship_type
        and existing_relationship.is_primary = target_is_primary
      then
        return existing_relationship.id;
      end if;

      raise exception using
        errcode = '23505',
        message = 'live guardian relationship or primary guardian already exists';
  end;

  insert into public.guardian_access_events (
    school_id,
    student_id,
    student_guardian_id,
    guardian_profile_id,
    event_type,
    actor_profile_id,
    reason_code
  ) values (
    target_school_id,
    target_student_id,
    created_relationship_id,
    target_guardian_profile_id,
    'relationship_created',
    current_user_id,
    'manual_link'
  );

  return created_relationship_id;
end;
$$;

create or replace function public.revoke_student_guardian_link(
  target_school_id uuid,
  target_student_guardian_id uuid,
  target_reason_code text default 'manual_revoke'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_reason text := lower(btrim(target_reason_code));
  relationship_record public.student_guardians%rowtype;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if target_school_id is null
    or target_student_guardian_id is null
    or normalized_reason is null
    or normalized_reason !~ '^[a-z][a-z0-9_]{0,63}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid guardian revocation input';
  end if;

  select relationship.*
  into relationship_record
  from public.student_guardians as relationship
  where relationship.school_id = target_school_id
    and relationship.id = target_student_guardian_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'guardian relationship not found';
  end if;

  if not public.can_manage_student_guardian(
    relationship_record.school_id,
    relationship_record.student_id,
    'guardians.revoke'
  ) then
    raise exception using
      errcode = '42501',
      message = 'permission denied';
  end if;

  if relationship_record.status = 'revoked' then
    return true;
  end if;

  update public.student_guardians as relationship
  set status = 'revoked',
      is_primary = false,
      revoked_at = now(),
      revoked_by = current_user_id,
      revocation_reason = normalized_reason
  where relationship.id = relationship_record.id
    and relationship.school_id = relationship_record.school_id
    and relationship.status in ('pending', 'active');

  if not found then
    raise exception using
      errcode = '40001',
      message = 'guardian relationship state changed concurrently';
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
    relationship_record.school_id,
    relationship_record.student_id,
    relationship_record.id,
    relationship_record.guardian_profile_id,
    'relationship_revoked',
    current_user_id,
    normalized_reason
  );

  return true;
end;
$$;

create or replace function public.revoke_guardians_on_terminal_student_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status
    or new.status not in ('transferred', 'graduated', 'withdrawn')
  then
    return new;
  end if;

  with revoked_relationships as (
    update public.student_guardians as relationship
    set status = 'revoked',
        is_primary = false,
        revoked_at = now(),
        revoked_by = null,
        revocation_reason = 'student_' || new.status
    where relationship.school_id = new.school_id
      and relationship.student_id = new.id
      and relationship.status in ('pending', 'active')
    returning
      relationship.id,
      relationship.school_id,
      relationship.student_id,
      relationship.guardian_profile_id
  )
  insert into public.guardian_access_events (
    school_id,
    student_id,
    student_guardian_id,
    guardian_profile_id,
    event_type,
    actor_profile_id,
    reason_code
  )
  select
    relationship.school_id,
    relationship.student_id,
    relationship.id,
    relationship.guardian_profile_id,
    'automatic_revoked',
    null,
    'student_' || new.status
  from revoked_relationships as relationship;

  return new;
end;
$$;

create trigger students_revoke_guardians_on_terminal_status
after update of status on public.students
for each row execute function public.revoke_guardians_on_terminal_student_status();

alter table public.student_guardians enable row level security;
alter table public.guardian_access_events enable row level security;

revoke all on public.student_guardians, public.guardian_access_events
from public, anon, authenticated;

grant select on public.student_guardians to authenticated;
grant select on public.guardian_access_events to authenticated;

create policy student_guardians_select_authorized
on public.student_guardians
for select to authenticated
using (
  public.can_manage_student_guardian(
    school_id,
    student_id,
    'guardians.view'
  )
);

create policy guardian_access_events_select_auditors
on public.guardian_access_events
for select to authenticated
using (
  public.can_manage_student_guardian(
    school_id,
    student_id,
    'guardians.audit'
  )
);

revoke all on function public.can_manage_student_guardian(uuid, uuid, text)
from public, anon;
grant execute on function public.can_manage_student_guardian(uuid, uuid, text)
to authenticated;

revoke all on function public.is_active_guardian_of_student(uuid, uuid)
from public, anon, authenticated;

revoke all on function public.prepare_student_guardian_link(uuid, uuid, uuid, text, boolean)
from public, anon;
grant execute on function public.prepare_student_guardian_link(uuid, uuid, uuid, text, boolean)
to authenticated;

revoke all on function public.revoke_student_guardian_link(uuid, uuid, text)
from public, anon;
grant execute on function public.revoke_student_guardian_link(uuid, uuid, text)
to authenticated;

revoke all on function public.revoke_guardians_on_terminal_student_status()
from public, anon, authenticated;

commit;
