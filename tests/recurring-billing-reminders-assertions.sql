\set ON_ERROR_STOP on

reset role;
do $$
declare
  s date;
  e date;
begin
  select period_start, period_end into s, e
  from public.finance_recurring_period('monthly', '2026-08-19');
  if s <> '2026-08-01' or e <> '2026-08-31' then
    raise exception 'monthly period mismatch: % -> %', s, e;
  end if;

  select period_start, period_end into s, e
  from public.finance_recurring_period('quarterly', '2026-08-19');
  if s <> '2026-07-01' or e <> '2026-09-30' then
    raise exception 'quarterly period mismatch: % -> %', s, e;
  end if;

  select period_start, period_end into s, e
  from public.finance_recurring_period('yearly', '2026-08-19');
  if s <> '2026-01-01' or e <> '2026-12-31' then
    raise exception 'yearly period mismatch: % -> %', s, e;
  end if;
end;
$$;

-- Branch-scoped finance operator: Branch A1 only.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);

select public.preview_recurring_fee_plan_generation(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-19'
) as preview_json \gset
select set_config('test.preview_json', :'preview_json', false);

do $$
declare
  p jsonb := current_setting('test.preview_json')::jsonb;
begin
  if (p ->> 'period_start')::date <> '2026-08-01' then raise exception 'unexpected recurring period start'; end if;
  if (p ->> 'period_end')::date <> '2026-08-31' then raise exception 'unexpected recurring period end'; end if;
  if (p ->> 'due_date')::date <> '2026-08-10' then raise exception 'unexpected due date'; end if;
  if (p ->> 'eligible_count')::integer <> 2 then raise exception 'expected 2 eligible students: %', p; end if;
  if (p ->> 'already_charged_count')::integer <> 1 then raise exception 'expected 1 existing charge: %', p; end if;
  if (p ->> 'to_create_count')::integer <> 1 then raise exception 'expected 1 new recurring charge: %', p; end if;
  if (p ->> 'students_with_active_discounts')::integer <> 1 then raise exception 'expected active discount warning: %', p; end if;
  if (p ->> 'total_amount')::numeric <> 1000 then raise exception 'expected preview total 1000: %', p; end if;
  if p ->> 'discount_policy' <> 'explicit_review_required' then raise exception 'discount policy was not explicit-review only'; end if;
end;
$$;

do $$
begin
  begin
    perform public.preview_recurring_fee_plan_generation(
      '10000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000004',
      '20000000-0000-4000-8000-000000000001',
      '2026-08-19'
    );
    raise exception 'expected missing due_day rejection';
  exception when invalid_parameter_value then
    if sqlerrm <> 'FINANCE_RECURRING_DUE_DAY_REQUIRED' then raise; end if;
  end;

  begin
    perform public.preview_recurring_fee_plan_generation(
      '10000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000002',
      '2026-08-19'
    );
    raise exception 'expected A2 branch scope denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'FINANCE_MANAGE_REQUIRED' then raise; end if;
  end;

  begin
    perform public.preview_recurring_fee_plan_generation(
      '10000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000002',
      null,
      '2026-08-19'
    );
    raise exception 'expected school-wide scope denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'FINANCE_MANAGE_REQUIRED' then raise; end if;
  end;
end;
$$;

select public.generate_recurring_fee_plan_charges(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-19'
) as generation_json \gset
select set_config('test.generation_json', :'generation_json', false);

do $$
declare
  p jsonb := current_setting('test.generation_json')::jsonb;
begin
  if (p ->> 'created_count')::integer <> 1 then raise exception 'expected one generated charge: %', p; end if;
  if (p ->> 'skipped_count')::integer <> 1 then raise exception 'expected one skipped existing charge: %', p; end if;
  if (p ->> 'created_total')::numeric <> 1000 then raise exception 'expected generated total 1000: %', p; end if;
end;
$$;

-- Inspect generated accounting state as the PostgreSQL owner, not as browser role.
reset role;
select id as generated_charge_id
from public.student_charges
where school_id = '10000000-0000-4000-8000-000000000001'
  and student_id = '50000000-0000-4000-8000-000000000001'
  and fee_plan_id = '71000000-0000-4000-8000-000000000001'
  and period_start = '2026-08-01'
  and period_end = '2026-08-31'
