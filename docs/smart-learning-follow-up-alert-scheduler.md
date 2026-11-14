# Smart learning follow-up alert scheduler

Migration 090 installs Supabase Cron (pg_cron) and schedules the existing smart-learning alert generator hourly.

## What runs

- Expired explicit memorization and revision targets.
- Repeated unresolved weakness notes (at least two open observations for the assigned passage).
- Recorded absences from the previous 30 days.

The worker calls the existing refresh_learning_follow_up_alerts function under each active school membership that has access to at least one active memorization class. This preserves its class-level permission checks and its existing recipient checks: assigned teachers and guardians linked to that student only. Notification deduplication remains enforced by the existing notification writer.

## Safety boundaries

- The worker lives in the non-exposed private schema.
- It is executable only by the database postgres role, not anon, authenticated, or service_role.
- It sends in-app notifications only. It does not send email, SMS, WhatsApp, or invoke paid services.
- It does not infer missing memorization from an absence of records; only explicit teacher-assigned targets can become overdue.
- The schedule runs hourly at minute 0 (UTC). No user-facing data is deleted or rewritten.

## Verification

After applying the migration, inspect cron.job for the job name quranos-smart-learning-follow-up. The expected schedule is 0 * * * *.

Inspect cron.job_run_details for recent runs. Successful runs return a JSON result with processed and skipped membership counts. A skipped membership is logged without stopping other schools.
