-- Retire the customer-facing demo-data feature without deleting existing demo records.
-- Keep the seed tables and guarded cleanup RPC so legacy demo batches can still be
-- removed safely by an authorized school administrator.

begin;

revoke all on function public.get_school_demo_status(uuid)
  from public, anon, authenticated;
revoke all on function public.create_school_demo_data(uuid)
  from public, anon, authenticated;

comment on function public.get_school_demo_status(uuid) is
  'Retired by migration 072. Demo-mode status is no longer exposed to application users.';
comment on function public.create_school_demo_data(uuid) is
  'Retired by migration 072. Demo-data creation is no longer an application capability.';

-- Preserve the least-privilege cleanup wrapper introduced by migration 071.
grant execute on function public.clear_school_demo_data(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
