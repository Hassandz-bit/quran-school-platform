-- Quran School SaaS - allow finance managers to read payment records
-- finance.manage already authorizes payment inserts and reversals in migration 007.
-- This policy makes that permission independently sufficient for the read side too.

begin;

create policy payments_select_manage_authorized
on public.payments
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

commit;
