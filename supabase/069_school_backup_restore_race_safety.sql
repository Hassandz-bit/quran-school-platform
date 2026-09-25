-- QuranOS V2 - restore request race-safety and audit event hardening
-- No destructive restore is enabled by this migration.

begin;

alter table public.school_backup_events
  drop constraint if exists school_backup_events_type_check;

alter table public.school_backup_events
  add constraint school_backup_events_type_check
  check (event_type in (
    'requested',
    'generation_started',
    'generated',
    'generation_failed',
    'downloaded',
    'verification_failed',
    'expired',
    'restore_dry_run',
    'restore_requested',
    'restore_started',
    'restore_completed',
    'restore_failed'
  ));

create unique index school_backup_restore_requests_active_unique_idx
  on public.school_backup_restore_requests (school_id, snapshot_id)
  where status in ('dry_run_ready', 'approved', 'running');

comment on index public.school_backup_restore_requests_active_unique_idx is
  'Prevents duplicate active restore requests for the same school snapshot; terminal requests may be created again after a new safety review.';

commit;
