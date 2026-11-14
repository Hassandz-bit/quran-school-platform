# QuranOS Offline-First — implementation plan

## Goal

Allow an already-authenticated teacher to continue essential classroom work during a temporary network outage, persist drafts on that device, and synchronize them safely after connectivity returns. This staged plan tracks the implemented teacher workflows and the remaining offline-safety work.

## Production implementation status (2026-11-14)

The first teacher-focused offline release is merged and deployed to production:

- PR #136 — attendance offline foundation, merge commit `83d38439dd5ee522317329124e80a25523a3bd5e`. Migration 084 was applied to production before merge.
- PR #138 — teacher portal offline workflows, merge commit `7039574653ff928e864c5413de94fff2eaf1c726`. Vercel production deployment `dpl_6LVUcw2u1LFQrwRHjkuRxHsNhErJ` reached READY.
- Attendance supports user-scoped local rosters/drafts, durable operation IDs, server-side transactional idempotency, and foreground reconnect synchronization.
- Memorization supports preloaded teacher workspaces and recent records, local individual/group drafts, stable IDs, and foreground synchronization with server-side permission checks.

**This is not full-platform offline support.** Student/class/teacher administration, finance, documents, guardian/parent, notifications, and other modules still require a live connection.

**Outstanding verification and limitations:**
- Manual browser acceptance for offline cold start, browser restart, draft persistence, reconnect, lost-response replay, and permission/roster conflicts has not been completed.
- First-time preparation requires internet and must be repeated on each device/browser profile.
- IndexedDB data is not encrypted; use a trusted, access-controlled device.
- Synchronization is foreground-based; guaranteed background sync after the browser is closed is not implemented.
- Editing an existing memorization record while offline is not supported.
- Group memorization entries synchronize per student, not as one atomic batch.


## Current production baseline (verified on main)

- The app is installable as a PWA and the service worker caches the app shell and same-origin static assets.
- After a teacher has prepared the device online, the teacher portal can use cached attendance and memorization workspaces while offline.
- Attendance and new memorization entries can be saved as device-local drafts and synchronized when the relevant module is open after connectivity returns.
- Server-side permission, active-roster, teacher-assignment, idempotency, and conflict checks remain authoritative at synchronization time.
- The service worker intentionally ignores non-GET requests and does not intercept Supabase/Auth writes.
- Offline support is limited to the teacher attendance and memorization workflows; the rest of the platform remains online-only.


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
4. When the app is open and connectivity returns, attempt synchronization using the persisted operation UUID. The server RPC re-checks the current authenticated caller's `attendance.manage` permission and class/student membership.
5. Attendance server-side idempotency is implemented in draft migration 084; it remains gated on disposable-database integration tests before production use.
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

## Phase 1 code audit (2026-11-09)

The current attendance implementation was inspected before choosing a synchronization design:

- `client/src/lib/attendance.ts` fetches the authorized roster and existing session/records from Supabase. `saveAttendance()` re-checks `attendance.manage` and verifies that every submitted student is still active in the exact school/branch/class before writing.
- Attendance session uniqueness is enforced by `unique (class_id, session_date)`; record uniqueness is enforced by `unique (session_id, student_id)`.
- The current save path performs updates and inserts as separate client requests (parallel updates followed by inserts), not as one database transaction. A partial batch can therefore be committed before a later request fails.
- `attendance_records` has an audit trigger that appends history only when attendance values actually change. A retry with identical values is less likely to duplicate history, but this is not a sufficient server-side idempotency guarantee and does not protect against stale concurrent edits.
- The existing RLS and `can_access_attendance_class` checks are important security boundaries and must remain enforced for every sync request.
- The existing service worker caches the app shell/static assets only; it does not persist roster data or attendance drafts.

### Implementation decision

Do **not** connect an offline queue directly to the current multi-request `saveAttendance()` implementation. That would risk partial batch commits and stale-value overwrites.

Before automatic attendance sync is enabled, add a narrowly scoped, authenticated, transactional server operation with:

