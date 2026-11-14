-- QuranOS: run smart learning alerts automatically in the database.
-- The worker impersonates active school memberships only inside a private,
-- non-API function so the existing class-level permission checks remain in force.

begin;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function private.run_smart_learning_follow_up_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  membership_row record;
  previous_sub text := current_setting('request.jwt.claim.sub', true);
  previous_claims text := current_setting('request.jwt.claims', true);
  processed_memberships integer := 0;
  skipped_memberships integer := 0;
begin
  if current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'SMART_LEARNING_CRON_INTERNAL_ONLY';
  end if;

  for membership_row in
    select distinct m.school_id, m.profile_id
    from public.school_memberships m
    join public.profiles p on p.id = m.profile_id and p.status = 'active'
    where m.status = 'active' and m.profile_id is not null
    order by m.school_id, m.profile_id
  loop
    begin
      perform set_config('request.jwt.claim.sub', membership_row.profile_id::text, true);
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', membership_row.profile_id::text, 'role', 'authenticated')::text,
        true
      );

      if exists (
        select 1 from public.classes c
        where c.school_id = membership_row.school_id and c.status = 'active'
          and (
            public.can_access_memorization_class(
              membership_row.school_id, c.branch_id, c.id, 'memorization.view'
            )
            or public.can_access_memorization_class(
              membership_row.school_id, c.branch_id, c.id, 'memorization.manage'
            )
          )
      ) then
        perform public.refresh_learning_follow_up_alerts(
          membership_row.school_id, null, null, null
        );
        processed_memberships := processed_memberships + 1;
      else
        skipped_memberships := skipped_memberships + 1;
      end if;
    exception
      when others then
        skipped_memberships := skipped_memberships + 1;
        raise warning 'Smart learning alert refresh skipped for school %, profile %: %',
          membership_row.school_id, membership_row.profile_id, sqlerrm;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);

  return jsonb_build_object(
    'processed_memberships', processed_memberships,
    'skipped_memberships', skipped_memberships,
    'ran_at', now()
  );
end;
$function$;

revoke all on function private.run_smart_learning_follow_up_alerts()
  from public, anon, authenticated, service_role;
grant execute on function private.run_smart_learning_follow_up_alerts() to postgres;

do $schedule$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'quranos-smart-learning-follow-up'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'quranos-smart-learning-follow-up',
    '0 * * * *',
    'select private.run_smart_learning_follow_up_alerts();'
  );
end;
$schedule$;

comment on function private.run_smart_learning_follow_up_alerts() is
  'Private hourly scheduler worker for smart Quran learning alerts; preserves per-user class authorization and in-app recipient checks.';

commit;
