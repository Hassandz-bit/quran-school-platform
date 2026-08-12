-- QuranOS V2 - recurring student billing + finance reminders
-- V2 review migration only. Do not apply to Production manually.
-- Adds explicit preview/confirm recurring charge generation and idempotent
-- guardian in-app finance reminders using the existing notification center.

begin;

alter table public.student_charges
  add column if not exists generation_source text not null default 'manual',
  add column if not exists billing_cycle_snapshot text,
  add column if not exists fee_plan_name_snapshot text;

alter table public.student_charges
  add constraint student_charges_generation_source_check
    check (generation_source in ('manual', 'recurring_fee_plan')),
  add constraint student_charges_billing_cycle_snapshot_check
    check (
      billing_cycle_snapshot is null
      or billing_cycle_snapshot in ('monthly', 'quarterly', 'yearly')
    ),
  add constraint student_charges_recurring_snapshot_check
    check (
      generation_source <> 'recurring_fee_plan'
      or (
        fee_plan_id is not null
        and billing_cycle_snapshot is not null
        and fee_plan_name_snapshot is not null
        and btrim(fee_plan_name_snapshot) <> ''
        and period_start is not null
        and period_end is not null
      )
    );

create unique index student_charges_recurring_period_unique_idx
  on public.student_charges (
    school_id,
    student_id,
    fee_plan_id,
    period_start,
    period_end
  )
  where generation_source = 'recurring_fee_plan'
    and fee_plan_id is not null
    and period_start is not null
    and period_end is not null;

comment on column public.student_charges.generation_source is
  'manual for existing/explicit charges; recurring_fee_plan only for confirmed V2 recurring generation.';
comment on column public.student_charges.billing_cycle_snapshot is
  'Recurring billing cycle copied from the fee plan when the charge is generated.';
comment on column public.student_charges.fee_plan_name_snapshot is
  'Fee-plan name copied at recurring generation time for auditability after later plan edits.';

