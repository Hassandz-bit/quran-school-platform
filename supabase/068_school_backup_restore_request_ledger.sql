-- QuranOS V2 - backup storage semantics and safe restore request ledger
-- No destructive restore is enabled by this migration.

begin;

alter table public.school_backup_snapshots
  drop constraint if exists school_backup_snapshots_storage_backend_check;

alter table public.school_backup_snapshots
  add constraint school_backup_snapshots_storage_backend_check
  check (storage_backend in ('supabase_storage', 'external_object_storage', 'temporary_download'));

create table public.school_backup_restore_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  snapshot_id uuid not null references public.school_backup_snapshots(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'dry_run_ready',
  pre_restore_snapshot_id uuid references public.school_backup_snapshots(id) on delete set null,
  validation_report jsonb not null default '{}'::jsonb,
  conflict_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  constraint school_backup_restore_requests_status_check
    check (status in ('dry_run_ready', 'approved', 'running', 'completed', 'failed', 'cancelled'))
);

comment on table public.school_backup_restore_requests is
  'Tenant-scoped restore request ledger. Dry-run requests never mutate school operational data; destructive execution is a separate gated stage.';

create index school_backup_restore_requests_school_created_idx
  on public.school_backup_restore_requests (school_id, created_at desc);

create index school_backup_restore_requests_snapshot_idx
  on public.school_backup_restore_requests (snapshot_id, created_at desc);

alter table public.school_backup_restore_requests enable row level security;
revoke all on public.school_backup_restore_requests from public, anon, authenticated;
grant select on public.school_backup_restore_requests to authenticated;

create policy school_backup_restore_requests_admin_read
on public.school_backup_restore_requests
for select
to authenticated
using (
  public.has_school_permission(school_id, 'backup.view')
);

grant select, insert, update on table public.school_backup_restore_requests to service_role;

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
