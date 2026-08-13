-- QuranOS V2 - financial close acceptance hardening
-- V2 review migration only. Do not apply to Production manually.

begin;

-- Preserve the actual cash-count / bank / postal statement date separately from
-- the timestamp at which staff recorded the reconciliation in QuranOS.
alter table public.treasury_account_reconciliations
  add column evidence_date date;

update public.treasury_account_reconciliations r
set evidence_date = (fp.period_month + interval '1 month - 1 day')::date
from public.financial_periods fp
where fp.school_id = r.school_id
  and fp.id = r.period_id
  and r.evidence_date is null;

alter table public.treasury_account_reconciliations
  alter column evidence_date set not null;

comment on column public.treasury_account_reconciliations.evidence_date is
  'Period-end date of the entered cash count or bank/postal statement; distinct from reconciled_at, which records when staff saved the evidence.';

-- Replace the pre-hardening RPC so browser callers must explicitly provide the
-- evidence date. Period close reconciles period-end balances, therefore the
-- evidence date must be the exact final day of that financial month.
revoke all on function public.record_treasury_period_reconciliation(uuid,uuid,uuid,numeric,text,text) from public, anon, authenticated;
drop function public.record_treasury_period_reconciliation(uuid,uuid,uuid,numeric,text,text);

create function public.record_treasury_period_reconciliation(
  target_school_id uuid,
  target_period_id uuid,
  target_account_id uuid,
  target_actual_balance numeric,
  target_evidence_date date,
  target_evidence_reference text default null,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_row public.financial_periods%rowtype;
  account_row public.treasury_accounts%rowtype;
  period_end date;
  evidence text;
  system_value numeric;
  created_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode='42501', message='FINANCIAL_PERIOD_AUTH_REQUIRED';
  end if;

  select * into period_row
  from public.financial_periods
  where school_id=target_school_id and id=target_period_id
  for share;
  if not found then
    raise exception using errcode='22023', message='FINANCIAL_PERIOD_NOT_FOUND';
  end if;
  if period_row.status = 'closed' then
    raise exception using errcode='55000', message='FINANCIAL_PERIOD_RECONCILIATION_CLOSED';
  end if;

  select * into account_row
  from public.treasury_accounts
  where school_id=target_school_id and id=target_account_id;
  if not found or not public.treasury_can_manage_account(target_school_id, account_row.branch_id) then
    raise exception using errcode='42501', message='TREASURY_MANAGE_REQUIRED';
  end if;
  if target_actual_balance is null or abs(target_actual_balance) > 9999999999.99 then
    raise exception using errcode='22023', message='TREASURY_RECONCILIATION_BALANCE_INVALID';
  end if;

  period_end := (period_row.period_month + interval '1 month - 1 day')::date;
  if target_evidence_date is null or target_evidence_date <> period_end then
    raise exception using errcode='22023', message='TREASURY_RECONCILIATION_DATE_INVALID';
  end if;

  evidence := case account_row.account_type
    when 'cash' then 'cash_count'
    when 'bank' then 'bank_statement'
    else 'postal_statement'
  end;
  if account_row.account_type in ('bank','postal')
    and (target_evidence_reference is null or char_length(btrim(target_evidence_reference)) < 2) then
    raise exception using errcode='22023', message='TREASURY_RECONCILIATION_REFERENCE_REQUIRED';
  end if;

  system_value := public.financial_period_account_balance_as_of(target_school_id, target_account_id, period_end);
  insert into public.treasury_account_reconciliations (
    school_id, period_id, account_id, system_balance, actual_balance,
    evidence_type, evidence_date, evidence_reference, notes, reconciled_by
  )
  values (
    target_school_id, target_period_id, target_account_id, system_value, target_actual_balance,
    evidence, target_evidence_date, nullif(btrim(target_evidence_reference),''),
    nullif(btrim(target_notes),''), (select auth.uid())
  )
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.record_treasury_period_reconciliation(uuid,uuid,uuid,numeric,date,text,text) from public, anon;
grant execute on function public.record_treasury_period_reconciliation(uuid,uuid,uuid,numeric,date,text,text) to authenticated;

-- Formal statements already expose treasury-account breakdowns. This dedicated
-- RPC adds the complementary collection breakdown by payment method while
-- preserving the same school/branch authorization and keeping raw payments
-- unavailable to the browser.
create function public.list_financial_statement_payment_methods(
  target_school_id uuid,
  target_period_month date,
  target_branch_id uuid default null
)
returns table(payment_method text, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  statement_period_start date := date_trunc('month', target_period_month)::date;
  statement_period_end date := (date_trunc('month', target_period_month) + interval '1 month - 1 day')::date;
  has_scope boolean;
begin
  if (select auth.uid()) is null then
    raise exception using errcode='42501', message='FINANCIAL_STATEMENT_AUTH_REQUIRED';
  end if;
  if target_period_month is null or target_period_month <> statement_period_start then
    raise exception using errcode='22023', message='FINANCIAL_STATEMENT_MONTH_INVALID';
  end if;
  if target_branch_id is not null and not exists (
    select 1 from public.branches b where b.school_id=target_school_id and b.id=target_branch_id
  ) then
    raise exception using errcode='22023', message='FINANCIAL_STATEMENT_BRANCH_INVALID';
  end if;

  has_scope := case when target_branch_id is not null then
    public.financial_statement_row_visible(target_school_id,target_branch_id,target_branch_id)
  else
    public.has_school_permission(target_school_id,'finance.view')
    or public.has_school_permission(target_school_id,'finance.manage')
    or exists (
      select 1 from public.branches b
      where b.school_id=target_school_id
        and public.financial_statement_row_visible(target_school_id,b.id,null)
    )
  end;
  if not has_scope then
    raise exception using errcode='42501', message='FINANCIAL_STATEMENT_VIEW_REQUIRED';
  end if;

  return query
  select p.payment_method, sum(p.amount)::numeric(14,2)
  from public.payments p
  where p.school_id=target_school_id
    and p.status='completed'
    and p.payment_date between statement_period_start and statement_period_end
    and public.financial_statement_row_visible(target_school_id,p.branch_id,target_branch_id)
  group by p.payment_method
  order by p.payment_method;
end;
$$;

revoke all on function public.list_financial_statement_payment_methods(uuid,date,uuid) from public, anon;
grant execute on function public.list_financial_statement_payment_methods(uuid,date,uuid) to authenticated;

comment on function public.list_financial_statement_payment_methods(uuid,date,uuid) is
  'Scoped collection breakdown by authoritative completed-payment method for the formal monthly financial statement.';

commit;
