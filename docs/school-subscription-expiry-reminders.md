# School subscription expiry reminders

Migration 082 creates an idempotent reminder generator and a private reminder table. It does not expose the generator through the public Data API.

After migration 082 has been reviewed and applied, enable the already-available `pg_cron` extension in Supabase Dashboard → Database → Extensions, then create the daily job:

```sql
-- Remove an earlier job with the same name so this setup is repeatable.
select cron.unschedule(jobid)
from cron.job
where jobname = 'quranos-school-subscription-reminders';

select cron.schedule(
  'quranos-school-subscription-reminders',
  '0 7 * * *',
  'select private.generate_school_subscription_reminders();'
);
```

The schedule runs at 07:00 UTC, which is 08:00 in Algeria (Africa/Algiers). It creates reminders exactly 30 and 7 calendar days before the trial or annual subscription end date. Each reminder is idempotent and creates an in-app notification for active school-wide `school_admin` members only. Trial access continues through the configured grace period after `trial_ends_at`; the school becomes read-only only after `grace_ends_at`. The notification opens `/subscription`.

Verify the job and recent runs:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'quranos-school-subscription-reminders';

select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'quranos-school-subscription-reminders'
)
order by start_time desc
limit 10;
```

The generator is safe to run more than once. If a trial or subscription end date changes, the UI should display reminders matching the current end date only. Do not schedule this job before the migration is applied and validated.
