-- QuranOS V2 - progressive registration details captured from the first stage.
-- These details remain optional so a lead can be saved with only essential contact data.

begin;

alter table public.registration_leads
  add column education_level text,
  add column previous_memorization_outcome text,
  add constraint registration_leads_education_level_check
    check (education_level is null or education_level in ('primary', 'middle', 'secondary', 'university')),
  add constraint registration_leads_previous_memorization_check
    check (
      previous_memorization_outcome is null
      or char_length(btrim(previous_memorization_outcome)) between 1 and 1000
    );

comment on column public.registration_leads.education_level is
  'Optional school education level captured during initial registration intake.';
comment on column public.registration_leads.previous_memorization_outcome is
  'Optional bounded summary of Quran memorization achieved before joining the school.';

alter table public.registration_lead_events
  drop constraint registration_lead_events_type_check;

alter table public.registration_lead_events
  add constraint registration_lead_events_type_check
    check (event_type in ('created', 'pipeline_updated', 'waitlist_updated', 'student_details_updated'));

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
    or
    (
      event_type = 'student_details_updated'
      and previous_status in (
        'new', 'contacted', 'qualified', 'visit_scheduled',
        'awaiting_documents', 'waitlisted', 'accepted', 'lost'
      )
      and new_status = previous_status
    )
  );

-- RETURNS TABLE cannot be changed with CREATE OR REPLACE; recreate the scoped,
-- permission-checked RPC and preserve the waitlist rank behavior.
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
  education_level text,
  previous_memorization_outcome text,
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
      lead.education_level,
      lead.previous_memorization_outcome,
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
    scoped.education_level,
    scoped.previous_memorization_outcome,
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

-- First-stage creation is atomic: call the existing hardened creator, then set
-- the additional optional student details in the same database transaction.
create or replace function public.create_registration_lead_with_details(
  target_school_id uuid,
  target_branch_id uuid,
  target_prospect_first_name text,
  target_prospect_last_name text,
  target_birth_date date,
  target_guardian_name text,
  target_guardian_phone text,
  target_source text,
  target_next_follow_up_at timestamptz,
  target_notes text,
  target_education_level text,
  target_previous_memorization_outcome text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized_education_level text := nullif(lower(btrim(target_education_level)), '');
  normalized_memorization_outcome text := nullif(btrim(target_previous_memorization_outcome), '');
  new_lead_id uuid;
begin
  if (normalized_education_level is not null and normalized_education_level not in ('primary', 'middle', 'secondary', 'university'))
     or (normalized_memorization_outcome is not null and char_length(normalized_memorization_outcome) > 1000) then
    raise exception using errcode = '22023', message = 'registration_student_details_invalid_input';
  end if;

  new_lead_id := public.create_registration_lead(
    target_school_id,
    target_branch_id,
    target_prospect_first_name,
    target_prospect_last_name,
    target_birth_date,
    null,
    target_guardian_name,
    target_guardian_phone,
    null,
    target_source,
    target_next_follow_up_at,
    target_notes
  );

  update public.registration_leads
  set education_level = normalized_education_level,
      previous_memorization_outcome = normalized_memorization_outcome,
      updated_by = (select auth.uid())
  where school_id = target_school_id
    and id = new_lead_id;

  return new_lead_id;
end;
$$;

revoke all on function public.create_registration_lead_with_details(uuid, uuid, text, text, date, text, text, text, timestamptz, text, text, text)
from public, anon;
grant execute on function public.create_registration_lead_with_details(uuid, uuid, text, text, date, text, text, text, timestamptz, text, text, text)
to authenticated;

create or replace function public.update_registration_lead_student_details(
  target_lead_id uuid,
  target_birth_date date,
  target_education_level text,
  target_previous_memorization_outcome text
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
  normalized_education_level text := nullif(lower(btrim(target_education_level)), '');
  normalized_memorization_outcome text := nullif(btrim(target_previous_memorization_outcome), '');
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  if target_lead_id is null
     or (target_birth_date is not null and target_birth_date > current_date)
     or (normalized_education_level is not null and normalized_education_level not in ('primary', 'middle', 'secondary', 'university'))
     or (normalized_memorization_outcome is not null and char_length(normalized_memorization_outcome) > 1000) then
    raise exception using errcode = '22023', message = 'registration_student_details_invalid_input';
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
     or not public.has_branch_permission(lead_row.school_id, lead_row.branch_id, 'registrations.manage') then
    raise exception using errcode = '42501', message = 'registration_crm_unauthorized';
  end if;

  update public.registration_leads
  set birth_date = target_birth_date,
      education_level = normalized_education_level,
      previous_memorization_outcome = normalized_memorization_outcome,
      updated_by = actor_id
  where id = lead_row.id;

  if lead_row.birth_date is distinct from target_birth_date
     or lead_row.education_level is distinct from normalized_education_level
     or lead_row.previous_memorization_outcome is distinct from normalized_memorization_outcome then
    insert into public.registration_lead_events (
      school_id, branch_id, lead_id, event_type, previous_status, new_status, actor_id
    ) values (
      lead_row.school_id,
      lead_row.branch_id,
      lead_row.id,
      'student_details_updated',
      lead_row.status,
      lead_row.status,
      actor_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.update_registration_lead_student_details(uuid, date, text, text)
from public, anon;
grant execute on function public.update_registration_lead_student_details(uuid, date, text, text)
to authenticated;

commit;