1. A client-generated operation UUID stored under a unique database constraint together with the authenticated user and tenant scope.
2. A request fingerprint/payload check so reusing an operation UUID with different content is rejected rather than treated as a successful replay.
3. A single database transaction that re-checks `auth.uid()`, active membership, `attendance.manage` for the exact class, current student membership, and expected server state before applying the batch.
4. A durable operation result returned on retries, so a lost HTTP response followed by retry cannot apply the same batch twice.
5. Explicit conflict responses for changed roster or changed attendance values; do not silently use last-write-wins.
6. Least-privilege execute grants and a pinned empty `search_path` if a privileged function is truly required; avoid broad `SECURITY DEFINER` access.

The transactional server contract was implemented in migration 084 and applied to production. Its concurrency/lost-response behavior has not yet been integration-tested against a disposable PostgreSQL database. IndexedDB stores user-scoped attendance snapshots and drafts; the offline hub supports a cached cold-start, and reconnect attempts synchronization while the app is open. Browser acceptance and disposable-database tests remain mandatory before production. Credentials must never be cached.

### Current implementation status

- [x] PWA shell/static caching verified.
- [x] Attendance permission and roster revalidation path reviewed.
- [x] Existing uniqueness constraints and audit trigger reviewed.
- [x] Partial-write and stale-update risk identified.
- [x] Transactional attendance batch RPC added in `supabase/084_attendance_transactional_sync.sql`.
- [x] Actor-scoped idempotency ledger stores the exact request and committed result; replay with the same UUID returns the prior result, while reusing the UUID with a different payload is rejected.
- [x] Existing online attendance save path now calls the transactional RPC instead of issuing separate update/insert requests.
- [x] Static migration/client contract tests added in `tests/attendance-sync-migration.test.mjs`.
- [x] User- and school-scoped IndexedDB attendance draft store implemented in `client/src/lib/attendance-offline.ts`; records are further keyed by branch, class, and date. No auth credentials or tokens are stored.
- [x] A stable operation UUID and exact submitted-payload snapshot are persisted for an explicit server save. Retrying an unchanged draft reuses its UUID; editing the draft rotates the UUID so the server never sees one key reused with different content.
- [x] Attendance edits are persisted locally while the page has an authorized server-loaded roster. If a save fails while offline, the page confirms only local persistence and explicitly says the server has not been updated.
- [x] A local draft is restored only when the server roster and each record's `recordId`/`updated_at` snapshot still match. A stale draft is retained and is not silently merged.
- [x] Offline shell cold-start and read-only attendance hub: a previously persisted local session can open `/offline`, showing cached scope/roster and local drafts. Editable attendance cold-start still requires browser acceptance testing.
- [x] Reconnect sync attempt is wired while the app is open: returning online from the offline hub routes to attendance and attempts the persisted operation. Background sync while the browser is closed is not implemented; server permission and roster checks remain authoritative.
- [ ] Database migration 084 executed against a disposable test database; transactional concurrency/lost-response integration behavior remains unverified.
- [x] Vercel preview build for commit `d086652b313c72002bbfaaff91536e24a28cec07` completed successfully: 516 Node tests, 16 memorization database tests, 66 Vitest runtime tests, TypeScript `tsc --noEmit`, Vite build, and `git diff --check` all completed in the successful `pnpm run build` pipeline.
- [ ] GitHub Actions validation remains blocked: latest PR jobs terminated before runner allocation (`runner_id: 0`, no runner name, no steps). No database integration commands ran; this is not a test pass.
- [x] PR #136 and PR #138 merged and deployed to production.\n- [ ] Manual browser acceptance for cold offline launch, reload/restart persistence, reconnect, replay, and permission/roster conflict handling.

### Transactional RPC implementation notes

