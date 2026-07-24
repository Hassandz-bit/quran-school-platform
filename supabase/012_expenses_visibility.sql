-- Quran School SaaS - isolate expense visibility behind finance.expenses
-- Expense reads and writes use the same dedicated permission. School-wide
-- rows require school scope; branch rows require permission on that branch.

begin;

drop policy if exists expenses_select_authorized on public.expenses;

create policy expenses_select_authorized
on public.expenses
for select to authenticated
using (
  (
    branch_id is null
    and public.has_school_permission(school_id, 'finance.expenses')
  )
  or
  (
    branch_id is not null
    and public.has_branch_permission(
      school_id,
      branch_id,
      'finance.expenses'
    )
  )
);

commit;
