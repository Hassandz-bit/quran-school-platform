# QuranOS Offline-First — implementation plan

## Goal

Allow an already-authenticated teacher to continue essential classroom work during a temporary network outage, persist drafts on that device, and synchronize them safely after connectivity returns. This is a staged implementation plan, not a claim that offline writes are already enabled.

## Current baseline (verified on main)

- The app is installable as a PWA.
- `client/public/sw.js` caches the app shell and same-origin static assets.
- Navigation falls back to the cached app shell when offline.
- The service worker intentionally ignores non-GET requests and does not intercept Supabase/Auth writes.
- Attendance and memorization data access currently depends on live Supabase requests. Their save functions validate permissions against Supabase before writing.
- Therefore the current production app is **not yet offline-capable for attendance or memorization writes**.

## Scope order

### Phase 0 — safety and storage foundation

1. Use IndexedDB (not Cache Storage or localStorage) for structured, durable offline data.
2. Partition every record by authenticated `user_id` and `school_id`; never use a shared unscoped cache.
3. Store a schema version, creation/update timestamps, operation UUID, and explicit state (`pending`, `syncing`, `conflict`, `failed`, `synced`).
4. Expose queue counts and last-sync time in a shared sync-status component.
5. Do not store passwords, access tokens, refresh tokens, or service-role credentials in the offline store.
6. Do not silently discard pending work on sign-out, account switch, app update, or storage errors. Warn and require an explicit user decision before clearing pending records.
7. Document that browser/device storage is not encrypted by this feature and recommend trusted, access-controlled devices.

### Phase 1 — teacher attendance (first usable offline workflow)

1. After a successful online login and permission check, cache only the active teacher's authorized branches, classes, active roster, and the selected/current attendance sessions.
2. When offline, allow attendance edits only for a roster snapshot that was previously downloaded and whose authorization scope was last verified online.
3. Persist each draft locally immediately; display “saved on this device — waiting to sync”, not “saved to school”.
4. On reconnect, require a valid authenticated session and re-check current server-side `attendance.manage` permission and class/student membership.
5. Add server-side idempotency for each queued operation before enabling automatic retries. A client UUID alone does not prevent duplicate writes after a lost response.
6. Treat server rejection caused by revoked permission, archived/moved student, or stale roster as a visible conflict requiring user review. Never silently overwrite.
7. Keep the local operation until the server confirms it was applied or the user explicitly resolves/discards it.

### Phase 2 — memorization and group memorization

1. Cache the authorized teacher/class/student scope and only the minimum required display data.
2. Queue individual and group memorization entries with stable operation IDs.
3. Add server-side idempotency and safe update semantics before retrying writes.
4. For edits to existing records, compare a server version / `updated_at` snapshot; show a conflict instead of last-write-wins.
5. Preserve teacher assignment and class-level permission checks on the server at sync time.

### Phase 3 — broader read-only/offline access

Expand to student profiles, حلقات, schedules, and reports only after each data category has an explicit data-minimization, expiry, and authorization policy. Parent/guardian accounts must receive only their own linked children’s data.

## Synchronization contract

- Trigger sync when the app starts, the browser returns online, and the app becomes visible; Background Sync is an enhancement only, never the sole mechanism.
- Sync is scoped to the currently authenticated user and school.
- Process operations in creation order within a class/session; do not reorder dependent operations.
- Use server-enforced idempotency keys and transactional RPCs for attendance batches and group memorization.
- Distinguish transient network errors from validation/permission/conflict errors.
- Retry transient failures with bounded exponential backoff; do not retry permanent errors blindly.
- Show pending, syncing, synced, conflict, and failed states with actionable explanations.
- Never report an operation as synchronized until the server confirms it.

## Conflict rules

- Attendance: if the server session or student roster changed since the offline snapshot, preserve the local draft and require review. Do not replace newer server values automatically.
- Memorization insert: idempotency key prevents duplicate records.
- Memorization update: compare the record version captured at edit time with the current server version; mismatch becomes a conflict.
- Different records can synchronize independently; a failed item must not erase or block unrelated completed items.

## Security and device lifecycle

- IndexedDB is device-local storage, not an encrypted vault. Do not promise protection against someone with access to the unlocked device/browser profile.
- Clear cached school data only after successful sign-out and only when no pending work remains; otherwise require explicit confirmation and explain the consequence.
- On account switch, never expose the previous account's cached data.
- Enforce Supabase RLS and existing permission RPCs at the server for every synchronized write. A previous online permission check is not sufficient authorization later.
- Do not cache guardian, financial, identity-document, or unrelated notification data in the first teacher-focused phase.

## Acceptance tests

1. Install/open the app online, download an authorized teacher roster, then switch the device offline.
2. Record attendance for that cached roster; reload/close/reopen the app and verify the draft remains.
3. Verify the UI labels it as local/pending and does not claim server persistence.
4. Reconnect with the same valid account; verify exactly one server write per operation ID.
5. Simulate a lost response after server commit; retry must not create a duplicate.
6. Revoke the teacher's permission while offline; reconnect must reject the write and preserve it as a conflict.
7. Change a student's class/branch while offline; reconnect must not write against stale scope.
8. Edit the same memorization record on two devices; the second sync must show a conflict rather than overwrite.
9. Switch accounts on one device; no cached data from the prior account may appear.
10. Verify existing online workflows and RLS behavior remain unchanged.

## Explicit non-goals for the first release

- First-time sign-in without internet.
- Password reset, invitations, email, push notifications, billing, or admin actions while offline.
- Offline access from a device that has never successfully loaded the required authorized data.
- Guaranteed background synchronization after the browser is closed.
- Storing the complete school database on every device.

## Release gate

No production deployment until the local persistence, server-side idempotency, permission revalidation, conflict handling, and end-to-end offline/online tests pass. The first usable release should be limited to teacher attendance; memorization follows as a separate increment.
