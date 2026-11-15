-- Require a recorded payment for annual subscription renewal.
-- Trial extensions remain available through a narrow owner-only RPC.

begin;

-- Transaction-scoped capability records replace caller-controlled request settings.
create table if not exists private.subscription_write_contexts (
  transaction_id bigint not null,
  actor_user_id uuid not null,
  context text not null check (context in ('payment_renewal', 'trial_extension')),
  primary key (transaction_id, actor_user_id)
);
revoke all on private.subscription_write_contexts from public, anon, authenticated, service_role;

create or replace function private.enforce_school_subscription_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_school_id uuid;
  v_new_school_id uuid;
  v_grace_days integer;
begin
  if tg_table_name = 'school_subscription_renewal_requests' and tg_op = 'INSERT' then
    return new;
  end if;

  if tg_table_name = 'school_subscriptions'
     and tg_op = 'UPDATE'
     and public.is_platform_owner() then
    if exists (
      select 1 from private.subscription_write_contexts context_row
      where context_row.transaction_id = txid_current()
        and context_row.actor_user_id = auth.uid()
        and context_row.context = 'payment_renewal'
    ) then
      return new;
    end if;

    if exists (
      select 1 from private.subscription_write_contexts context_row
      where context_row.transaction_id = txid_current()
        and context_row.actor_user_id = auth.uid()
        and context_row.context = 'trial_extension'
    )
       and old.status = 'trial'
       and new.status = 'trial'
       and (to_jsonb(new) - array['trial_ends_at', 'grace_ends_at', 'updated_at'])
           = (to_jsonb(old) - array['trial_ends_at', 'grace_ends_at', 'updated_at'])
       and new.trial_ends_at > old.trial_ends_at then
      select grace_period_days into v_grace_days
      from public.platform_settings where singleton = true;
      if new.grace_ends_at is distinct from
         new.trial_ends_at + make_interval(days => coalesce(v_grace_days, 7)) then
        raise exception using errcode = '22023', message = 'INVALID_TRIAL_GRACE_DEADLINE';
      end if;
      return new;
    end if;

    raise exception using
      errcode = '42501',
      message = 'SUBSCRIPTION_UPDATE_REQUIRES_PAYMENT_OR_TRIAL_EXTENSION',
      detail = 'يجب تسجيل دفع لتجديد الاشتراك السنوي؛ تمديد التجربة متاح عبر الإجراء المخصص فقط.';
  end if;

  if public.is_platform_owner() or session_user = 'postgres' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'app_notifications' and tg_op = 'UPDATE'
     and (to_jsonb(old) - 'read_at') = (to_jsonb(new) - 'read_at') then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old_school_id := private.resolve_school_id_from_tenant_row(tg_table_name, to_jsonb(old));
  end if;
  if tg_op <> 'DELETE' then
    v_new_school_id := private.resolve_school_id_from_tenant_row(tg_table_name, to_jsonb(new));
  end if;

  if (v_old_school_id is not null and not private.school_subscription_can_operate(v_old_school_id))
     or (v_new_school_id is not null and not private.school_subscription_can_operate(v_new_school_id)) then
    raise exception using
      errcode = 'P0001',
      message = 'SCHOOL_SUBSCRIPTION_READ_ONLY',
      detail = 'انتهت صلاحية الاشتراك وفترة السماح. البيانات محفوظة، ويلزم التجديد لاستئناف التعديلات.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function private.record_subscription_payment_and_renew(
  target_school_id uuid,
  target_amount numeric,
  target_payment_method text,
  target_paid_at timestamptz default now(),
  target_reference text default null,
  target_receipt_path text default null,
  target_note text default null,
  target_plan_id uuid default null,
  target_discount_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription public.school_subscriptions%rowtype;
  v_payment_id uuid;
  v_start timestamptz;
  v_grace_days integer := 7;
  v_plan public.subscription_plans%rowtype;
  v_discount numeric := coalesce(target_discount_amount, 0);
  v_expected_amount numeric;
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'PLATFORM_OWNER_REQUIRED';
  end if;
  if target_amount <= 0 then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_AMOUNT';
  end if;
  if target_payment_method not in ('cash', 'bank_transfer', 'ccp', 'cheque', 'other') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;

  select * into v_subscription
  from public.school_subscriptions
  where school_id = target_school_id
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SCHOOL_SUBSCRIPTION_NOT_FOUND';
  end if;
  if v_subscription.status = 'suspended' or v_subscription.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'SUBSCRIPTION_NOT_RENEWABLE';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = coalesce(target_plan_id, v_subscription.plan_id)
    and is_active = true;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACTIVE_PLAN_REQUIRED_FOR_RENEWAL';
  end if;
  if v_discount < 0 or v_discount >= v_plan.annual_price then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_DISCOUNT';
  end if;
  v_expected_amount := greatest(v_plan.annual_price - v_discount, 0);
  if abs(target_amount - v_expected_amount) > 0.01 then
    raise exception using errcode = '22023', message = 'RENEWAL_PAYMENT_AMOUNT_MISMATCH',
      detail = 'مبلغ الدفع يجب أن يساوي السعر السنوي بعد الخصم.';
  end if;

  select grace_period_days into v_grace_days
  from public.platform_settings where singleton = true;

  v_start := case
    when v_subscription.trial_ends_at is not null and v_subscription.trial_ends_at > now()
      then v_subscription.trial_ends_at
    when v_subscription.ends_at is not null and v_subscription.ends_at > now()
      then v_subscription.ends_at
    else now()
  end;

  insert into private.subscription_write_contexts (transaction_id, actor_user_id, context)
  values (txid_current(), auth.uid(), 'payment_renewal')
  on conflict (transaction_id, actor_user_id) do update set context = excluded.context;

  update public.school_subscriptions
  set plan_id = v_plan.id,
      plan_name_snapshot = v_plan.name_ar,
      max_active_students = v_plan.max_active_students,
      max_active_branches = v_plan.max_active_branches,
      agreed_annual_price = greatest(v_plan.annual_price - v_discount, 0),
      discount_amount = v_discount,
      currency_code = v_plan.currency_code,
      status = 'active',
      starts_at = v_start,
      ends_at = v_start + interval '1 year',
      trial_ends_at = null,
      grace_ends_at = v_start + interval '1 year' + make_interval(days => v_grace_days),
      updated_at = now()
  where id = v_subscription.id;

  delete from private.subscription_write_contexts
  where transaction_id = txid_current() and actor_user_id = auth.uid();

  insert into public.subscription_payments (
    school_id, subscription_id, amount, currency_code, paid_at,
    payment_method, reference, receipt_path, note, recorded_by
  ) values (
    target_school_id, v_subscription.id, target_amount, v_plan.currency_code,
    coalesce(target_paid_at, now()), target_payment_method,
    target_reference, target_receipt_path, target_note, auth.uid()
  ) returning id into v_payment_id;

  update public.school_subscription_renewal_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = 'تم تسجيل الدفع وتجديد الاشتراك.'
  where school_id = target_school_id and status = 'pending';

  return v_payment_id;
