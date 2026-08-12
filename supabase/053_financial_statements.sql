-- QuranOS V2 - derived financial statements
-- V2 review migration only. Do not apply to Production manually.

begin;

create or replace function public.financial_statement_row_visible(
  target_school_id uuid,
  row_branch_id uuid,
  target_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_branch_id is not null then
      row_branch_id = target_branch_id and (
        public.has_school_permission(target_school_id, 'finance.view')
        or public.has_school_permission(target_school_id, 'finance.manage')
        or public.has_branch_permission(target_school_id, target_branch_id, 'finance.view')
        or public.has_branch_permission(target_school_id, target_branch_id, 'finance.manage')
      )
    when row_branch_id is null then
      public.has_school_permission(target_school_id, 'finance.view')
      or public.has_school_permission(target_school_id, 'finance.manage')
    else
      public.has_school_permission(target_school_id, 'finance.view')
      or public.has_school_permission(target_school_id, 'finance.manage')
      or public.has_branch_permission(target_school_id, row_branch_id, 'finance.view')
      or public.has_branch_permission(target_school_id, row_branch_id, 'finance.manage')
  end;
$$;

create or replace function public.get_financial_statement(
  target_school_id uuid,
  target_period_month date,
  target_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  period_start date := date_trunc('month', target_period_month)::date;
  period_end date := (date_trunc('month', target_period_month) + interval '1 month - 1 day')::date;
  has_scope boolean;
  scope_complete boolean;
  accruals numeric := 0; outstanding numeric := 0; overdue numeric := 0; collections numeric := 0;
  other_income_total numeric := 0; expenses_total numeric := 0; payroll_accrued numeric := 0; payroll_paid numeric := 0; payroll_unpaid numeric := 0;
  treasury_opening numeric := 0; treasury_closing numeric := 0; cash_inflows numeric := 0; cash_outflows numeric := 0; opening_entries numeric := 0;
  manual_deposits numeric := 0; manual_withdrawals numeric := 0; internal_transfers numeric := 0;
  branch_breakdown jsonb; category_breakdown jsonb; account_breakdown jsonb; period_status text;
begin
  if (select auth.uid()) is null then raise exception using errcode='42501', message='FINANCIAL_STATEMENT_AUTH_REQUIRED'; end if;
  if target_period_month is null or target_period_month <> period_start then raise exception using errcode='22023', message='FINANCIAL_STATEMENT_MONTH_INVALID'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches b where b.school_id=target_school_id and b.id=target_branch_id) then raise exception using errcode='22023', message='FINANCIAL_STATEMENT_BRANCH_INVALID'; end if;
  has_scope := case when target_branch_id is not null then public.financial_statement_row_visible(target_school_id,target_branch_id,target_branch_id) else
    public.has_school_permission(target_school_id,'finance.view') or public.has_school_permission(target_school_id,'finance.manage') or exists (
      select 1 from public.branches b where b.school_id=target_school_id and public.financial_statement_row_visible(target_school_id,b.id,null)) end;
  if not has_scope then raise exception using errcode='42501', message='FINANCIAL_STATEMENT_VIEW_REQUIRED'; end if;
  scope_complete := public.has_school_permission(target_school_id,'finance.view') or public.has_school_permission(target_school_id,'finance.manage');

  with charge_balances as (
    select c.*,
      greatest(c.net_amount - coalesce((select sum(p.amount) from public.payments p where p.school_id=c.school_id and p.charge_id=c.id and p.status='completed' and p.payment_date <= period_end),0),0)::numeric(14,2) remaining
    from public.student_charges c
    where c.school_id=target_school_id and c.due_date <= period_end and c.status not in ('waived','cancelled')
      and public.financial_statement_row_visible(target_school_id,c.branch_id,target_branch_id)
  )
  select
    coalesce(sum(net_amount) filter (where due_date between period_start and period_end),0),
    coalesce(sum(remaining),0),
    coalesce(sum(remaining) filter (where due_date < period_end),0)
  into accruals,outstanding,overdue from charge_balances;

  select coalesce(sum(p.amount),0) into collections from public.payments p
  where p.school_id=target_school_id and p.status='completed' and p.payment_date between period_start and period_end
    and public.financial_statement_row_visible(target_school_id,p.branch_id,target_branch_id);
  select coalesce(sum(i.amount),0) into other_income_total from public.other_income i
  where i.school_id=target_school_id and i.status='recorded' and i.income_date between period_start and period_end
    and public.financial_statement_row_visible(target_school_id,i.branch_id,target_branch_id);
  select coalesce(sum(e.amount),0) into expenses_total from public.expenses e
  where e.school_id=target_school_id and e.status='recorded' and e.expense_date between period_start and period_end
    and public.financial_statement_row_visible(target_school_id,e.branch_id,target_branch_id);

  select coalesce(sum(pe.net_amount),0), coalesce(sum(greatest(pe.net_amount - coalesce((
    select sum(ppay.amount) from public.payroll_payments ppay where ppay.school_id=pe.school_id and ppay.payroll_entry_id=pe.id and ppay.status='completed' and ppay.payment_date <= period_end
  ),0),0)),0)
  into payroll_accrued,payroll_unpaid
  from public.payroll_entries pe join public.payroll_periods pp on pp.school_id=pe.school_id and pp.id=pe.period_id
  where pe.school_id=target_school_id and pp.period_month=period_start and pe.status <> 'cancelled'
    and public.financial_statement_row_visible(target_school_id,pe.branch_id,target_branch_id);
  select coalesce(sum(ppay.amount),0) into payroll_paid from public.payroll_payments ppay
  where ppay.school_id=target_school_id and ppay.status='completed' and ppay.payment_date between period_start and period_end
    and public.financial_statement_row_visible(target_school_id,ppay.branch_id,target_branch_id);

  select
    coalesce(sum(case m.direction when 'in' then m.amount else -m.amount end) filter (where m.movement_date < period_start),0),
    coalesce(sum(case m.direction when 'in' then m.amount else -m.amount end) filter (where m.movement_date <= period_end),0),
    coalesce(sum(m.amount) filter (where m.movement_date between period_start and period_end and m.direction='in' and m.movement_type not in ('opening_balance','transfer_in')),0),
    coalesce(sum(m.amount) filter (where m.movement_date between period_start and period_end and m.direction='out' and m.movement_type not in ('opening_balance','transfer_out')),0),
    coalesce(sum(case m.direction when 'in' then m.amount else -m.amount end) filter (where m.movement_date between period_start and period_end and m.movement_type='opening_balance'),0),
    coalesce(sum(m.amount) filter (where m.movement_date between period_start and period_end and m.movement_type='manual_deposit'),0),
    coalesce(sum(m.amount) filter (where m.movement_date between period_start and period_end and m.movement_type='manual_withdrawal'),0),
    coalesce(sum(m.amount) filter (where m.movement_date between period_start and period_end and m.movement_type='transfer_out'),0)
  into treasury_opening,treasury_closing,cash_inflows,cash_outflows,opening_entries,manual_deposits,manual_withdrawals,internal_transfers
  from public.treasury_movements m join public.treasury_accounts a on a.school_id=m.school_id and a.id=m.account_id
  where m.school_id=target_school_id and m.status='posted'
    and public.financial_statement_row_visible(target_school_id,a.branch_id,target_branch_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'branch_id',b.id,'branch_name',b.name,
    'accruals',(select coalesce(sum(c.net_amount),0) from public.student_charges c where c.school_id=target_school_id and c.branch_id=b.id and c.status not in ('waived','cancelled') and c.due_date between period_start and period_end),
    'collections',(select coalesce(sum(p.amount),0) from public.payments p where p.school_id=target_school_id and p.branch_id=b.id and p.status='completed' and p.payment_date between period_start and period_end),
    'other_income',(select coalesce(sum(i.amount),0) from public.other_income i where i.school_id=target_school_id and i.branch_id=b.id and i.status='recorded' and i.income_date between period_start and period_end),
    'expenses',(select coalesce(sum(e.amount),0) from public.expenses e where e.school_id=target_school_id and e.branch_id=b.id and e.status='recorded' and e.expense_date between period_start and period_end),
    'payroll_accrued',(select coalesce(sum(pe.net_amount),0) from public.payroll_entries pe join public.payroll_periods pp on pp.school_id=pe.school_id and pp.id=pe.period_id where pe.school_id=target_school_id and pe.branch_id=b.id and pp.period_month=period_start and pe.status<>'cancelled'),
    'payroll_paid',(select coalesce(sum(py.amount),0) from public.payroll_payments py where py.school_id=target_school_id and py.branch_id=b.id and py.status='completed' and py.payment_date between period_start and period_end)
  ) order by b.name),'[]'::jsonb) into branch_breakdown
  from public.branches b where b.school_id=target_school_id and public.financial_statement_row_visible(target_school_id,b.id,target_branch_id);

  select jsonb_build_object(
    'charges',coalesce((select jsonb_agg(jsonb_build_object('category',x.charge_type,'amount',x.amount) order by x.charge_type) from (
      select c.charge_type,sum(c.net_amount)::numeric(14,2) amount from public.student_charges c where c.school_id=target_school_id and c.status not in ('waived','cancelled') and c.due_date between period_start and period_end and public.financial_statement_row_visible(target_school_id,c.branch_id,target_branch_id) group by c.charge_type) x),'[]'::jsonb),
    'other_income',coalesce((select jsonb_agg(jsonb_build_object('category',x.category,'amount',x.amount) order by x.category) from (
      select i.category,sum(i.amount)::numeric(14,2) amount from public.other_income i where i.school_id=target_school_id and i.status='recorded' and i.income_date between period_start and period_end and public.financial_statement_row_visible(target_school_id,i.branch_id,target_branch_id) group by i.category) x),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(jsonb_build_object('category',x.category,'amount',x.amount) order by x.category) from (
      select e.category,sum(e.amount)::numeric(14,2) amount from public.expenses e where e.school_id=target_school_id and e.status='recorded' and e.expense_date between period_start and period_end and public.financial_statement_row_visible(target_school_id,e.branch_id,target_branch_id) group by e.category) x),'[]'::jsonb)
  ) into category_breakdown;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',a.id,'account_name',a.name,'code',a.code,'account_type',a.account_type,'branch_id',a.branch_id,
    'opening_balance',public.financial_period_account_balance_as_of(target_school_id,a.id,period_start-1),
    'opening_entries',coalesce((select sum(case m.direction when 'in' then m.amount else -m.amount end) from public.treasury_movements m where m.account_id=a.id and m.status='posted' and m.movement_type='opening_balance' and m.movement_date between period_start and period_end),0),
    'inflows',coalesce((select sum(m.amount) from public.treasury_movements m where m.account_id=a.id and m.status='posted' and m.direction='in' and m.movement_type not in ('opening_balance','transfer_in') and m.movement_date between period_start and period_end),0),
    'outflows',coalesce((select sum(m.amount) from public.treasury_movements m where m.account_id=a.id and m.status='posted' and m.direction='out' and m.movement_type not in ('opening_balance','transfer_out') and m.movement_date between period_start and period_end),0),
    'transfers_in',coalesce((select sum(m.amount) from public.treasury_movements m where m.account_id=a.id and m.status='posted' and m.movement_type='transfer_in' and m.movement_date between period_start and period_end),0),
    'transfers_out',coalesce((select sum(m.amount) from public.treasury_movements m where m.account_id=a.id and m.status='posted' and m.movement_type='transfer_out' and m.movement_date between period_start and period_end),0),
    'closing_balance',public.financial_period_account_balance_as_of(target_school_id,a.id,period_end)
  ) order by a.branch_id nulls first,a.name),'[]'::jsonb) into account_breakdown
  from public.treasury_accounts a where a.school_id=target_school_id and a.created_at < (period_end+1)::timestamp
    and public.financial_statement_row_visible(target_school_id,a.branch_id,target_branch_id);

  select fp.status into period_status from public.financial_periods fp where fp.school_id=target_school_id and fp.period_month=period_start;

  return jsonb_build_object(
    'period_month',period_start,'period_end',period_end,'period_status',period_status,'scope_complete',scope_complete,'target_branch_id',target_branch_id,
    'accruals',accruals,'outstanding',outstanding,'overdue',overdue,'collections',collections,'other_income',other_income_total,'expenses',expenses_total,
    'payroll',jsonb_build_object('accrued',payroll_accrued,'paid_in_period',payroll_paid,'unpaid_at_end',payroll_unpaid),
    'operating_result',accruals+other_income_total-expenses_total-payroll_accrued,
    'cash',jsonb_build_object('opening_balance',treasury_opening,'opening_balance_entries',opening_entries,'inflows',cash_inflows,'outflows',cash_outflows,'net_cash',cash_inflows-cash_outflows,'closing_balance',treasury_closing,'manual_deposits',manual_deposits,'manual_withdrawals',manual_withdrawals,'internal_transfers',internal_transfers),
    'branches',branch_breakdown,'categories',category_breakdown,'accounts',account_breakdown
  );
end;
$$;

revoke all on function public.financial_statement_row_visible(uuid,uuid,uuid) from public;
revoke all on function public.get_financial_statement(uuid,date,uuid) from public,anon;
grant execute on function public.get_financial_statement(uuid,date,uuid) to authenticated;
comment on function public.get_financial_statement(uuid,date,uuid) is 'Derived monthly financial statement from authoritative transaction rows. Treasury movements are cash-location evidence and are not added to P&L totals.';

commit;
