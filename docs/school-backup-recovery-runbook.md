# QuranOS school backup and recovery runbook

## Purpose

This runbook defines the safe recovery contract for a single QuranOS school tenant. It is intentionally conservative: a backup may be created and inspected, but a destructive restore must remain disabled until the restore implementation passes a full rehearsal on the isolated test project.

## Backup format v1

A v1 package is JSON with:

- `format = quranos-school-backup`
- `formatVersion = 1`
- `snapshotId`
- `generatedAt`
- the school record
- tenant-scoped operational tables
- referenced safe profile fields
- referenced permission catalogue rows
- document metadata and object paths
- an exclusions declaration

The generator records a SHA-256 checksum, byte size, per-table record counts, school id, actor, and audit events in `school_backup_snapshots` / `school_backup_events`.

## Isolation rules

Every operational table in the export allowlist is read with an explicit `school_id = target school` filter. The caller must be authenticated and hold `backup.create` for that exact school. Backup metadata is readable only through RLS and `backup.view` for the exact school.

A restore candidate is rejected when:

- its school id differs from the active school;
- any operational row contains another `school_id`;
- an expected table is missing;
- an unexpected table is present;
- a profile is not referenced by this school's membership/teacher/guardian/employee rows;
- a permission catalogue row is not referenced by this school's role permissions;
- a forbidden credential/secret field is present;
- the package format or version is unsupported;
- a registered snapshot checksum does not match the selected file.

## Data intentionally excluded

The portable school backup does **not** export or restore:

- `auth.users`;
- passwords or password hashes;
- access/refresh/recovery tokens;
- platform service keys or private keys;
- teacher invitation tokens;
- guardian invitation tokens;
- guardian push subscription authentication material;
- platform secrets.

Authentication identities are a separate platform-security domain and must not be copied into a portable tenant backup.

## Documents in format v1

Format v1 includes document database metadata and storage object paths, but does not embed the binary document files in the JSON package. A candidate containing document paths receives a warning during dry-run validation.

Do not declare disaster recovery complete for document files until an off-site object-copy stage has been enabled and rehearsed.

## Manual backup flow

1. School administrator opens `/backups`.
2. Administrator requests a backup.
3. Server authenticates the caller and checks `backup.create` for the active school.
4. Server exports only the school allowlist and computes SHA-256.
5. If private off-site R2 storage is configured, the same serialized package is written there server-side.
6. The JSON package is returned to the administrator for local download.
7. Snapshot metadata and audit events record the result.

## Off-site R2 configuration

Credentials must exist only as server-side Edge Function secrets. Never place them in GitHub, Vite variables, browser code, logs, screenshots, or chat.

Expected secret names:

- `QURANOS_BACKUP_R2_ENDPOINT`
- `QURANOS_BACKUP_R2_BUCKET`
- `QURANOS_BACKUP_R2_ACCESS_KEY_ID`
- `QURANOS_BACKUP_R2_SECRET_ACCESS_KEY`
- optional `QURANOS_BACKUP_R2_PREFIX`

The implementation accepts only HTTPS endpoints ending in `.r2.cloudflarestorage.com` and writes objects under a tenant path containing the school id and snapshot id.

Use a private bucket and a credential scoped only to the backup bucket and required object operations.

## Read-only pre-restore dry-run

The current UI allows an administrator to choose a JSON backup file and run a **read-only** inspection. The browser:

1. enforces a bounded file size;
2. parses the JSON;
3. checks format/version/snapshot metadata;
4. validates exact tenant isolation and the table allowlist;
5. scans recursively for forbidden secret fields;
6. validates profile and permission scope;
7. computes SHA-256;
8. reads the matching snapshot metadata for the same school and compares checksums when available.

The dry-run code must never insert, update, delete, upsert, or call a restore RPC.

## Restore remains locked

Do not implement or enable a destructive restore on Production until all of these gates are satisfied:

1. latest Production backup taken and verified;
2. candidate passes structural tenant validation;
3. candidate checksum matches its registered snapshot for the same school;
4. a pre-restore backup of the current school state is created;
5. restore is rehearsed on the isolated hosted test project;
6. row counts and critical financial/academic invariants are compared before and after rehearsal;
7. cross-tenant negative tests prove School A cannot restore School B;
8. document binary recovery is separately verified when document off-site copying is enabled;
9. authentication identities remain untouched;
10. explicit release approval is given before Production execution.

## Current rollout state

- Migration 066: rehearsed on the isolated Supabase test project only.
- Manual backup Edge Function: test-project deployment exists for the pre-R2 version.
- R2-capable code: present on the feature branch; not yet released to Production.
- Production migration/deployment: not performed.
- Destructive restore: not implemented and intentionally locked.
