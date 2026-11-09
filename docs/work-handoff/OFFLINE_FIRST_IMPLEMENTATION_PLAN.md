# QuranOS Offline-First — implementation plan

## Goal

Allow an already-authenticated teacher to continue essential classroom work during a temporary network outage, persist drafts on that device, and synchronize them safely after connectivity returns. This is a staged implementation plan, not a claim that offline writes are already enabled.

## Current branch implementation status (not production)

The following incremental implementation is present on `feat/offline-first-foundation` and has a successful Vercel preview build, but it is not merged or deployed to production:

- Vite emits `asset-manifest.json`; the service worker precaches same-origin lazy JavaScript/CSS chunks plus fonts and SVG icons, while leaving large documents on-demand.
- Attendance scope and server-returned rosters are stored in IndexedDB, partitioned by user, school, branch, class, and session date.
- A `/offline` hub can open from a previously persisted local Supabase session after a cold offline launch. It is read-only and displays cached attendance plus a matching pending draft when available.
- Attendance drafts track `pending`, `syncing`, `conflict`, and `failed`. The operation UUID is persisted before the RPC; if durable local storage is unavailable, the client refuses to send a non-idempotent write.
- On reconnect, an interrupted operation is replayed with the same UUID before comparing roster versions, so a lost response after a successful server commit is confirmed without duplicating records. New/uncommitted drafts sync only when the cached roster/version matches; the server RPC remains the authority for permission and roster checks.
- Pending drafts are preserved across sign-out and account switching; data remains partitioned by user ID so another account does not see it. Device-local storage is not encrypted.
- Auth initialization now settles cleanly when authorization lookup fails offline, without inventing or restoring cached server permissions.

**Not complete:** this is not yet full-platform offline support. Student, class, teacher, memorization, finance, documents, parent, notification, and other modules still depend on live server requests. The offline hub exposes attendance snapshots only. Reconnect synchronization is attempted while the app is open; background sync while the browser is closed is not implemented, and there is no complete offline write queue across modules.

**Release blockers:** migration 084 / `save_attendance_batch` has not been validated against a disposable PostgreSQL/Supabase database or applied to production; browser-level cold-install/restart/reconnect/conflict tests are still required. Do not merge, apply migration 084 to production, or promote the preview until those gates pass.

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

The transactional server contract is present in draft migration 084, but has not yet been integration-tested. IndexedDB stores user-scoped attendance snapshots and drafts; the offline hub supports a cached cold-start, and reconnect attempts synchronization while the app is open. Browser acceptance and disposable-database tests remain mandatory before production. Credentials must never be cached.

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
- [ ] Production release gate passed.

### Transactional RPC implementation notes

The RPC caps each batch at 200 students, validates the payload and active roster, re-checks the authenticated caller's `attendance.manage` access for the exact class, and applies the batch inside one PostgreSQL transaction. It locks matched active student rows in deterministic ID order before validating roster membership, preventing concurrent class/branch/status changes from racing the write. The idempotency result is checked before re-validating the roster on retries, so a committed operation can still be acknowledged if a student's roster membership changed after the original commit. The operation ledger is inaccessible directly to browser roles; the authenticated RPC is the only client entry point.

The browser persists a stable operation UUID and the exact request-payload snapshot alongside the local draft when a save is prepared. An unchanged retry reuses that UUID; if the draft changes, the UUID is rotated before the next server attempt. Existing records carry their fetched `updated_at` snapshot into the RPC; the server compares it while holding the record lock and rejects stale edits. Local drafts are persisted, but automatic offline synchronization is **not yet implemented**.

This audit is a technical refinement of the plan only; it does not change production data or enable offline attendance yet.