limit 1 \gset
select set_config('test.generated_charge_id', :'generated_charge_id', false);

do $$
declare
  charge_row public.student_charges%rowtype;
  charge_id uuid := current_setting('test.generated_charge_id')::uuid;
begin
  select * into strict charge_row from public.student_charges where id = charge_id;
  if charge_row.generation_source <> 'recurring_fee_plan' then raise exception 'missing recurring generation source'; end if;
  if charge_row.billing_cycle_snapshot <> 'monthly' then raise exception 'missing billing cycle snapshot'; end if;
  if charge_row.fee_plan_name_snapshot <> 'اشتراك شهري A1' then raise exception 'missing plan name snapshot'; end if;
  if charge_row.original_amount <> 1000 or charge_row.discount_amount <> 0 or charge_row.net_amount <> 1000 then
    raise exception 'discount was auto-applied or generated amount is wrong';
  end if;
end;
$$;

-- Repeating the exact generation is idempotent.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.generate_recurring_fee_plan_charges(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-19'
) as retry_json \gset
select set_config('test.retry_json', :'retry_json', false);

do $$
declare
  p jsonb := current_setting('test.retry_json')::jsonb;
begin
  if (p ->> 'created_count')::integer <> 0 then raise exception 'retry created a duplicate: %', p; end if;
  if (p ->> 'skipped_count')::integer <> 2 then raise exception 'retry should skip both eligible students: %', p; end if;
end;
$$;

-- School admin can preview a school-wide quarterly plan, proving null scope is explicit.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.preview_recurring_fee_plan_generation(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  null,
  '2026-08-19'
) as school_preview_json \gset
select set_config('test.school_preview_json', :'school_preview_json', false);

do $$
declare
  p jsonb := current_setting('test.school_preview_json')::jsonb;
begin
  if p ->> 'scope_branch_id' is not null then raise exception 'school preview unexpectedly narrowed scope'; end if;
  if (p ->> 'period_start')::date <> '2026-07-01' or (p ->> 'period_end')::date <> '2026-09-30' then
    raise exception 'quarterly preview period mismatch: %', p;
  end if;
  if (p ->> 'due_date')::date <> '2026-07-05' then raise exception 'quarterly due date mismatch: %', p; end if;
end;
$$;

-- Reminder preview as branch Finance A: two due-soon charges, only one active guardian recipient.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.preview_finance_charge_reminders(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-08',
  3
) as reminder_preview_json \gset
select set_config('test.reminder_preview_json', :'reminder_preview_json', false);

do $$
declare
  p jsonb := current_setting('test.reminder_preview_json')::jsonb;
begin
  if (p ->> 'due_soon_charge_count')::integer <> 2 then raise exception 'expected two due-soon charges: %', p; end if;
  if (p ->> 'due_soon_recipient_count')::integer <> 1 then raise exception 'pending guardian was incorrectly eligible: %', p; end if;
  if (p ->> 'due_soon_new_notifications')::integer <> 1 then raise exception 'expected one new due-soon notification: %', p; end if;
  if (p ->> 'overdue_new_notifications')::integer <> 0 then raise exception 'unexpected overdue notification before due date: %', p; end if;
end;
$$;

select public.queue_finance_charge_reminders(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-08',
  3
) as due_queue_json \gset
select set_config('test.due_queue_json', :'due_queue_json', false);

do $$
declare
  p jsonb := current_setting('test.due_queue_json')::jsonb;
begin
  if (p ->> 'candidate_count')::integer <> 1 or (p ->> 'created_count')::integer <> 1 then
    raise exception 'due-soon queue did not create exactly one notification: %', p;
  end if;
end;
$$;

-- Exact retry dedupes for the same guardian + charge + stage.
select public.queue_finance_charge_reminders(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-08',
  3
) as due_retry_json \gset
select set_config('test.due_retry_json', :'due_retry_json', false);

do $$
declare
  p jsonb := current_setting('test.due_retry_json')::jsonb;
begin
  if (p ->> 'created_count')::integer <> 0 or (p ->> 'deduped_count')::integer <> 1 then
    raise exception 'due-soon retry was not deduped: %', p;
  end if;
end;
$$;

