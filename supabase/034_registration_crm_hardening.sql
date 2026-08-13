-- QuranOS V2 - registration CRM hardening
-- Prevent direct RPC updates after a branch is deactivated. Reads may remain
-- available for historical visibility, but pipeline mutations require an active branch.

begin;

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
     or target_status not in ('new', 'contacted', 'qualified', 'visit_scheduled', 'awaiting_documents', 'accepted', 'lost')
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
