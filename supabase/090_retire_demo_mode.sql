-- Retire the customer-facing demo-data feature without deleting legacy records.
-- Existing demo tracking tables and cleanup RPC are intentionally preserved.
-- Migration 071/072 were not merged because their cleanup rewrite requires
-- PostgreSQL integration verification; this narrow migration only disables
-- creation and status access for application roles.

begin;

revoke all on function public.get_school_demo_status(uuid)
  from public, anon, authenticated;
revoke all on function public.create_school_demo_data(uuid)
  from public, anon, authenticated;

comment on function public.get_school_demo_status(uuid) is
  'Retired by migration 090. Demo-mode status is no longer exposed to application users.';
comment on function public.create_school_demo_data(uuid) is
  'Retired by migration 090. Demo-data creation is no longer an application capability.';

notify pgrst, 'reload schema';
commit;
