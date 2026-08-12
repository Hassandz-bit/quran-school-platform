-- QuranOS V2 - treasury reconciliation scope hardening
-- V2 review migration only. Do not apply to Production manually.
-- Prevents false branch reconciliation gaps when a visible business source is
-- linked to a school-wide treasury account whose details are outside branch scope.

begin;

alter function public.get_treasury_reconciliation(uuid, integer)
  rename to get_treasury_reconciliation_base;

revoke all on function public.get_treasury_reconciliation_base(uuid, integer)
from public, anon, authenticated;

create function public.get_treasury_reconciliation(
  target_school_id uuid,
  target_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_result jsonb;
  linked_result jsonb;
  unmatched_result jsonb;
begin
  base_result := public.get_treasury_reconciliation_base(target_school_id, target_limit);

  with business_sources as (
    select
      'student_payment'::text as source_type,
      p.id as source_id,
      p.amount::numeric(14,2) as amount,
      'in'::text as direction,
      p.treasury_account_id
    from public.payments p
    where p.school_id = target_school_id
      and p.status = 'completed'
      and public.treasury_source_scope_can_view(target_school_id, p.branch_id)

    union all

    select
      'other_income', i.id, i.amount::numeric(14,2), 'in', i.treasury_account_id
    from public.other_income i
    where i.school_id = target_school_id
      and i.status = 'recorded'
      and public.treasury_source_scope_can_view(target_school_id, i.branch_id)

    union all

    select
      'expense', e.id, e.amount::numeric(14,2), 'out', e.treasury_account_id
    from public.expenses e
    where e.school_id = target_school_id
      and e.status = 'recorded'
      and public.treasury_source_scope_can_view(target_school_id, e.branch_id)

    union all

    select
      'payroll_payment', pp.id, pp.amount::numeric(14,2), 'out', pp.treasury_account_id
    from public.payroll_payments pp
    where pp.school_id = target_school_id
      and pp.status = 'completed'
      and public.treasury_source_scope_can_view(target_school_id, pp.branch_id)
  ), evidence as (
    select
      s.*,
      exists (
        select 1
        from public.treasury_movements m
        where m.school_id = target_school_id
          and m.source_type = s.source_type
          and m.source_id = s.source_id
          and m.status = 'posted'
      ) as has_posted_evidence
    from business_sources s
  )
  select
    jsonb_build_object(
      'student_payments', coalesce(sum(amount) filter (where source_type = 'student_payment' and has_posted_evidence), 0)::numeric(14,2),
      'other_income', coalesce(sum(amount) filter (where source_type = 'other_income' and has_posted_evidence), 0)::numeric(14,2),
      'expenses', coalesce(sum(amount) filter (where source_type = 'expense' and has_posted_evidence), 0)::numeric(14,2),
      'payroll', coalesce(sum(amount) filter (where source_type = 'payroll_payment' and has_posted_evidence), 0)::numeric(14,2),
      'total_inflows', coalesce(sum(amount) filter (where direction = 'in' and has_posted_evidence), 0)::numeric(14,2),
      'total_outflows', coalesce(sum(amount) filter (where direction = 'out' and has_posted_evidence), 0)::numeric(14,2),
      'net', (
        coalesce(sum(amount) filter (where direction = 'in' and has_posted_evidence), 0)
        - coalesce(sum(amount) filter (where direction = 'out' and has_posted_evidence), 0)
      )::numeric(14,2)
    ),
    jsonb_build_object(
      'inflows', coalesce(sum(amount) filter (where direction = 'in' and not has_posted_evidence), 0)::numeric(14,2),
      'outflows', coalesce(sum(amount) filter (where direction = 'out' and not has_posted_evidence), 0)::numeric(14,2),
      'count', count(*) filter (where not has_posted_evidence)
    )
  into linked_result, unmatched_result
  from evidence;

  return jsonb_set(
    jsonb_set(base_result, '{linked}', coalesce(linked_result, '{}'::jsonb), true),
    '{unmatched}', coalesce(unmatched_result, '{}'::jsonb), true
  );
end;
$$;

revoke all on function public.get_treasury_reconciliation(uuid, integer)
from public, anon;
grant execute on function public.get_treasury_reconciliation(uuid, integer)
to authenticated;

comment on function public.get_treasury_reconciliation_base(uuid, integer) is
  'Internal reconciliation payload builder retained for scope-safe wrapper composition. Browser execution is revoked.';
comment on function public.get_treasury_reconciliation(uuid, integer) is
  'Finance-scoped reconciliation. Linked totals are proven from visible business sources plus posted treasury evidence without exposing or requiring visibility of the linked account itself.';

commit;
