-- Post-migration assertions for 092_subscription_renewal_write_guard.sql.
do $$
declare
  trigger_definition text;
  renewal_config text;
begin
  select pg_get_functiondef('private.enforce_school_subscription_write()'::regprocedure)
    into trigger_definition;
  if position('SUBSCRIPTION_UPDATE_REQUIRES_PAYMENT_OR_TRIAL_EXTENSION' in trigger_definition) = 0 then
    raise exception 'Direct platform-owner subscription updates are not guarded';
  end if;

  select coalesce(proconfig::text, '') into renewal_config
  from pg_proc
  where oid = 'private.record_subscription_payment_and_renew(uuid,numeric,text,timestamptz,text,text,text,uuid,numeric)'::regprocedure;
  if position('quranos.subscription_write_context=payment_renewal' in renewal_config) = 0 then
    raise exception 'Payment renewal function is missing its protected write context';
  end if;

  if has_function_privilege('anon', 'public.extend_school_subscription_trial(uuid,timestamptz)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.extend_school_subscription_trial(uuid,timestamptz)', 'EXECUTE') then
    raise exception 'Trial extension RPC grants are not least-privilege';
  end if;
end;
$$;