-- Once overdue, a distinct stage notification is allowed exactly once.
select public.preview_finance_charge_reminders(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-12',
  3
) as overdue_preview_json \gset
select set_config('test.overdue_preview_json', :'overdue_preview_json', false);

do $$
declare
  p jsonb := current_setting('test.overdue_preview_json')::jsonb;
begin
  if (p ->> 'overdue_charge_count')::integer <> 2 then raise exception 'expected two overdue charges: %', p; end if;
  if (p ->> 'overdue_recipient_count')::integer <> 1 then raise exception 'expected one active guardian overdue recipient: %', p; end if;
  if (p ->> 'overdue_new_notifications')::integer <> 1 then raise exception 'expected one new overdue stage: %', p; end if;
end;
$$;

select public.queue_finance_charge_reminders(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-12',
  3
) as overdue_queue_json \gset
select set_config('test.overdue_queue_json', :'overdue_queue_json', false);

do $$
declare
  p jsonb := current_setting('test.overdue_queue_json')::jsonb;
begin
  if (p ->> 'created_count')::integer <> 1 then raise exception 'overdue stage was not created: %', p; end if;
end;
$$;

reset role;
do $$
declare
  charge_id uuid := current_setting('test.generated_charge_id')::uuid;
  due_count integer;
  overdue_count integer;
begin
  select count(*) into due_count
  from public.app_notifications
  where recipient_profile_id = '60000000-0000-4000-8000-000000000006'
    and source_type = 'finance_charge_due_soon'
    and source_id = charge_id;
  select count(*) into overdue_count
  from public.app_notifications
  where recipient_profile_id = '60000000-0000-4000-8000-000000000006'
    and source_type = 'finance_charge_overdue'
    and source_id = charge_id;
  if due_count <> 1 or overdue_count <> 1 then
    raise exception 'expected exactly one notification for each reminder stage';
  end if;
  if exists (
    select 1 from public.app_notifications
    where recipient_profile_id = '60000000-0000-4000-8000-000000000007'
      and source_type in ('finance_charge_due_soon', 'finance_charge_overdue')
  ) then
    raise exception 'pending guardian unexpectedly received finance notification';
  end if;
end;
$$;

-- Pay Student 1 charge in full. Existing finance triggers must mark it paid.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
insert into public.payments (
  school_id,
  branch_id,
  student_id,
  charge_id,
  amount,
  payment_method,
  payment_date,
  reference_number,
  notes
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  current_setting('test.generated_charge_id')::uuid,
  1000,
  'cash',
  '2026-08-12',
  'REC-FULL-001',
  'Runtime full payment'
);

reset role;
do $$
declare
  charge_status text;
  charge_id uuid := current_setting('test.generated_charge_id')::uuid;
begin
  select status into charge_status from public.student_charges where id = charge_id;
  if charge_status <> 'paid' then raise exception 'full payment did not mark recurring charge paid'; end if;
end;
$$;

-- Paid charge disappears from reminder candidates. Student 2 remains overdue but has no active guardian.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.preview_finance_charge_reminders(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-13',
  3
) as paid_preview_json \gset
select set_config('test.paid_preview_json', :'paid_preview_json', false);

do $$
declare
  p jsonb := current_setting('test.paid_preview_json')::jsonb;
begin
  if (p ->> 'overdue_charge_count')::integer <> 1 then raise exception 'paid charge was still reminder-eligible: %', p; end if;
  if (p ->> 'overdue_recipient_count')::integer <> 0 then raise exception 'pending guardian became reminder recipient: %', p; end if;
  if (p ->> 'total_new_notifications')::integer <> 0 then raise exception 'new notification remained after payment: %', p; end if;
end;
$$;

select public.queue_finance_charge_reminders(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-13',
  3
) as paid_queue_json \gset
select set_config('test.paid_queue_json', :'paid_queue_json', false);

do $$
declare
  p jsonb := current_setting('test.paid_queue_json')::jsonb;
begin
  if (p ->> 'candidate_count')::integer <> 0 or (p ->> 'created_count')::integer <> 0 then
    raise exception 'finance reminder continued after payment/no active guardian: %', p;
  end if;
end;
$$;

select 'recurring_billing_reminders_runtime_passed' as result;
