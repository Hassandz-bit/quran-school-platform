# QuranOS school backup and recovery runbook

## Current safe scope

The current feature provides a school-admin manual JSON backup and a read-only pre-restore Dry-Run. Destructive restore, scheduled backups, external object storage, and embedded document binaries are intentionally not enabled in this release.

## Backup contract

A backup is bound to one `school_id` and one `snapshotId`. Every operational table in the export allowlist is queried with the target `school_id`. The package contains the school record, tenant-scoped operational rows, referenced safe profile fields, referenced permission catalogue rows, document metadata/object paths, generation time, and format version.

The generator excludes authentication identities, passwords, authentication tokens, invitation tokens, push authentication material, and platform secrets. It records SHA-256, byte size, per-table counts, actor, and audit metadata.

## Dry-Run contract

The pre-restore check is read-only. It validates format/version, snapshot id, school id, the exact table allowlist, row tenant ids, referenced profile/permission scope, forbidden secret fields, file size, and SHA-256 against the registered snapshot when available. It must never insert, update, delete, upsert, or invoke a restore operation.

## Documents

Format v1 includes document database metadata and object paths but not document binary contents. Full document disaster recovery remains a later stage.

## Restore preparation gate

The non-destructive preparation endpoint is now implemented at `prepare-school-restore`. It requires `backup.restore_request`, verifies that the requested snapshot belongs to the caller's school, downloads the private object, recalculates SHA-256, validates the portable package against the school tenant, and compares row counts with the current school state. It then creates a fresh `pre_restore` backup through the same authorized generator and records a restore request plus audit events. It does **not** modify operational school data.

The preparation result is a dry-run only. Count differences are reported as conflicts; they do not authorize or execute a restore.

## Restore gate

Do not enable destructive restore on Production until a candidate passes tenant and checksum validation, a pre-restore backup is created, restoration is rehearsed on the isolated test project, academic/financial invariants and row counts are verified, cross-tenant negative tests pass, document recovery is verified separately, and authentication identities remain untouched.

## Off-site and scheduled backup gate

External object storage is a separate stage. It must be connected and rehearsed independently before scheduled backups are enabled. The manual backup generator must not depend on an untested off-site adapter.

## Rollout state

- Migration 066: rehearsed on the isolated Supabase test project only.
- Manual backup Edge Function: test-project deployment exists; the branch is being aligned to the rehearsable manual-only path.
- Dry-Run UI and tenant-safety tests: implemented on the feature branch.
- External object storage: deferred to a separate tested stage.
- Production migration or backup-function deployment: not performed.
- Destructive restore: not implemented and intentionally locked.
