-- QuranOS V2 - registration CRM foundation
-- Prospective registrations live before student enrollment. The CRM is branch-
-- scoped, audited, and RPC-only for browser roles. This migration does not
-- convert leads into students and does not send communications.

begin;

insert into public.permissions (code, module, name_ar, description)
values
  ('registrations.view', 'registrations', 'عرض طلبات التسجيل', 'عرض طلبات التسجيل والمتابعة ضمن الفروع المصرح بها'),
  ('registrations.manage', 'registrations', 'إدارة طلبات التسجيل', 'إنشاء طلبات التسجيل وتحديث مسار المتابعة ضمن الفروع المصرح بها')
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'registrations.view'),
    ('school_admin', 'registrations.manage'),
    ('branch_manager', 'registrations.view'),
    ('branch_manager', 'registrations.manage'),
    ('registrar', 'registrations.view'),
    ('registrar', 'registrations.manage')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
 and role.status = 'active'
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

create table public.registration_leads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  prospect_first_name text not null,
  prospect_last_name text not null,
  birth_date date,
  gender text,
  guardian_name text not null,
  guardian_phone text not null,
  guardian_email text,
  source text not null default 'walk_in',
  status text not null default 'new',
  next_follow_up_at timestamptz,
  notes text,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_leads_school_fk
    foreign key (school_id) references public.schools(id),
  constraint registration_leads_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint registration_leads_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint registration_leads_updated_by_fk
    foreign key (updated_by) references public.profiles(id),
  constraint registration_leads_first_name_check
    check (char_length(btrim(prospect_first_name)) between 2 and 100),
  constraint registration_leads_last_name_check
    check (char_length(btrim(prospect_last_name)) between 2 and 100),
  constraint registration_leads_birth_date_check
    check (birth_date is null or birth_date <= current_date),
  constraint registration_leads_gender_check
    check (gender is null or gender in ('male', 'female')),
  constraint registration_leads_guardian_name_check
    check (char_length(btrim(guardian_name)) between 2 and 150),
  constraint registration_leads_guardian_phone_check
    check (char_length(btrim(guardian_phone)) between 4 and 40),
  constraint registration_leads_guardian_email_check
    check (guardian_email is null or char_length(btrim(guardian_email)) between 5 and 254),
  constraint registration_leads_source_check
    check (source in ('walk_in', 'phone', 'website', 'social', 'referral', 'campaign', 'other')),
  constraint registration_leads_status_check
    check (status in ('new', 'contacted', 'qualified', 'visit_scheduled', 'awaiting_documents', 'accepted', 'lost')),
  constraint registration_leads_notes_check
    check (notes is null or char_length(notes) <= 2000),
  constraint registration_leads_school_branch_id_unique
    unique (school_id, branch_id, id)
);

create table public.registration_lead_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  lead_id uuid not null,
  event_type text not null,
  previous_status text,
  new_status text,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  constraint registration_lead_events_lead_scope_fk
    foreign key (school_id, branch_id, lead_id)
    references public.registration_leads(school_id, branch_id, id)
    on delete cascade,
  constraint registration_lead_events_actor_fk
    foreign key (actor_id) references public.profiles(id),
  constraint registration_lead_events_type_check
    check (event_type in ('created', 'pipeline_updated')),
  constraint registration_lead_events_status_shape_check
    check (
      (event_type = 'created' and previous_status is null and new_status = 'new')
      or
      (event_type = 'pipeline_updated'
       and previous_status in ('new', 'contacted', 'qualified', 'visit_scheduled', 'awaiting_documents', 'accepted', 'lost')
       and new_status in ('new', 'contacted', 'qualified', 'visit_scheduled', 'awaiting_documents', 'accepted', 'lost'))
    )
);

create index registration_leads_school_branch_status_idx
  on public.registration_leads (school_id, branch_id, status, created_at desc);
create index registration_leads_school_follow_up_idx
  on public.registration_leads (school_id, next_follow_up_at)
  where next_follow_up_at is not null;
create index registration_leads_school_guardian_phone_idx
  on public.registration_leads (school_id, guardian_phone);
create index registration_lead_events_lead_created_idx
  on public.registration_lead_events (lead_id, created_at desc);

create trigger registration_leads_set_updated_at
before update on public.registration_leads
for each row execute function public.set_updated_at();

alter table public.registration_leads enable row level security;
alter table public.registration_lead_events enable row level security;

revoke all on table public.registration_leads, public.registration_lead_events
from public, anon, authenticated;

