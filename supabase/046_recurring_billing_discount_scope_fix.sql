-- QuranOS V2 - recurring billing discount policy hardening
-- V2 review migration only. Do not apply to Production manually.
-- Extends the existing student_discounts model with an explicit recurring
-- auto-apply flag for social (needy) and sibling discounts. Existing policies
-- remain manual by default for backward compatibility.

begin;

alter table public.student_discounts
  add column if not exists auto_apply_recurring boolean not null default false;

alter table public.student_discounts
  add constraint student_discounts_auto_recurring_type_check
    check (
      not auto_apply_recurring
      or discount_type in ('needy', 'sibling')
    );

comment on column public.student_discounts.auto_apply_recurring is
  'When true, one active needy/sibling policy may be applied automatically to a recurring charge after preview + explicit generation confirmation. Existing policies default to false.';

grant insert (auto_apply_recurring) on public.student_discounts to authenticated;
grant update (auto_apply_recurring) on public.student_discounts to authenticated;

create or replace function public.list_finance_student_discount_policies(
  target_school_id uuid
)
returns table (
  policy_id uuid,
  branch_id uuid,
  student_id uuid,
  discount_type text,
  value_type text,
  value numeric,
  reason text,
  start_date date,
  end_date date,
  status text,
  auto_apply_recurring boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'FINANCE_AUTH_REQUIRED';
  end if;
  if target_school_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_DISCOUNT_INPUT_INVALID';
  end if;

  return query
  select
    d.id,
    d.branch_id,
    d.student_id,
    d.discount_type,
    d.value_type,
    d.value,
    d.reason,
    d.start_date,
    d.end_date,
    d.status,
    d.auto_apply_recurring,
    d.created_at
  from public.student_discounts d
  where d.school_id = target_school_id
    and (
      public.has_school_permission(target_school_id, 'finance.manage')
      or public.has_branch_permission(
        target_school_id,
        d.branch_id,
        'finance.manage'
      )
    )
  order by
    case d.status when 'active' then 0 else 1 end,
    d.created_at desc,
    d.id;
end;
$$;

create or replace function public.create_finance_student_discount_policy(
  target_school_id uuid,
  target_student_id uuid,
  target_discount_type text,
  target_value_type text,
  target_value numeric,
  target_reason text,
  target_start_date date,
  target_end_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_branch_id uuid;
  resolved_reason text;
  new_policy_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'FINANCE_AUTH_REQUIRED';
  end if;

  if target_school_id is null
    or target_student_id is null
    or target_discount_type not in ('needy', 'sibling')
    or target_value_type not in ('percentage', 'fixed')
    or target_value is null
    or target_value <= 0
    or (target_value_type = 'percentage' and target_value > 100)
    or target_reason is null
    or char_length(btrim(target_reason)) < 2
    or target_start_date is null
    or (target_end_date is not null and target_end_date < target_start_date)
  then
    raise exception using errcode = '22023', message = 'FINANCE_DISCOUNT_INPUT_INVALID';
  end if;

  resolved_reason := case target_discount_type
    when 'needy' then 'خصم اجتماعي — ' || btrim(target_reason)
    when 'sibling' then 'خصم إخوة — ' || btrim(target_reason)
  end;

  if char_length(resolved_reason) > 250 then
    raise exception using errcode = '22023', message = 'FINANCE_DISCOUNT_INPUT_INVALID';
  end if;

  select s.branch_id
  into resolved_branch_id
  from public.students s
  where s.school_id = target_school_id
    and s.id = target_student_id
    and s.status = 'active';

  if not found then
    raise exception using errcode = '22023', message = 'FINANCE_DISCOUNT_STUDENT_UNAVAILABLE';
  end if;

  if not public.finance_can_manage_generation_scope(
    target_school_id,
    resolved_branch_id
  ) then
    raise exception using errcode = '42501', message = 'FINANCE_MANAGE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('recurring-discount:' || target_school_id::text || ':' || target_student_id::text)
  );

  if exists (
    select 1
    from public.student_discounts d
    where d.school_id = target_school_id
      and d.student_id = target_student_id
      and d.branch_id = resolved_branch_id
      and d.status = 'active'
      and d.auto_apply_recurring
      and d.start_date <= coalesce(target_end_date, 'infinity'::date)
      and coalesce(d.end_date, 'infinity'::date) >= target_start_date
  ) then
    raise exception using errcode = '23505', message = 'FINANCE_DISCOUNT_POLICY_OVERLAP';
  end if;

  insert into public.student_discounts (
    school_id,
    branch_id,
    student_id,
    discount_type,
    value_type,
    value,
    reason,
    start_date,
    end_date,
    status,
    auto_apply_recurring,
    created_by
  ) values (
    target_school_id,
    resolved_branch_id,
    target_student_id,
    target_discount_type,
    target_value_type,
    target_value,
    resolved_reason,
    target_start_date,
    target_end_date,
    'active',
    true,
    (select auth.uid())
  )
  returning id into new_policy_id;

  return new_policy_id;
end;
$$;

create or replace function public.deactivate_finance_student_discount_policy(
  target_school_id uuid,
  target_policy_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_branch_id uuid;
  resolved_student_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'FINANCE_AUTH_REQUIRED';
  end if;
  if target_school_id is null or target_policy_id is null then
    raise exception using errcode = '22023', message = 'FINANCE_DISCOUNT_INPUT_INVALID';
  end if;

  select d.branch_id, d.student_id
  into resolved_branch_id, resolved_student_id
  from public.student_discounts d
  where d.school_id = target_school_id
    and d.id = target_policy_id
    and d.status = 'active'
    and (
      public.has_school_permission(target_school_id, 'finance.manage')
      or public.has_branch_permission(target_school_id, d.branch_id, 'finance.manage')
    );

  if not found then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('recurring-discount:' || target_school_id::text || ':' || resolved_student_id::text)
  );

  update public.student_discounts
  set status = 'inactive'
  where school_id = target_school_id
    and id = target_policy_id
    and status = 'active';

  return found;
end;
$$;

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
  manual_discount_student_count integer;
  auto_discount_student_count integer;
  auto_discount_conflict_count integer;
  gross_total_amount numeric(14,2);
  auto_discount_savings numeric(14,2);
  net_total_amount numeric(14,2);
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
      coalesce(auto_policy.auto_count, 0)::integer as auto_count,
      coalesce(manual_policy.manual_count, 0)::integer as manual_count,
      case
        when coalesce(auto_policy.auto_count, 0) <> 1 then null
        when auto_policy.value_type = 'fixed' and auto_policy.value > plan_row.amount then null
        when auto_policy.value_type = 'fixed' then auto_policy.value
        when auto_policy.value_type = 'percentage'
          then round(plan_row.amount * auto_policy.value / 100, 2)
        else null
      end::numeric(14,2) as auto_discount_amount
    from eligible_students s
    left join lateral (
      select
        d.value_type,
        d.value,
        count(*) over() as auto_count
      from public.student_discounts d
      where d.school_id = target_school_id
        and d.student_id = s.id
        and d.branch_id = s.branch_id
        and d.status = 'active'
        and d.auto_apply_recurring
        and d.discount_type in ('needy', 'sibling')
        and d.start_date <= resolved_period_end
        and (d.end_date is null or d.end_date >= resolved_period_start)
      order by d.created_at desc, d.id
      limit 1
    ) auto_policy on true
    left join lateral (
      select count(*)::integer as manual_count
      from public.student_discounts d
      where d.school_id = target_school_id
        and d.student_id = s.id
        and d.branch_id = s.branch_id
        and d.status = 'active'
        and not d.auto_apply_recurring
        and d.start_date <= resolved_period_end
        and (d.end_date is null or d.end_date >= resolved_period_start)
    ) manual_policy on true
  )
  select
    count(*)::integer,
    count(*) filter (where already_exists)::integer,
    count(*) filter (where not already_exists)::integer,
    count(*) filter (where not already_exists and manual_count > 0)::integer,
    count(*) filter (
      where not already_exists
        and auto_count = 1
        and auto_discount_amount is not null
        and auto_discount_amount > 0
    )::integer,
    count(*) filter (
      where not already_exists
        and (
          auto_count > 1
          or (auto_count = 1 and auto_discount_amount is null)
        )
    )::integer,
    coalesce(sum(plan_row.amount) filter (where not already_exists), 0)::numeric(14,2),
    coalesce(sum(auto_discount_amount) filter (
      where not already_exists
        and auto_count = 1
        and auto_discount_amount is not null
    ), 0)::numeric(14,2)
  into
    eligible_count,
    existing_count,
    create_count,
    manual_discount_student_count,
    auto_discount_student_count,
    auto_discount_conflict_count,
    gross_total_amount,
    auto_discount_savings
  from classified;

  net_total_amount := gross_total_amount - auto_discount_savings;

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
    'students_with_active_discounts', manual_discount_student_count,
    'auto_discount_student_count', auto_discount_student_count,
    'auto_discount_conflict_count', auto_discount_conflict_count,
    'gross_total_amount', gross_total_amount,
    'auto_discount_savings', auto_discount_savings,
    'total_amount', net_total_amount,
    'discount_policy', 'auto_social_sibling_after_preview'
  );
