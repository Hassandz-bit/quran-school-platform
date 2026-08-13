-- QuranOS V2 - make Finance > Payroll the only browser path for staff jobs
-- V2 only. Production remains unchanged until the release gate is approved.

begin;

-- Migration 056 exposed school-wide staff RPCs before job management moved to
-- payroll. Keep the functions for database compatibility, but close them to
-- browser roles so employment jobs can only be managed through the
-- payroll-scoped RPCs introduced by Migration 057.
revoke all on function public.list_school_staff(uuid)
  from public, anon, authenticated;
revoke all on function public.upsert_staff_position(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.deactivate_staff_position(uuid, uuid)
  from public, anon, authenticated;

commit;