create or replace function public.get_registration_crm_access(target_school_id uuid)
returns table (
  can_view boolean,
  can_manage boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and (
          public.has_branch_permission(target_school_id, branch.id, 'registrations.view')
          or public.has_branch_permission(target_school_id, branch.id, 'registrations.manage')
        )
    ) as can_view,
    exists (
      select 1
      from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and public.has_branch_permission(target_school_id, branch.id, 'registrations.manage')
    ) as can_manage;
$$;

revoke all on function public.get_registration_crm_access(uuid)
from public, anon;
grant execute on function public.get_registration_crm_access(uuid) to authenticated;

create or replace function public.list_registration_crm_branches(target_school_id uuid)
returns table (
  branch_id uuid,
  branch_name text,
  branch_code text,
  can_manage boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    branch.id,
    branch.name,
    branch.code,
    public.has_branch_permission(target_school_id, branch.id, 'registrations.manage')
  from public.branches as branch
  where branch.school_id = target_school_id
    and branch.status = 'active'
    and (
      public.has_branch_permission(target_school_id, branch.id, 'registrations.view')
      or public.has_branch_permission(target_school_id, branch.id, 'registrations.manage')
    )
  order by branch.is_main desc, branch.name, branch.id;
$$;

revoke all on function public.list_registration_crm_branches(uuid)
from public, anon;
grant execute on function public.list_registration_crm_branches(uuid) to authenticated;

create or replace function public.list_registration_leads(
  target_school_id uuid,
  target_status text default null,
  target_limit integer default 200
)
returns table (
  lead_id uuid,
  branch_id uuid,
  branch_name text,
  branch_code text,
  prospect_first_name text,
  prospect_last_name text,
  birth_date date,
  gender text,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  source text,
  lead_status text,
  next_follow_up_at timestamptz,
  notes text,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_school_id is null then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_school';
  end if;

  if target_status is not null
     and target_status not in ('new', 'contacted', 'qualified', 'visit_scheduled', 'awaiting_documents', 'accepted', 'lost') then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_status';
  end if;

  if target_limit is null or target_limit < 1 or target_limit > 500 then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_limit';
  end if;

  return query
  select
    lead.id,
    lead.branch_id,
    branch.name,
    branch.code,
    lead.prospect_first_name,
    lead.prospect_last_name,
    lead.birth_date,
    lead.gender,
    lead.guardian_name,
    lead.guardian_phone,
    lead.guardian_email,
    lead.source,
    lead.status,
    lead.next_follow_up_at,
    lead.notes,
    creator.full_name,
    lead.created_at,
    lead.updated_at
  from public.registration_leads as lead
  join public.branches as branch
    on branch.school_id = lead.school_id and branch.id = lead.branch_id
  join public.profiles as creator on creator.id = lead.created_by
  where lead.school_id = target_school_id
    and (target_status is null or lead.status = target_status)
    and (
      public.has_branch_permission(lead.school_id, lead.branch_id, 'registrations.view')
      or public.has_branch_permission(lead.school_id, lead.branch_id, 'registrations.manage')
    )
  order by lead.next_follow_up_at asc nulls last, lead.created_at desc, lead.id
  limit target_limit;
end;
$$;

revoke all on function public.list_registration_leads(uuid, text, integer)
from public, anon;
grant execute on function public.list_registration_leads(uuid, text, integer) to authenticated;

create or replace function public.create_registration_lead(
  target_school_id uuid,
  target_branch_id uuid,
  target_prospect_first_name text,
  target_prospect_last_name text,
  target_birth_date date,
  target_gender text,
  target_guardian_name text,
  target_guardian_phone text,
  target_guardian_email text,
  target_source text,
  target_next_follow_up_at timestamptz,
  target_notes text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_lead_id uuid;
  normalized_email text := nullif(lower(btrim(target_guardian_email)), '');
  normalized_notes text := nullif(btrim(target_notes), '');
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  if target_school_id is null or target_branch_id is null
     or not exists (
       select 1 from public.branches as branch
       join public.schools as school on school.id = branch.school_id
       where branch.id = target_branch_id
         and branch.school_id = target_school_id
         and branch.status = 'active'
         and school.status = 'active'
     )
     or not public.has_branch_permission(target_school_id, target_branch_id, 'registrations.manage') then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  if char_length(btrim(coalesce(target_prospect_first_name, ''))) not between 2 and 100
     or char_length(btrim(coalesce(target_prospect_last_name, ''))) not between 2 and 100
     or char_length(btrim(coalesce(target_guardian_name, ''))) not between 2 and 150
     or char_length(btrim(coalesce(target_guardian_phone, ''))) not between 4 and 40
     or (target_birth_date is not null and target_birth_date > current_date)
     or (target_gender is not null and target_gender not in ('male', 'female'))
     or target_source not in ('walk_in', 'phone', 'website', 'social', 'referral', 'campaign', 'other')
     or (normalized_email is not null and (
       char_length(normalized_email) > 254
       or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     ))
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_input';
  end if;

  insert into public.registration_leads (
    school_id,
    branch_id,
    prospect_first_name,
    prospect_last_name,
    birth_date,
    gender,
    guardian_name,
    guardian_phone,
    guardian_email,
    source,
    status,
    next_follow_up_at,
    notes,
    created_by,
    updated_by
  ) values (
    target_school_id,
    target_branch_id,
    btrim(target_prospect_first_name),
    btrim(target_prospect_last_name),
    target_birth_date,
    target_gender,
    btrim(target_guardian_name),
    btrim(target_guardian_phone),
    normalized_email,
    target_source,
    'new',
    target_next_follow_up_at,
    normalized_notes,
    actor_id,
    actor_id
  ) returning id into new_lead_id;

  insert into public.registration_lead_events (
    school_id, branch_id, lead_id, event_type, previous_status, new_status, actor_id
  ) values (
    target_school_id, target_branch_id, new_lead_id, 'created', null, 'new', actor_id
  );

  return new_lead_id;
end;
$$;

revoke all on function public.create_registration_lead(uuid, uuid, text, text, date, text, text, text, text, text, timestamptz, text)
from public, anon;
grant execute on function public.create_registration_lead(uuid, uuid, text, text, date, text, text, text, text, text, timestamptz, text)
to authenticated;

create or replace function public.update_registration_lead_pipeline(
  target_lead_id uuid,
  target_status text,
  target_next_follow_up_at timestamptz,
  target_notes text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  lead_row public.registration_leads%rowtype;
  normalized_notes text := nullif(btrim(target_notes), '');
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  if target_lead_id is null
     or target_status not in ('new', 'contacted', 'qualified', 'visit_scheduled', 'awaiting_documents', 'accepted', 'lost')
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_input';
  end if;

  select lead.* into lead_row
  from public.registration_leads as lead
  where lead.id = target_lead_id
  for update;

  if not found
     or not public.has_branch_permission(lead_row.school_id, lead_row.branch_id, 'registrations.manage') then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  update public.registration_leads
  set status = target_status,
      next_follow_up_at = target_next_follow_up_at,
      notes = normalized_notes,
      updated_by = actor_id
  where id = lead_row.id;

  if lead_row.status is distinct from target_status
     or lead_row.next_follow_up_at is distinct from target_next_follow_up_at
     or lead_row.notes is distinct from normalized_notes then
    insert into public.registration_lead_events (
      school_id, branch_id, lead_id, event_type, previous_status, new_status, actor_id
    ) values (
      lead_row.school_id,
      lead_row.branch_id,
      lead_row.id,
      'pipeline_updated',
      lead_row.status,
      target_status,
      actor_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.update_registration_lead_pipeline(uuid, text, timestamptz, text)
from public, anon;
grant execute on function public.update_registration_lead_pipeline(uuid, text, timestamptz, text)
to authenticated;

create or replace function public.list_registration_lead_events(target_lead_id uuid)
returns table (
  event_id uuid,
  event_type text,
  previous_status text,
  new_status text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lead_school_id uuid;
  lead_branch_id uuid;
begin
  select lead.school_id, lead.branch_id
  into lead_school_id, lead_branch_id
  from public.registration_leads as lead
  where lead.id = target_lead_id;

  if lead_school_id is null
     or not (
       public.has_branch_permission(lead_school_id, lead_branch_id, 'registrations.view')
       or public.has_branch_permission(lead_school_id, lead_branch_id, 'registrations.manage')
     ) then
    return;
  end if;

  return query
  select event.id, event.event_type, event.previous_status, event.new_status,
         actor.full_name, event.created_at
  from public.registration_lead_events as event
  join public.profiles as actor on actor.id = event.actor_id
  where event.lead_id = target_lead_id
  order by event.created_at desc, event.id desc;
end;
$$;

revoke all on function public.list_registration_lead_events(uuid)
from public, anon;
grant execute on function public.list_registration_lead_events(uuid) to authenticated;

commit;