end;
$$;

create or replace function public.generate_recurring_fee_plan_charges(
  target_school_id uuid,
  target_fee_plan_id uuid,
  target_branch_id uuid,
  target_anchor_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview_data jsonb;
  plan_row public.fee_plans%rowtype;
  resolved_period_start date;
  resolved_period_end date;
  resolved_due_date date;
  resolved_branch_id uuid;
  created_count integer := 0;
  skipped_count integer := 0;
  auto_discounted_count integer := 0;
  created_total numeric(14,2) := 0;
  discount_savings numeric(14,2) := 0;
begin
  preview_data := public.preview_recurring_fee_plan_generation(
    target_school_id,
    target_fee_plan_id,
    target_branch_id,
    target_anchor_date
  );

  select * into strict plan_row
  from public.fee_plans p
  where p.school_id = target_school_id
    and p.id = target_fee_plan_id
    and p.status = 'active';

  resolved_period_start := (preview_data ->> 'period_start')::date;
  resolved_period_end := (preview_data ->> 'period_end')::date;
  resolved_due_date := (preview_data ->> 'due_date')::date;
  resolved_branch_id := nullif(preview_data ->> 'scope_branch_id', '')::uuid;

  perform pg_advisory_xact_lock(
    hashtext(
      target_school_id::text || ':'
      || target_fee_plan_id::text || ':'
      || coalesce(resolved_branch_id::text, 'school') || ':'
      || resolved_period_start::text || ':'
      || resolved_period_end::text
    )
  );

  perform pg_advisory_xact_lock(
    hashtext('recurring-discount:' || target_school_id::text || ':' || s.id::text)
  )
  from public.students s
  join public.branches b
    on b.school_id = s.school_id
   and b.id = s.branch_id
   and b.status = 'active'
  where s.school_id = target_school_id
    and s.status = 'active'
    and (resolved_branch_id is null or s.branch_id = resolved_branch_id)
  order by s.id;

  -- Refresh preview after locks so policy changes cannot slip between preview
  -- and charge insertion inside this transaction.
  preview_data := public.preview_recurring_fee_plan_generation(
    target_school_id,
    target_fee_plan_id,
    target_branch_id,
    target_anchor_date
  );

  if (preview_data ->> 'auto_discount_conflict_count')::integer > 0 then
    raise exception using errcode = '22023', message = 'FINANCE_DISCOUNT_POLICY_CONFLICT';
  end if;

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
  ), prepared as (
    select
      s.id,
      s.branch_id,
      auto_policy.value_type,
      auto_policy.value,
      auto_policy.reason,
      coalesce(auto_policy.auto_count, 0)::integer as auto_count,
      case
        when coalesce(auto_policy.auto_count, 0) <> 1 then 0
        when auto_policy.value_type = 'fixed' then auto_policy.value
        when auto_policy.value_type = 'percentage'
          then round(plan_row.amount * auto_policy.value / 100, 2)
        else 0
      end::numeric(14,2) as discount_amount
    from eligible_students s
    left join lateral (
      select
        d.value_type,
        d.value,
        d.reason,
        count(*) over() as auto_count
      from public.student_discounts d
      where d.school_id = target_school_id
        and d.student_id = s.id
        and d.branch_id = s.branch_id
        and d.status = 'active'
        and d.auto_apply_recurring
        and d.discount_type in ('needy', 'sibling')
        and d.start_date <= resolved_period_end
        and (d.end_date is null or d.end_date >= resolved_period_start)
      order by d.created_at desc, d.id
      limit 1
    ) auto_policy on true
  ), inserted as (
    insert into public.student_charges (
      school_id,
      branch_id,
      student_id,
      fee_plan_id,
      charge_type,
      period_start,
      period_end,
      description,
      original_amount,
      discount_amount,
      discount_value_type,
      discount_value,
      discount_reason,
      due_date,
      status,
      created_by,
      generation_source,
      billing_cycle_snapshot,
      fee_plan_name_snapshot
    )
    select
      target_school_id,
      p.branch_id,
      p.id,
      plan_row.id,
      'fee',
      resolved_period_start,
      resolved_period_end,
      plan_row.name || ' — ' || resolved_period_start::text || ' / ' || resolved_period_end::text,
      plan_row.amount,
      p.discount_amount,
      case when p.discount_amount > 0 then p.value_type else null end,
      case when p.discount_amount > 0 then p.value else null end,
      case when p.discount_amount > 0 then p.reason else null end,
      resolved_due_date,
      'pending',
      (select auth.uid()),
      'recurring_fee_plan',
      plan_row.billing_cycle,
      plan_row.name
    from prepared p
    where not exists (
      select 1
      from public.student_charges existing
      where existing.school_id = target_school_id
        and existing.student_id = p.id
        and existing.fee_plan_id = plan_row.id
        and existing.period_start = resolved_period_start
        and existing.period_end = resolved_period_end
    )
    on conflict do nothing
    returning discount_amount, net_amount
  )
  select
    count(*)::integer,
    count(*) filter (where discount_amount > 0)::integer,
    coalesce(sum(net_amount), 0)::numeric(14,2),
    coalesce(sum(discount_amount), 0)::numeric(14,2)
  into created_count, auto_discounted_count, created_total, discount_savings
  from inserted;

  skipped_count := (preview_data ->> 'eligible_count')::integer - created_count;

  return jsonb_build_object(
    'created_count', created_count,
    'skipped_count', greatest(skipped_count, 0),
    'auto_discounted_count', auto_discounted_count,
    'discount_savings', discount_savings,
    'created_total', created_total,
    'plan_id', plan_row.id,
    'period_start', resolved_period_start,
    'period_end', resolved_period_end,
    'due_date', resolved_due_date,
    'scope_branch_id', resolved_branch_id,
    'discount_policy', 'auto_social_sibling_after_preview'
  );
