-- Reconciles the migration already applied to the production Supabase database.
-- Production migration history version: 20261027210942
-- Verified live constraint: FOREIGN KEY (attendance_record_id)
-- REFERENCES public.attendance_records(id) ON DELETE CASCADE.
-- This file records the existing production schema change; do not re-apply it
-- to the production database as a new migration.

alter table public.guardian_notification_events
  drop constraint if exists guardian_notification_events_record_fk;

alter table public.guardian_notification_events
  add constraint guardian_notification_events_record_fk
  foreign key (attendance_record_id)
  references public.attendance_records(id)
  on delete cascade;