The RPC caps each batch at 200 students, validates the payload and active roster, re-checks the authenticated caller's `attendance.manage` access for the exact class, and applies the batch inside one PostgreSQL transaction. It locks matched active student rows in deterministic ID order before validating roster membership, preventing concurrent class/branch/status changes from racing the write. The idempotency result is checked before re-validating the roster on retries, so a committed operation can still be acknowledged if a student's roster membership changed after the original commit. The operation ledger is inaccessible directly to browser roles; the authenticated RPC is the only client entry point.

The browser persists a stable operation UUID and the exact request-payload snapshot alongside the local draft when a save is prepared. An unchanged retry reuses that UUID; if the draft changes, the UUID is rotated before the next server attempt. Existing records carry their fetched `updated_at` snapshot into the RPC; the server compares it while holding the record lock and rejects stale edits. Foreground reconnect synchronization is implemented for attendance and teacher memorization drafts; guaranteed background synchronization while the browser is closed is not implemented.

This audit predates the production rollout. The current production state and remaining acceptance work are summarized at the top of this document.


## Teacher portal offline expansion (2026-11-10)

The dedicated teacher workflow was merged through PR #138 and deployed to production in commit `7039574653ff928e864c5413de94fff2eaf1c726`. This scope is intentionally limited to the teacher portal.

### Implemented in PR #138 and deployed

- Last successfully verified school context is stored in a separate IndexedDB store partitioned by Supabase user ID. It is restored only when the same authenticated user has a local Supabase session and the authorization request fails due to connectivity. Passwords and access/refresh tokens are not copied into this store.
- The teacher portal has a `Prepare for offline use` action. While online, it downloads only classes whose last-verified scope has `canManage`, attendance rosters for the current local date, memorization class workspaces, and the latest 20 memorization records for each student.
- Memorization workspace, student records, and pending drafts are partitioned by user, school, branch, class, and (for drafts) date/student.
- New individual memorization entries are saved locally before network submission. A stable UUID is stored with the draft and supplied as the database row ID. If the server committed but the response was lost, a retry reads the row by that UUID and treats it as successful only if the tenant, class, student, teacher, and submitted values match exactly.
- Memorization drafts distinguish locally saved but not yet submitted work (`draft`) from queued work (`pending`/`syncing`). Only an explicit Save action queues an individual entry for synchronization; group submission queues one stable operation per selected student.
- Multiple individual entries per student/date are supported with separate draft IDs; group batches use a separate namespace so they cannot overwrite individual drafts.
- Pending new memorization entries are restored after reopening the page and synchronized when the browser is online and the memorization page is open. The offline hub routes to attendance first when attendance is pending, otherwise to memorization when queued memorization work is pending. Server permission, active-student, and assigned-teacher checks still run on every save.
- Attendance remains backed by migration 084's transactional idempotent RPC and the existing durable IndexedDB queue.

### Explicit limits

- The first preparation must be done online on each device/browser profile. Another device does not share the local cache.
- Offline memorization supports new individual entries and group entries. Group drafts are stored separately per student and synchronized as independent idempotent records; they are not an all-or-nothing batch when synchronized offline. Editing an existing record remains online-only to avoid overwriting a newer server version.
- Attendance and memorization caches are not encrypted by this feature. Use only a trusted, access-controlled device.
- Sync is foreground-based: the relevant page must be open when connectivity returns. Guaranteed background sync after the browser is closed is not implemented.
- Offline authorization data is a last-verified local context for rendering cached teacher work, not proof of current permission. All writes are revalidated on the server.
- No new database migration is required for memorization replay: the existing memorization row UUID is used as the stable idempotency key. No production schema changes are part of PR #138.

### Release gate

- Vercel preview build and the repository build pipeline must pass.
- Browser acceptance must verify: online preparation; offline cold start after a prior login; attendance edit/reload; individual memorization draft/reload; reconnect sync; lost-response replay without duplicates; and rejection/preservation when teacher permissions or class membership have changed.
- PR #138 is merged and deployed. The remaining acceptance gate is manual browser testing of offline cold start, reload/restart persistence, reconnect replay, and permission/roster conflict handling. Do not describe these manual checks as passed until executed.
