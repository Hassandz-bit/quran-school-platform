-- Require a recorded payment for annual subscription renewal.
-- Trial extensions remain available through a narrow owner-only RPC.

begin;

create or replace function private.enforce_school_subscription_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_school_id uuid;
  v_new_school_id uuid;
  v_write_context text;
  v_grace_days integer;
begin
  if tg_table_name = 'school_subscription_renewal_requests' and tg_op = 'INSERT' then
    return new;
  end if;

  if tg_table_name = 'school_subscriptions'
     and tg_op = 'UPDATE'
     and public.is_platform_owner() then
    v_write_context := current_setting('quranos.subscription_write_context', true);

    if v_write_context = 'payment_renewal' then
      return new;
    end if;

    if v_write_context = 'trial_extension'
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

-- PostgreSQL applies this setting only while the trusted renewal function executes.
alter function private.record_subscription_payment_and_renew(
  uuid, numeric, text, timestamptz, text, text, text, uuid, numeric
) set quranos.subscription_write_context = 'payment_renewal';

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

  perform set_config('quranos.subscription_write_context', 'trial_extension', true);
  update public.school_subscriptions
  set trial_ends_at = target_trial_ends_at,
      grace_ends_at = target_trial_ends_at + make_interval(days => coalesce(v_grace_days, 7))
  where id = v_subscription.id;
  perform set_config('quranos.subscription_write_context', '', true);
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