end;
$$;

revoke all on function public.list_finance_student_discount_policies(uuid)
from public, anon;
revoke all on function public.create_finance_student_discount_policy(uuid, uuid, text, text, numeric, text, date, date)
from public, anon;
revoke all on function public.deactivate_finance_student_discount_policy(uuid, uuid)
from public, anon;
revoke all on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date)
from public, anon;
revoke all on function public.generate_recurring_fee_plan_charges(uuid, uuid, uuid, date)
from public, anon;

grant execute on function public.list_finance_student_discount_policies(uuid)
to authenticated;
grant execute on function public.create_finance_student_discount_policy(uuid, uuid, text, text, numeric, text, date, date)
to authenticated;
grant execute on function public.deactivate_finance_student_discount_policy(uuid, uuid)
to authenticated;
grant execute on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date)
to authenticated;
grant execute on function public.generate_recurring_fee_plan_charges(uuid, uuid, uuid, date)
to authenticated;

comment on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date) is
  'Read-only recurring preview. Existing discount policies remain manual by default; exactly one opted-in needy/sibling policy is reflected automatically in preview totals. Multiple opted-in policies block generation.';
comment on function public.create_finance_student_discount_policy(uuid, uuid, text, text, numeric, text, date, date) is
  'Creates one active recurring auto-apply social/sibling discount policy for an authorized student; overlapping auto policies are rejected.';

commit;