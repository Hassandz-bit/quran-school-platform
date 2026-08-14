-- QuranOS V2 - school-level backup and recovery metadata foundation
-- Feature branch only. Do not apply to Production before rehearsal and release approval.

begin;

insert into public.permissions (code, module, name_ar, description)
values
  ('backup.view', 'backup', 'عرض النسخ الاحتياطية', 'عرض حالة النسخ الاحتياطية الخاصة بالمدرسة'),
  ('backup.create', 'backup', 'إنشاء نسخة احتياطية', 'طلب إنشاء نسخة احتياطية جديدة للمدرسة'),
  ('backup.download', 'backup', 'تنزيل نسخة احتياطية', 'تنزيل نسخة احتياطية جاهزة إلى جهاز المدير'),
  ('backup.restore_request', 'backup', 'طلب استرجاع نسخة احتياطية', 'إنشاء طلب استرجاع آمن بعد الفحص المسبق')
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description,
    updated_at = timezone('utc', now());

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'backup.view'),
    ('school_admin', 'backup.create'),
    ('school_admin', 'backup.download'),
    ('school_admin', 'backup.restore_request')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants
join public.roles as role
  on role.code = grants.role_code
 and role.status = 'active'
join public.permissions as permission
  on permission.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

create table public.school_backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  backup_kind text not null,
  status text not null default 'queued',
  format_version integer not null default 1,
  storage_backend text not null default 'external_object_storage',
  storage_key text,
  checksum_sha256 text,
  byte_size bigint,
  record_counts jsonb not null default '{}'::jsonb,
  includes_documents boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  failure_code text,
  constraint school_backup_snapshots_kind_check
    check (backup_kind in ('manual', 'scheduled', 'pre_restore')),
  constraint school_backup_snapshots_status_check
    check (status in ('queued', 'generating', 'ready', 'failed', 'expired')),
  constraint school_backup_snapshots_format_version_check
    check (format_version > 0),
  constraint school_backup_snapshots_storage_backend_check
    check (storage_backend in ('external_object_storage', 'temporary_download')),
  constraint school_backup_snapshots_checksum_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint school_backup_snapshots_byte_size_check
    check (byte_size is null or byte_size >= 0),
  constraint school_backup_snapshots_ready_metadata_check
    check (
      status <> 'ready'
      or (
        storage_key is not null
        and checksum_sha256 is not null
        and byte_size is not null
        and completed_at is not null
      )
    )
);

comment on table public.school_backup_snapshots is
  'Tenant-scoped metadata for portable school backups. Backup contents and secrets are never stored in this table.';

create index school_backup_snapshots_school_created_idx
  on public.school_backup_snapshots (school_id, created_at desc);
create index school_backup_snapshots_school_status_idx
  on public.school_backup_snapshots (school_id, status, created_at desc);

alter table public.school_backup_snapshots enable row level security;
revoke all on public.school_backup_snapshots from public, anon, authenticated;
grant select on public.school_backup_snapshots to authenticated;

create policy school_backup_snapshots_admin_read
on public.school_backup_snapshots
for select
to authenticated
using (
  public.has_school_permission(school_id, 'backup.view')
);

create table public.school_backup_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  snapshot_id uuid references public.school_backup_snapshots(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint school_backup_events_type_check
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
      'restore_completed',
      'restore_failed'
    ))
);

comment on table public.school_backup_events is
  'Append-only audit trail for school backup and recovery actions.';

create index school_backup_events_school_created_idx
  on public.school_backup_events (school_id, created_at desc);
create index school_backup_events_snapshot_created_idx
  on public.school_backup_events (snapshot_id, created_at desc)
  where snapshot_id is not null;

alter table public.school_backup_events enable row level security;
revoke all on public.school_backup_events from public, anon, authenticated;
grant select on public.school_backup_events to authenticated;

create policy school_backup_events_admin_read
on public.school_backup_events
for select
to authenticated
using (
  public.has_school_permission(school_id, 'backup.view')
);

-- The backup Edge Function authenticates the caller with the user's JWT first,
-- then uses a server-only Supabase secret to export the already-authorized school.
-- This project intentionally revokes broad Data API privileges, so the server
-- role needs an explicit, least-privilege allowlist for the backup path.
grant usage on schema public to service_role;

grant select on table
  public.schools,
  public.branches,
  public.school_memberships,
  public.roles,
  public.role_permissions,
  public.membership_roles,
  public.classes,
  public.students,
  public.teachers,
  public.class_teachers,
  public.fee_plans,
  public.student_charges,
  public.payments,
  public.student_discounts,
  public.expenses,
  public.attendance_sessions,
  public.attendance_records,
  public.attendance_record_history,
  public.memorization_records,
  public.memorization_record_history,
  public.student_guardians,
  public.guardian_access_events,
  public.app_notifications,
  public.official_receipt_counters,
  public.official_receipts,
  public.registration_leads,
  public.registration_lead_events,
  public.document_records,
  public.document_events,
  public.memorization_follow_up_notes,
  public.memorization_follow_up_note_history,
  public.payroll_compensation_profiles,
  public.payroll_periods,
  public.payroll_entries,
  public.payroll_payments,
  public.payroll_audit_events,
  public.treasury_accounts,
  public.other_income,
  public.treasury_transfers,
  public.treasury_movements,
  public.treasury_audit_events,
  public.financial_periods,
  public.financial_period_events,
  public.treasury_account_reconciliations,
  public.staff_positions,
  public.notification_campaigns,
  public.employees,
  public.profiles,
  public.permissions
  to service_role;

grant select, insert, update on table public.school_backup_snapshots to service_role;
grant insert on table public.school_backup_events to service_role;

commit;
