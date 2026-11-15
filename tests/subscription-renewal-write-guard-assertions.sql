-- Post-migration assertions for 092_subscription_renewal_write_guard.sql.
do $$
declare
  trigger_definition text;
  renewal_definition text;
begin
  select pg_get_functiondef('private.enforce_school_subscription_write()'::regprocedure)
    into trigger_definition;
  if position('SUBSCRIPTION_UPDATE_REQUIRES_PAYMENT_OR_TRIAL_EXTENSION' in trigger_definition) = 0 then
    raise exception 'Direct platform-owner subscription updates are not guarded';
  end if;

  select pg_get_functiondef('private.record_subscription_payment_and_renew(uuid,numeric,text,timestamptz,text,text,text,uuid,numeric)'::regprocedure)
    into renewal_definition;
  if position('private.subscription_write_contexts' in renewal_definition) = 0 then
    raise exception 'Payment renewal function is missing its transaction-scoped write context';
  end if;

  if has_table_privilege('authenticated', 'private.subscription_write_contexts', 'INSERT')
    or has_table_privilege('authenticated', 'private.subscription_write_contexts', 'SELECT') then
    raise exception 'Authenticated role can access private subscription write contexts';
  end if;

  if has_function_privilege('anon', 'public.extend_school_subscription_trial(uuid,timestamptz)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.extend_school_subscription_trial(uuid,timestamptz)', 'EXECUTE') then
    raise exception 'Trial extension RPC grants are not least-privilege';
  end if;
end;
$$;
