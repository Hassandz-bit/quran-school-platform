-- QuranOS V2 - registration waitlist foundation
-- Adds a real pre-enrollment waitlist to Registration CRM without creating
-- student records automatically. Ordering is derived from priority and the
-- server-recorded waitlist entry time so positions cannot become stale.

begin;

alter table public.registration_leads
  add column waitlisted_at timestamptz,
  add column waitlist_priority smallint,
  add column waitlist_reason text,
  add column desired_level text;

alter table public.registration_leads
  drop constraint registration_leads_status_check;

alter table public.registration_leads
  add constraint registration_leads_status_check
  check (status in (
    'new',
    'contacted',
    'qualified',
    'visit_scheduled',
    'awaiting_documents',
    'waitlisted',
    'accepted',
    'lost'
  ));

alter table public.registration_leads
  add constraint registration_leads_waitlist_priority_check
    check (waitlist_priority is null or waitlist_priority between 1 and 3),
  add constraint registration_leads_waitlist_reason_check
    check (
      waitlist_reason is null
      or waitlist_reason in (
        'capacity_full',
        'class_full',
        'schedule_mismatch',
        'age_group_full',
        'documents_pending',
        'assessment_pending',
        'other'
      )
    ),
  add constraint registration_leads_desired_level_check
    check (desired_level is null or char_length(btrim(desired_level)) between 1 and 150),
  add constraint registration_leads_waitlist_shape_check
    check (
      status <> 'waitlisted'
      or (
        waitlisted_at is not null
        and waitlist_priority is not null
        and waitlist_reason is not null
      )
    );

comment on column public.registration_leads.waitlisted_at is
  'Server-recorded time when the lead most recently entered the waitlist.';
comment on column public.registration_leads.waitlist_priority is
  'Waitlist priority: 1 high, 2 normal, 3 low. Rank is calculated, not stored.';
comment on column public.registration_leads.waitlist_reason is
  'Structured reason for waiting so schools can report on capacity and admission blockers.';
comment on column public.registration_leads.desired_level is
  'Optional requested level, program, or circle label while the prospect is waiting.';

create index registration_leads_school_branch_waitlist_idx
  on public.registration_leads (
    school_id,
    branch_id,
    waitlist_priority,
    waitlisted_at,
    created_at,
    id
  )
  where status = 'waitlisted';

alter table public.registration_lead_events
  drop constraint registration_lead_events_type_check;

alter table public.registration_lead_events
  add constraint registration_lead_events_type_check
    check (event_type in ('created', 'pipeline_updated', 'waitlist_updated'));

alter table public.registration_lead_events
  drop constraint registration_lead_events_status_shape_check;

alter table public.registration_lead_events
  add constraint registration_lead_events_status_shape_check
  check (
    (
      event_type = 'created'
      and previous_status is null
      and new_status = 'new'
    )
    or
    (
      event_type = 'pipeline_updated'
      and previous_status in (
        'new', 'contacted', 'qualified', 'visit_scheduled',
        'awaiting_documents', 'waitlisted', 'accepted', 'lost'
      )
      and new_status in (
        'new', 'contacted', 'qualified', 'visit_scheduled',
        'awaiting_documents', 'waitlisted', 'accepted', 'lost'
      )
    )
    or
    (
      event_type = 'waitlist_updated'
      and previous_status = 'waitlisted'
      and new_status = 'waitlisted'
    )
  );

-- Return waitlist metadata with normal CRM listings. Rank is calculated within
-- each branch from priority first, then waitlist entry time, then stable IDs.
drop function if exists public.list_registration_leads(uuid, text, integer);