create or replace function public.finance_recurring_period(
  target_billing_cycle text,
  target_anchor_date date
)
returns table (
  period_start date,
  period_end date
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  resolved_start date;
begin
  if target_anchor_date is null
    or target_billing_cycle not in ('monthly', 'quarterly', 'yearly')
  then
    raise exception using errcode = '22023', message = 'FINANCE_RECURRING_PERIOD_INVALID';
  end if;

  resolved_start := case target_billing_cycle
    when 'monthly' then date_trunc('month', target_anchor_date)::date
    when 'quarterly' then date_trunc('quarter', target_anchor_date)::date
    else date_trunc('year', target_anchor_date)::date
  end;

  period_start := resolved_start;
  period_end := case target_billing_cycle
    when 'monthly' then (resolved_start + interval '1 month - 1 day')::date
    when 'quarterly' then (resolved_start + interval '3 months - 1 day')::date
    else (resolved_start + interval '1 year - 1 day')::date
  end;
  return next;
end;
$$;

create or replace function public.finance_can_manage_generation_scope(
  target_school_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_branch_id is null then
      public.has_school_permission(target_school_id, 'finance.manage')
    else
      public.has_branch_permission(
        target_school_id,
        target_branch_id,
        'finance.manage'
      )
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
          and d.starts_on <= resolved_period_end
          and (d.ends_on is null or d.ends_on >= resolved_period_start)
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
  created_total numeric(14,2) := 0;
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
      s.branch_id,
      s.id,
      plan_row.id,
      'fee',
      resolved_period_start,
      resolved_period_end,
      plan_row.name || ' — ' || resolved_period_start::text || ' / ' || resolved_period_end::text,
      plan_row.amount,
      0,
      null,
      null,
      null,
      resolved_due_date,
      'pending',
      (select auth.uid()),
      'recurring_fee_plan',
      plan_row.billing_cycle,
      plan_row.name
    from eligible_students s
    where not exists (
      select 1
      from public.student_charges existing
      where existing.school_id = target_school_id
        and existing.student_id = s.id
        and existing.fee_plan_id = plan_row.id
        and existing.period_start = resolved_period_start
        and existing.period_end = resolved_period_end
    )
    on conflict do nothing
    returning net_amount
  )
  select count(*)::integer, coalesce(sum(net_amount), 0)::numeric(14,2)
  into created_count, created_total
  from inserted;

  skipped_count := (preview_data ->> 'eligible_count')::integer - created_count;

  return jsonb_build_object(
    'created_count', created_count,
    'skipped_count', greatest(skipped_count, 0),
    'created_total', created_total,
    'plan_id', plan_row.id,
    'period_start', resolved_period_start,
    'period_end', resolved_period_end,
    'due_date', resolved_due_date,
    'scope_branch_id', resolved_branch_id,
    'discount_policy', 'explicit_review_required'
  );
end;
$$;

create or replace function public.preview_finance_charge_reminders(
  target_school_id uuid,
  target_branch_id uuid,
  target_as_of date default current_date,
  target_due_soon_days integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  due_soon_charge_count integer;
  overdue_charge_count integer;
  due_soon_recipient_count integer;
  overdue_recipient_count integer;
  due_soon_new_count integer;
  overdue_new_count integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'FINANCE_AUTH_REQUIRED';
  end if;
  if target_school_id is null
    or target_as_of is null
    or target_due_soon_days is null
    or target_due_soon_days not between 1 and 30
  then
    raise exception using errcode = '22023', message = 'FINANCE_REMINDER_INPUT_INVALID';
  end if;
  if not public.finance_can_manage_generation_scope(target_school_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'FINANCE_MANAGE_REQUIRED';
  end if;

  with collectible as (
    select
      c.id,
      c.student_id,
      c.branch_id,
      c.due_date,
      c.net_amount - coalesce((
        select sum(p.amount)
        from public.payments p
        where p.school_id = c.school_id
          and p.charge_id = c.id
          and p.status = 'completed'
      ), 0) as outstanding,
      case
        when c.due_date < target_as_of then 'finance_charge_overdue'
        when c.due_date between target_as_of
          and (target_as_of + target_due_soon_days) then 'finance_charge_due_soon'
        else null
      end as reminder_source_type
    from public.student_charges c
    join public.students s
      on s.school_id = c.school_id
     and s.id = c.student_id
     and s.status = 'active'
    where c.school_id = target_school_id
      and c.status in ('pending', 'partially_paid')
      and (target_branch_id is null or c.branch_id = target_branch_id)
  ), eligible as (
    select *
    from collectible
    where outstanding > 0
      and reminder_source_type is not null
  ), recipients as (
    select distinct
      e.id as charge_id,
      e.reminder_source_type,
      r.guardian_profile_id
    from eligible e
    join public.student_guardians r
      on r.school_id = target_school_id
     and r.student_id = e.student_id
     and r.status = 'active'
    join public.profiles gp
      on gp.id = r.guardian_profile_id
     and gp.status = 'active'
  )
  select
    (select count(*)::integer from eligible where reminder_source_type = 'finance_charge_due_soon'),
    (select count(*)::integer from eligible where reminder_source_type = 'finance_charge_overdue'),
    (select count(*)::integer from recipients where reminder_source_type = 'finance_charge_due_soon'),
    (select count(*)::integer from recipients where reminder_source_type = 'finance_charge_overdue'),
    (select count(*)::integer
      from recipients r
      where r.reminder_source_type = 'finance_charge_due_soon'
        and not exists (
          select 1 from public.app_notifications n
          where n.recipient_profile_id = r.guardian_profile_id
            and n.source_type = r.reminder_source_type
            and n.source_id = r.charge_id
        )),
    (select count(*)::integer
      from recipients r
      where r.reminder_source_type = 'finance_charge_overdue'
        and not exists (
          select 1 from public.app_notifications n
          where n.recipient_profile_id = r.guardian_profile_id
            and n.source_type = r.reminder_source_type
            and n.source_id = r.charge_id
        ))
  into
    due_soon_charge_count,
    overdue_charge_count,
    due_soon_recipient_count,
    overdue_recipient_count,
    due_soon_new_count,
    overdue_new_count;

  return jsonb_build_object(
    'as_of', target_as_of,
    'due_soon_days', target_due_soon_days,
    'scope_branch_id', target_branch_id,
    'due_soon_charge_count', due_soon_charge_count,
    'overdue_charge_count', overdue_charge_count,
    'due_soon_recipient_count', due_soon_recipient_count,
    'overdue_recipient_count', overdue_recipient_count,
    'due_soon_new_notifications', due_soon_new_count,
    'overdue_new_notifications', overdue_new_count,
    'total_new_notifications', due_soon_new_count + overdue_new_count
  );
end;
$$;

create or replace function public.queue_finance_charge_reminders(
  target_school_id uuid,
  target_branch_id uuid,
  target_as_of date default current_date,
  target_due_soon_days integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  created_notification_id uuid;
  created_count integer := 0;
  deduped_count integer := 0;
  candidate_count integer := 0;
  reminder_title text;
  reminder_body text;
  reminder_event_type text;
begin
  perform public.preview_finance_charge_reminders(
    target_school_id,
    target_branch_id,
    target_as_of,
    target_due_soon_days
  );

  for candidate in
    select distinct
      c.id as charge_id,
      c.student_id,
      c.due_date,
      concat_ws(' ', s.first_name, s.last_name) as student_name,
      r.guardian_profile_id,
      c.net_amount - coalesce((
        select sum(p.amount)
        from public.payments p
        where p.school_id = c.school_id
          and p.charge_id = c.id
          and p.status = 'completed'
      ), 0) as outstanding,
      case
        when c.due_date < target_as_of then 'finance_charge_overdue'
        else 'finance_charge_due_soon'
      end as reminder_source_type
    from public.student_charges c
    join public.students s
      on s.school_id = c.school_id
     and s.id = c.student_id
     and s.status = 'active'
    join public.student_guardians r
      on r.school_id = c.school_id
     and r.student_id = c.student_id
     and r.status = 'active'
    join public.profiles gp
      on gp.id = r.guardian_profile_id
     and gp.status = 'active'
    where c.school_id = target_school_id
      and c.status in ('pending', 'partially_paid')
      and (target_branch_id is null or c.branch_id = target_branch_id)
      and (
        c.due_date < target_as_of
        or c.due_date between target_as_of
          and (target_as_of + target_due_soon_days)
      )
      and c.net_amount - coalesce((
        select sum(p.amount)
        from public.payments p
        where p.school_id = c.school_id
          and p.charge_id = c.id
          and p.status = 'completed'
      ), 0) > 0
  loop
    candidate_count := candidate_count + 1;

    if candidate.reminder_source_type = 'finance_charge_overdue' then
      reminder_event_type := 'fee_overdue';
      reminder_title := 'تذكير باستحقاق متأخر';
      reminder_body := 'استحقاق ' || candidate.student_name
        || ' بتاريخ ' || candidate.due_date::text
        || ' متأخر. الرصيد المتبقي: '
        || candidate.outstanding::text || ' دج.';
    else
      reminder_event_type := 'fee_due_soon';
      reminder_title := 'تذكير بقرب موعد الاستحقاق';
      reminder_body := 'موعد استحقاق ' || candidate.student_name
        || ' هو ' || candidate.due_date::text
        || '. الرصيد المتبقي: '
        || candidate.outstanding::text || ' دج.';
    end if;

    created_notification_id := public.create_app_notification_internal(
      target_school_id,
      candidate.guardian_profile_id,
      (select auth.uid()),
      candidate.student_id,
      'finance',
      reminder_event_type,
      reminder_title,
      reminder_body,
      '/parent/students/' || candidate.student_id::text,
      candidate.reminder_source_type,
      candidate.charge_id
    );

    if created_notification_id is null then
      deduped_count := deduped_count + 1;
    else
      created_count := created_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'candidate_count', candidate_count,
    'created_count', created_count,
    'deduped_count', deduped_count,
    'as_of', target_as_of,
    'due_soon_days', target_due_soon_days,
    'scope_branch_id', target_branch_id
  );
end;
$$;

revoke all on function public.finance_recurring_period(text, date) from public;
revoke all on function public.finance_can_manage_generation_scope(uuid, uuid) from public;
revoke all on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date) from public, anon;
revoke all on function public.generate_recurring_fee_plan_charges(uuid, uuid, uuid, date) from public, anon;
revoke all on function public.preview_finance_charge_reminders(uuid, uuid, date, integer) from public, anon;
revoke all on function public.queue_finance_charge_reminders(uuid, uuid, date, integer) from public, anon;

grant execute on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.generate_recurring_fee_plan_charges(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.preview_finance_charge_reminders(uuid, uuid, date, integer) to authenticated;
grant execute on function public.queue_finance_charge_reminders(uuid, uuid, date, integer) to authenticated;

comment on function public.preview_recurring_fee_plan_generation(uuid, uuid, uuid, date) is
  'Read-only preview for recurring charge generation. Counts existing equivalent plan/period charges and active discount policies before explicit confirmation.';
comment on function public.generate_recurring_fee_plan_charges(uuid, uuid, uuid, date) is
  'Idempotent confirmed recurring fee-plan generation. Applies no discount automatically; active discount policies require explicit finance review.';
comment on function public.preview_finance_charge_reminders(uuid, uuid, date, integer) is
  'Read-only finance.manage preview of due-soon/overdue guardian in-app reminders and dedupe counts.';
comment on function public.queue_finance_charge_reminders(uuid, uuid, date, integer) is
  'Explicit finance.manage action that creates retry-safe in-app finance reminders for current active guardians only.';

commit;