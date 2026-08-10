# V2 Guardian Notifications — Release-Only Deployment Handoff

> **Do not execute these steps on the current V1 Production environment.**
>
> `main` and `release/v1-initial` remain the frozen V1 line. This document is for the future intentional release of `develop/v2` only.

## What this enables

V2 guardian notifications use QuranOS Web Push for:

- confirmed student absence after attendance is saved;
- a later correction when a previously delivered absence changes to present, late, or excused absence;
- bounded automatic retries for transient Push-provider failures.

Attendance remains authoritative. Push delivery is deliberately asynchronous and cannot roll back or fail an already-saved attendance record.

## Required V2 database order

When V2 is intentionally released, apply its migrations in repository order after the currently released database baseline:

1. `023_guardian_push_foundation.sql`
2. `024_guardian_absence_notifications.sql`

Never reapply migrations that are already recorded in the target Supabase project.

## Required VAPID configuration

Generate one VAPID key pair for the V2 environment. The public and private values must be the matching pair and should remain stable after guardian devices subscribe.

Client environment:

- `VITE_GUARDIAN_PUSH_PUBLIC_VAPID_KEY`

Supabase Edge Function secrets:

- `GUARDIAN_PUSH_PUBLIC_VAPID_KEY`
- `GUARDIAN_PUSH_PRIVATE_VAPID_KEY`
- `GUARDIAN_PUSH_VAPID_SUBJECT`

The private VAPID key must never be placed in the browser bundle, GitHub repository, client-side Vercel variables, logs, or screenshots.

The VAPID subject should be an operator-controlled contact URI such as a verified `mailto:` address for QuranOS operations.

## Retry sweeper secret

Create a separate high-entropy secret of at least 32 characters for internal scheduled retries:

- Edge Function secret: `GUARDIAN_NOTIFICATION_CRON_SECRET`
- store the same value in Supabase Vault for the scheduled HTTP request

Do not reuse a user JWT, service-role key, VAPID private key, SMTP credential, or other platform secret for this purpose.

## Edge Function deployment

Deploy `dispatch-guardian-notifications` from the V2 source only after migrations 023 and 024 are present and the required secrets are configured.

This function intentionally has gateway `verify_jwt = false` because it supports two distinct authenticated entry modes:

1. attendance-client requests: the handler validates the supplied user bearer token and verifies exact `attendance.manage` access for the school/branch/class/session before touching the private outbox;
2. retry-sweeper requests: the handler validates `x-quranos-cron-secret` before touching the private outbox.

A request without either valid authorization path fails closed. Browser roles cannot directly read the outbox or execute its service-only claim/finish RPCs.

## Scheduled retry sweep

After the dispatcher is deployed, configure Supabase Cron to call it once per minute through the supported HTTP scheduling path.

Request contract:

- method: `POST`
- path: `/functions/v1/dispatch-guardian-notifications`
- header: `Content-Type: application/json`
- header: `x-quranos-cron-secret: <value loaded from Vault>`
- JSON body: `{ "mode": "retry_sweep" }`

The scheduled call must obtain its secret from Vault rather than embedding the secret in migration source or a public SQL file.

## Release verification order

Before enabling guardian opt-in for real families:

1. verify migrations 023 and 024 are recorded exactly once;
2. verify the dispatcher is ACTIVE with the intended V2 source/config;
3. verify all four server secrets exist without printing their values;
4. verify the client public VAPID key matches the server public key;
5. verify the Cron schedule exists and its latest runs succeed;
6. use one explicitly authorized test guardian/device to opt in;
7. record one controlled absence and confirm exactly one Push arrives;
8. save the same absence again and confirm no duplicate Push;
9. correct the attendance to late/present and confirm the correction behavior;
10. revoke the test guardian relationship and confirm no further notification can be claimed for that guardian.

Do not use a real student's family for the first delivery test unless the user explicitly authorizes that identity and test.

## V1 safety invariant

Until the user explicitly approves a V2 release:

- do not apply migrations 023 or 024 to V1 Production;
- do not deploy `dispatch-guardian-notifications` to V1 Production;
- do not configure VAPID/Cron secrets on behalf of V1;
- do not create the retry Cron job on V1;
- do not merge `develop/v2` into `main`;
- do not move or rewrite `release/v1-initial`.
