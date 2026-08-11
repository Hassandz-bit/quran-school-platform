-- QuranOS V2 - recurring billing discount preview hardening
-- V2 review migration only. Do not apply to Production manually.
-- Migration 045 introduced the recurring preview against the finance module.
-- The finance discount policy columns are start_date/end_date; replace the
-- preview before any runtime use so active policies are detected correctly.

begin;

create or replace function public.preview_recurring_fee_plan_generation(
  target_school_id uuid,
  target_fee_plan_id uuid,
  target_branch_id uuid,
  target_anchor_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan_row public.fee_plans%rowtype;
  resolved_period_start date;
  resolved_period_end date;
  resolved_due_date date;
  resolved_branch_id uuid;
  eligible_count integer;
  existing_count integer;
  create_count integer;
  discount_student_count integer;
  total_amount numeric(14,2);
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'FINANCE_AUTH_REQUIRED';
  end if;
  if target_school_id is null or target_fee_plan_id is null or target_anchor_date is null then
    raise exception using errcode = '22023', message = 'FINANCE_RECURRING_INPUT_INVALID';
  end if;
  if not public.finance_can_manage_generation_scope(target_school_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'FINANCE_MANAGE_REQUIRED';
  end if;

  select * into plan_row
  from public.fee_plans p
  where p.school_id = target_school_id
    and p.id = target_fee_plan_id
    and p.status = 'active';

  if not found
    or plan_row.billing_cycle not in ('monthly', 'quarterly', 'yearly')
    or (
      plan_row.branch_id is not null
      and (
        target_branch_id is null
        or target_branch_id <> plan_row.branch_id
      )
    )
  then
    raise exception using errcode = '22023', message = 'FINANCE_RECURRING_PLAN_UNAVAILABLE';
  end if;

  if plan_row.due_day is null then
    raise exception using errcode = '22023', message = 'FINANCE_RECURRING_DUE_DAY_REQUIRED';
  end if;

  resolved_branch_id := case
    when plan_row.branch_id is not null then plan_row.branch_id
    else target_branch_id
  end;

  if resolved_branch_id is null
    and not public.has_school_permission(target_school_id, 'finance.manage')
  then
    raise exception using errcode = '42501', message = 'FINANCE_SCHOOL_MANAGE_REQUIRED';
  end if;

  select period.period_start, period.period_end
  into resolved_period_start, resolved_period_end
  from public.finance_recurring_period(
    plan_row.billing_cycle,
    target_anchor_date
  ) period;

  resolved_due_date := resolved_period_start + (plan_row.due_day - 1);

  with eligible_students as (
    select s.id, s.branch_id
    from public.students s
    join public.branches b
      on b.school_id = s.school_id
     and b.id = s.branch_id
     and b.status = 'active'
    where s.school_id = target_school_id
      and s.status = 'active'
      and (
        resolved_branch_id is null
        or s.branch_id = resolved_branch_id
      )
  ), classified as (
    select
      s.id,
      s.branch_id,
      exists (
        select 1
        from public.student_charges c
        where c.school_id = target_school_id
          and c.student_id = s.id
          and c.fee_plan_id = plan_row.id
          and c.period_start = resolved_period_start
          and c.period_end = resolved_period_end
      ) as already_exists,
      exists (
        select 1
        from public.student_discounts d
        where d.school_id = target_school_id
          and d.student_id = s.id
          and d.branch_id = s.branch_id
          and d.status = 'active'
          and d.start_date <= resolved_period_end
          and (d.end_date is null or d.end_date >= resolved_period_start)
      ) as has_active_discount
    from eligible_students s
  )
  select
    count(*)::integer,
    count(*) filter (where already_exists)::integer,
    count(*) filter (where not already_exists)::integer,
    count(*) filter (where not already_exists and has_active_discount)::integer,
    coalesce(
      sum(plan_row.amount) filter (where not already_exists),
      0
    )::numeric(14,2)
  into
    eligible_count,
    existing_count,
    create_count,
    discount_student_count,
    total_amount
  from classified;

  return jsonb_build_object(
    'plan_id', plan_row.id,
    'plan_name', plan_row.name,
    'plan_code', plan_row.code,
    'billing_cycle', plan_row.billing_cycle,
    'amount', plan_row.amount,
    'scope_branch_id', resolved_branch_id,
    'period_start', resolved_period_start,
    'period_end', resolved_period_end,
    'due_date', resolved_due_date,
    'eligible_count', eligible_count,
    'already_charged_count', existing_count,
    'to_create_count', create_count,
    'students_with_active_discounts', discount_student_count,
    'total_amount', total_amount,
    'discount_policy', 'explicit_review_required'
  );
end;
$$;

revoke all on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date)
from public, anon;
grant execute on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date)
to authenticated;

comment on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date) is
  'Read-only recurring charge preview aligned with student_discounts.start_date/end_date. Active discounts are warnings only; applying them to charges remains explicit.';

commit;