create function public.list_registration_leads(
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
  waitlisted_at timestamptz,
  waitlist_priority smallint,
  waitlist_reason text,
  desired_level text,
  waitlist_rank bigint,
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
     and target_status not in (
       'new', 'contacted', 'qualified', 'visit_scheduled',
       'awaiting_documents', 'waitlisted', 'accepted', 'lost'
     ) then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_status';
  end if;

  if target_limit is null or target_limit < 1 or target_limit > 500 then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_limit';
  end if;

  return query
  with scoped as (
    select
      lead.id,
      lead.branch_id,
      branch.name as branch_name,
      branch.code as branch_code,
      lead.prospect_first_name,
      lead.prospect_last_name,
      lead.birth_date,
      lead.gender,
      lead.guardian_name,
      lead.guardian_phone,
      lead.guardian_email,
      lead.source,
      lead.status,
      lead.waitlisted_at,
      lead.waitlist_priority,
      lead.waitlist_reason,
      lead.desired_level,
      case
        when lead.status = 'waitlisted' then
          row_number() over (
            partition by lead.school_id, lead.branch_id, lead.status
            order by
              lead.waitlist_priority asc,
              lead.waitlisted_at asc,
              lead.created_at asc,
              lead.id asc
          )
        else null
      end as waitlist_rank,
      lead.next_follow_up_at,
      lead.notes,
      creator.full_name as created_by_name,
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
  )
  select
    scoped.id,
    scoped.branch_id,
    scoped.branch_name,
    scoped.branch_code,
    scoped.prospect_first_name,
    scoped.prospect_last_name,
    scoped.birth_date,
    scoped.gender,
    scoped.guardian_name,
    scoped.guardian_phone,
    scoped.guardian_email,
    scoped.source,
    scoped.status,
    scoped.waitlisted_at,
    scoped.waitlist_priority,
    scoped.waitlist_reason,
    scoped.desired_level,
    scoped.waitlist_rank,
    scoped.next_follow_up_at,
    scoped.notes,
    scoped.created_by_name,
    scoped.created_at,
    scoped.updated_at
  from scoped
  order by
    case when target_status = 'waitlisted' then scoped.waitlist_rank end asc nulls last,
    scoped.next_follow_up_at asc nulls last,
    scoped.created_at desc,
    scoped.id
  limit target_limit;
end;
$$;

revoke all on function public.list_registration_leads(uuid, text, integer)
from public, anon;
grant execute on function public.list_registration_leads(uuid, text, integer)
to authenticated;

-- Entering the waitlist uses a dedicated atomic RPC so the status can never be
-- saved without priority, reason, and a server-controlled entry timestamp.
create or replace function public.set_registration_lead_waitlist(
  target_lead_id uuid,
  target_priority integer,
  target_reason text,
  target_desired_level text,
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
  normalized_level text := nullif(btrim(target_desired_level), '');
  normalized_notes text := nullif(btrim(target_notes), '');
  next_waitlisted_at timestamptz;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  if target_lead_id is null
     or target_priority is null
     or target_priority not between 1 and 3
     or target_reason is null
     or target_reason not in (
       'capacity_full',
       'class_full',
       'schedule_mismatch',
       'age_group_full',
       'documents_pending',
       'assessment_pending',
       'other'
     )
     or (normalized_level is not null and char_length(normalized_level) > 150)
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'registration_waitlist_invalid_input';
  end if;

  select lead.* into lead_row
  from public.registration_leads as lead
  where lead.id = target_lead_id
  for update;

  if not found
     or not exists (
       select 1
       from public.branches as branch
       join public.schools as school on school.id = branch.school_id
       where branch.school_id = lead_row.school_id
         and branch.id = lead_row.branch_id
         and branch.status = 'active'
         and school.status = 'active'
     )
     or not public.has_branch_permission(
       lead_row.school_id,
       lead_row.branch_id,
       'registrations.manage'
     ) then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  next_waitlisted_at := case
    when lead_row.status = 'waitlisted' and lead_row.waitlisted_at is not null
      then lead_row.waitlisted_at
    else now()
  end;

  update public.registration_leads
  set status = 'waitlisted',
      waitlisted_at = next_waitlisted_at,
      waitlist_priority = target_priority,
      waitlist_reason = target_reason,
      desired_level = normalized_level,
      next_follow_up_at = target_next_follow_up_at,
      notes = normalized_notes,
      updated_by = actor_id
  where id = lead_row.id;

  if lead_row.status is distinct from 'waitlisted'
     or lead_row.waitlist_priority is distinct from target_priority
     or lead_row.waitlist_reason is distinct from target_reason
     or lead_row.desired_level is distinct from normalized_level
     or lead_row.next_follow_up_at is distinct from target_next_follow_up_at
     or lead_row.notes is distinct from normalized_notes then
    insert into public.registration_lead_events (
      school_id,
      branch_id,
      lead_id,
      event_type,
      previous_status,
      new_status,
      actor_id
    ) values (
      lead_row.school_id,
      lead_row.branch_id,
      lead_row.id,
      case
        when lead_row.status = 'waitlisted' then 'waitlist_updated'
        else 'pipeline_updated'
      end,
      lead_row.status,
      'waitlisted',
      actor_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.set_registration_lead_waitlist(uuid, integer, text, text, timestamptz, text)
from public, anon;
grant execute on function public.set_registration_lead_waitlist(uuid, integer, text, text, timestamptz, text)
to authenticated;

-- Preserve the hardened generic pipeline function, but require the dedicated
-- waitlist RPC for entry so incomplete waitlist rows cannot be created.
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
     or target_status is null
     or target_status not in (
       'new', 'contacted', 'qualified', 'visit_scheduled',
       'awaiting_documents', 'waitlisted', 'accepted', 'lost'
     )
     or target_status = 'waitlisted'
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'registration_crm_invalid_input';
  end if;

  select lead.* into lead_row
  from public.registration_leads as lead
  where lead.id = target_lead_id
  for update;

  if not found
     or not exists (
       select 1
       from public.branches as branch
       where branch.school_id = lead_row.school_id
         and branch.id = lead_row.branch_id
         and branch.status = 'active'
     )
     or not public.has_branch_permission(
       lead_row.school_id,
       lead_row.branch_id,
       'registrations.manage'
     ) then
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

commit;
