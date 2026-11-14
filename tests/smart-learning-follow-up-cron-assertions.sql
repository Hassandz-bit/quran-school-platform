-- Assertions for migration 090_smart_learning_follow_up_cron.sql.
do $$
declare
  scheduled_job_count integer;
  worker_oid oid;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is not installed';
  end if;

  select count(*) into scheduled_job_count
  from cron.job
  where jobname = 'quranos-smart-learning-follow-up'
    and schedule = '0 * * * *'
    and command = 'select private.run_smart_learning_follow_up_alerts();'
    and active;

  if scheduled_job_count <> 1 then
    raise exception 'Expected exactly one active hourly smart-learning cron job; found %',
      scheduled_job_count;
  end if;

  worker_oid := 'private.run_smart_learning_follow_up_alerts()'::regprocedure;
  if has_function_privilege('anon', worker_oid, 'EXECUTE')
    or has_function_privilege('authenticated', worker_oid, 'EXECUTE')
    or has_function_privilege('service_role', worker_oid, 'EXECUTE')
  then
    raise exception 'Private smart-learning cron worker is executable by an API role';
  end if;
end;
$$;
