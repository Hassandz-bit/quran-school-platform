-- QuranOS platform subscriptions: aggregate-only usage filters and scheduled expiry reminders.
-- The API returns counts only; student and branch records remain inaccessible to platform-owner UI clients.

begin;

do $extension_check$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise exception 'Enable the Supabase pg_cron extension in Database > Extensions before applying migration 091.';
  end if;
end;
$extension_check$;

create or replace function private.get_platform_subscription_usage()
returns table (
  school_id uuid,
  active_students bigint,
  active_branches bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'PLATFORM_OWNER_REQUIRED';
  end if;

  return query
  with student_counts as (
    select student.school_id, count(*)::bigint as active_students
    from public.students student
    where student.status = 'active'
    group by student.school_id
  ),
  branch_counts as (
    select branch.school_id, count(*)::bigint as active_branches
    from public.branches branch
    where branch.status = 'active'
    group by branch.school_id
  )
  select school.id,
         coalesce(student_counts.active_students, 0),
         coalesce(branch_counts.active_branches, 0)
  from public.schools school
  left join student_counts on student_counts.school_id = school.id
  left join branch_counts on branch_counts.school_id = school.id
  order by school.name, school.id;
end;
$function$;

revoke all on function private.get_platform_subscription_usage()
  from public, anon, authenticated, service_role;
grant execute on function private.get_platform_subscription_usage() to authenticated;

create or replace function public.get_platform_subscription_usage()
returns table (
  school_id uuid,
  active_students bigint,
  active_branches bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.get_platform_subscription_usage();
$function$;

revoke all on function public.get_platform_subscription_usage() from public, anon;
grant execute on function public.get_platform_subscription_usage() to authenticated;

-- Schedule the existing idempotent 30-day / 7-day notification generator daily at 08:00 Algeria time.
do $schedule$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job
    where jobname = 'quranos-school-subscription-reminders'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'quranos-school-subscription-reminders',
    '0 7 * * *',
    'select private.generate_school_subscription_reminders();'
  );
end;
$schedule$;

comment on function private.get_platform_subscription_usage() is
  'Returns only active student and branch counts per school to the authenticated platform owner.';

commit;
