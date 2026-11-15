# School subscription expiry reminders

Migration 082 creates the idempotent 30-day and 7-day reminder generator and its private reminder table. Before applying migration 091, enable the already-available Supabase `pg_cron` extension in Supabase Dashboard → Database → Extensions. Migration 091 verifies that the extension is enabled and then installs the daily job automatically. It does not attempt to install or modify the extension itself.

## Scheduled job

Migration 091 safely removes any previous job with the same name and schedules:

- Job: `quranos-school-subscription-reminders`
- Schedule: `0 7 * * *` (07:00 UTC / 08:00 in Algeria, Africa/Algiers)
- Command: `select private.generate_school_subscription_reminders();`

The generator creates reminders exactly 30 and 7 calendar days before the trial or annual subscription end date. Each reminder is idempotent and creates an in-app notification for active school-wide `school_admin` members only. Trial access continues through the configured grace period after `trial_ends_at`; the school becomes read-only only after `grace_ends_at`. The notification opens `/subscription`.

No paid service, email provider, SMS provider, or external scheduler is used.

## Verification

After migration 091 is applied, verify the job:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'quranos-school-subscription-reminders';
```

Inspect recent runs:

```sql
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'quranos-school-subscription-reminders'
)
order by start_time desc
limit 10;
```

The generator is safe to run more than once. If a trial or subscription end date changes, the UI displays reminders matching the current end date only. Do not apply migration 091 to production until the migration has been reviewed and its isolated-database validation has passed.