end;
$function$;

create or replace function private.extend_school_subscription_trial(
  target_school_id uuid,
  target_trial_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription public.school_subscriptions%rowtype;
  v_grace_days integer := 7;
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'PLATFORM_OWNER_REQUIRED';
  end if;
  if target_trial_ends_at is null or target_trial_ends_at <= now() then
    raise exception using errcode = '22023', message = 'INVALID_TRIAL_END_DATE';
  end if;

  select * into v_subscription
  from public.school_subscriptions
  where school_id = target_school_id
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SCHOOL_SUBSCRIPTION_NOT_FOUND';
  end if;
  if v_subscription.status <> 'trial' then
    raise exception using errcode = 'P0001', message = 'SUBSCRIPTION_IS_NOT_IN_TRIAL';
  end if;
  if target_trial_ends_at <= v_subscription.trial_ends_at then
    raise exception using errcode = '22023', message = 'TRIAL_EXTENSION_MUST_INCREASE_END_DATE';
  end if;

  select grace_period_days into v_grace_days
  from public.platform_settings where singleton = true;

  insert into private.subscription_write_contexts (transaction_id, actor_user_id, context)
  values (txid_current(), auth.uid(), 'trial_extension')
  on conflict (transaction_id, actor_user_id) do update set context = excluded.context;

  update public.school_subscriptions
  set trial_ends_at = target_trial_ends_at,
      grace_ends_at = target_trial_ends_at + make_interval(days => coalesce(v_grace_days, 7))
  where id = v_subscription.id;

  delete from private.subscription_write_contexts
  where transaction_id = txid_current() and actor_user_id = auth.uid();
end;
$function$;

revoke all on function private.extend_school_subscription_trial(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.extend_school_subscription_trial(uuid, timestamptz)
  to authenticated;

create or replace function public.extend_school_subscription_trial(
  target_school_id uuid,
  target_trial_ends_at timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.extend_school_subscription_trial(target_school_id, target_trial_ends_at);
$function$;

revoke all on function public.extend_school_subscription_trial(uuid, timestamptz)
  from public, anon;
grant execute on function public.extend_school_subscription_trial(uuid, timestamptz)
  to authenticated;

comment on function public.extend_school_subscription_trial(uuid, timestamptz) is
  'Platform-owner-only trial extension. Updates trial and grace dates together; annual subscriptions require a recorded payment renewal.';

commit;
