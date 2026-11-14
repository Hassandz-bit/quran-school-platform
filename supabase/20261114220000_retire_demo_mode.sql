-- Retire the customer-facing demo-data feature without deleting legacy records.
-- Existing demo tracking tables and cleanup RPC are intentionally preserved.
-- The earlier cleanup rewrite was excluded because it requires PostgreSQL
-- integration verification; this migration only disables creation and status
-- access for application roles.

begin;

revoke all on function public.get_school_demo_status(uuid)
  from public, anon, authenticated;
revoke all on function public.create_school_demo_data(uuid)
  from public, anon, authenticated;

comment on function public.get_school_demo_status(uuid) is
  'Retired by migration 20261114220000. Demo-mode status is no longer exposed to application users.';
comment on function public.create_school_demo_data(uuid) is
  'Retired by migration 20261114220000. Demo-data creation is no longer an application capability.';

notify pgrst, 'reload schema';
commit;
