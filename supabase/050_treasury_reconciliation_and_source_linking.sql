-- QuranOS V2 - treasury reconciliation and source linking
-- V2 review migration only. Do not apply to Production manually.

begin;

create or replace function public.treasury_source_scope_can_view(
  target_school_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_branch_id is null then
      public.has_school_permission(target_school_id, 'finance.view')
      or public.has_school_permission(target_school_id, 'finance.manage')
    else
      public.has_branch_permission(target_school_id, target_branch_id, 'finance.view')
      or public.has_branch_permission(target_school_id, target_branch_id, 'finance.manage')
  end;
$$;

create or replace function public.treasury_source_scope_can_manage(
  target_school_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_branch_id is null then public.has_school_permission(target_school_id, 'finance.manage')
    else public.has_branch_permission(target_school_id, target_branch_id, 'finance.manage')
  end;
$$;

create or replace function public.link_treasury_business_source(
  target_school_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_branch_id uuid;
  source_status text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED';
  end if;
  if target_source_id is null or target_source_type not in ('student_payment', 'expense', 'payroll_payment') then
    raise exception using errcode = '22023', message = 'TREASURY_LINK_SOURCE_INVALID';
  end if;

  if target_source_type = 'student_payment' then
    select p.branch_id, p.status into source_branch_id, source_status
    from public.payments p
    where p.school_id = target_school_id and p.id = target_source_id
    for update;
    if not found then return false; end if;
    if source_status <> 'completed' then
      raise exception using errcode = '55000', message = 'TREASURY_LINK_SOURCE_NOT_POSTED';
    end if;
  elsif target_source_type = 'expense' then
    select e.branch_id, e.status into source_branch_id, source_status
    from public.expenses e
    where e.school_id = target_school_id and e.id = target_source_id
    for update;
    if not found then return false; end if;
    if source_status <> 'recorded' then
      raise exception using errcode = '55000', message = 'TREASURY_LINK_SOURCE_NOT_POSTED';
    end if;
  else
    select pp.branch_id, pp.status into source_branch_id, source_status
    from public.payroll_payments pp
    where pp.school_id = target_school_id and pp.id = target_source_id
    for update;
    if not found then return false; end if;
    if source_status <> 'completed' then
      raise exception using errcode = '55000', message = 'TREASURY_LINK_SOURCE_NOT_POSTED';
    end if;
  end if;

  if not public.treasury_source_scope_can_manage(target_school_id, source_branch_id) then
    return false;
  end if;

  if target_account_id is not null then
    perform public.validate_treasury_account_for_transaction(
      target_school_id,
      source_branch_id,
      target_account_id,
      true
    );
  end if;

  if target_source_type = 'student_payment' then
    update public.payments
    set treasury_account_id = target_account_id
    where school_id = target_school_id and id = target_source_id;
  elsif target_source_type = 'expense' then
    update public.expenses
    set treasury_account_id = target_account_id
    where school_id = target_school_id and id = target_source_id;
  else
    update public.payroll_payments
    set treasury_account_id = target_account_id
    where school_id = target_school_id and id = target_source_id;
  end if;

  return true;
end;
$$;

create or replace function public.get_treasury_reconciliation(
  target_school_id uuid,
  target_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  has_scope boolean;
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED';
  end if;
  if target_limit is null or target_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'TREASURY_LIMIT_INVALID';
  end if;

  has_scope :=
    public.has_school_permission(target_school_id, 'finance.view')
    or public.has_school_permission(target_school_id, 'finance.manage')
    or exists (
      select 1
      from public.branches b
      where b.school_id = target_school_id
        and (
          public.has_branch_permission(target_school_id, b.id, 'finance.view')
          or public.has_branch_permission(target_school_id, b.id, 'finance.manage')
        )
    );
  if not has_scope then
    raise exception using errcode = '42501', message = 'TREASURY_VIEW_REQUIRED';
  end if;

  with business_sources as (
    select
      'student_payment'::text as source_type,
      p.id as source_id,
      p.branch_id,
      p.amount::numeric(14,2) as amount,
      p.payment_date as source_date,
      p.reference_number,
      'دفعة طالب'::text as label,
      p.treasury_account_id,
      'in'::text as direction,
      public.treasury_source_scope_can_manage(target_school_id, p.branch_id) as can_manage
    from public.payments p
    where p.school_id = target_school_id
      and p.status = 'completed'
      and public.treasury_source_scope_can_view(target_school_id, p.branch_id)

    union all

    select
      'other_income',
      i.id,
      i.branch_id,
      i.amount::numeric(14,2),
      i.income_date,
      i.reference_number,
      i.source_description,
      i.treasury_account_id,
      'in',
      public.treasury_source_scope_can_manage(target_school_id, i.branch_id)
    from public.other_income i
    where i.school_id = target_school_id
      and i.status = 'recorded'
      and public.treasury_source_scope_can_view(target_school_id, i.branch_id)

    union all

    select
      'expense',
      e.id,
      e.branch_id,
      e.amount::numeric(14,2),
      e.expense_date,
      e.reference_number,
      e.description,
      e.treasury_account_id,
      'out',
      public.treasury_source_scope_can_manage(target_school_id, e.branch_id)
    from public.expenses e
    where e.school_id = target_school_id
      and e.status = 'recorded'
      and public.treasury_source_scope_can_view(target_school_id, e.branch_id)

    union all

    select
      'payroll_payment',
      pp.id,
      pp.branch_id,
      pp.amount::numeric(14,2),
      pp.payment_date,
      pp.reference_number,
      'راتب مدفوع',
      pp.treasury_account_id,
      'out',
      public.treasury_source_scope_can_manage(target_school_id, pp.branch_id)
    from public.payroll_payments pp
    where pp.school_id = target_school_id
      and pp.status = 'completed'
      and public.treasury_source_scope_can_view(target_school_id, pp.branch_id)
  ), business_summary as (
    select
      coalesce(sum(amount) filter (where direction = 'in'), 0)::numeric(14,2) as total_inflows,
      coalesce(sum(amount) filter (where direction = 'out'), 0)::numeric(14,2) as total_outflows,
      coalesce(sum(amount) filter (where source_type = 'student_payment'), 0)::numeric(14,2) as student_payments,
      coalesce(sum(amount) filter (where source_type = 'other_income'), 0)::numeric(14,2) as other_income,
      coalesce(sum(amount) filter (where source_type = 'expense'), 0)::numeric(14,2) as expenses,
      coalesce(sum(amount) filter (where source_type = 'payroll_payment'), 0)::numeric(14,2) as payroll
    from business_sources
  ), linked_summary as (
    select
      coalesce(sum(m.amount) filter (where m.direction = 'in'), 0)::numeric(14,2) as total_inflows,
      coalesce(sum(m.amount) filter (where m.direction = 'out'), 0)::numeric(14,2) as total_outflows,
      coalesce(sum(m.amount) filter (where m.source_type = 'student_payment'), 0)::numeric(14,2) as student_payments,
      coalesce(sum(m.amount) filter (where m.source_type = 'other_income'), 0)::numeric(14,2) as other_income,
      coalesce(sum(m.amount) filter (where m.source_type = 'expense'), 0)::numeric(14,2) as expenses,
      coalesce(sum(m.amount) filter (where m.source_type = 'payroll_payment'), 0)::numeric(14,2) as payroll
    from public.treasury_movements m
    join public.treasury_accounts a
      on a.school_id = m.school_id and a.id = m.account_id
    where m.school_id = target_school_id
      and m.status = 'posted'
      and m.source_type in ('student_payment', 'other_income', 'expense', 'payroll_payment')
      and public.treasury_can_view_account(a.school_id, a.branch_id)
  ), adjustment_summary as (
    select
      coalesce(sum(m.amount) filter (where m.movement_type = 'manual_deposit' and m.status = 'posted'), 0)::numeric(14,2) as deposits,
      coalesce(sum(m.amount) filter (where m.movement_type = 'manual_withdrawal' and m.status = 'posted'), 0)::numeric(14,2) as withdrawals,
      coalesce(sum(m.amount) filter (where m.movement_type = 'transfer_out' and m.status = 'posted'), 0)::numeric(14,2) as transfers
    from public.treasury_movements m
    join public.treasury_accounts a
      on a.school_id = m.school_id and a.id = m.account_id
    where m.school_id = target_school_id
      and public.treasury_can_view_account(a.school_id, a.branch_id)
  )
  select jsonb_build_object(
    'business', jsonb_build_object(
      'student_payments', b.student_payments,
      'other_income', b.other_income,
      'expenses', b.expenses,
      'payroll', b.payroll,
      'total_inflows', b.total_inflows,
      'total_outflows', b.total_outflows,
      'net', b.total_inflows - b.total_outflows
    ),
    'linked', jsonb_build_object(
      'student_payments', l.student_payments,
      'other_income', l.other_income,
      'expenses', l.expenses,
      'payroll', l.payroll,
      'total_inflows', l.total_inflows,
      'total_outflows', l.total_outflows,
      'net', l.total_inflows - l.total_outflows
    ),
    'unmatched', jsonb_build_object(
      'inflows', b.total_inflows - l.total_inflows,
      'outflows', b.total_outflows - l.total_outflows,
      'count', (select count(*) from business_sources s where s.treasury_account_id is null)
    ),
    'adjustments', jsonb_build_object(
      'manual_deposits', a.deposits,
      'manual_withdrawals', a.withdrawals,
      'internal_transfers', a.transfers
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ta.id,
        'branch_id', ta.branch_id,
        'name', ta.name,
        'code', ta.code,
        'account_type', ta.account_type,
        'status', ta.status,
        'balance', public.treasury_account_balance_internal(ta.school_id, ta.id)
      ) order by ta.branch_id nulls first, ta.name)
      from public.treasury_accounts ta
      where ta.school_id = target_school_id
        and public.treasury_can_view_account(ta.school_id, ta.branch_id)
    ), '[]'::jsonb),
    'unlinked_sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_type', s.source_type,
        'source_id', s.source_id,
        'branch_id', s.branch_id,
        'amount', s.amount,
        'source_date', s.source_date,
        'reference_number', s.reference_number,
        'label', s.label,
        'direction', s.direction,
        'can_manage', s.can_manage
      ) order by s.source_date desc, s.source_type, s.source_id)
      from (
        select * from business_sources s0
        where s0.treasury_account_id is null
        order by s0.source_date desc, s0.source_type, s0.source_id
        limit target_limit
      ) s
    ), '[]'::jsonb)
  ) into result
  from business_summary b
  cross join linked_summary l
  cross join adjustment_summary a;

  return result;
end;
$$;

revoke all on function public.treasury_source_scope_can_view(uuid, uuid) from public;
revoke all on function public.treasury_source_scope_can_manage(uuid, uuid) from public;
revoke all on function public.link_treasury_business_source(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.get_treasury_reconciliation(uuid, integer) from public, anon;
grant execute on function public.link_treasury_business_source(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.get_treasury_reconciliation(uuid, integer) to authenticated;

comment on function public.link_treasury_business_source(uuid, text, uuid, uuid) is
  'Finance-manage reconciliation action for completed student payments, recorded expenses, and completed payroll payments. Updating the account automatically posts/reverses the matching treasury movement.';
comment on function public.get_treasury_reconciliation(uuid, integer) is
  'Finance-scoped reconciliation report. Business sources define income/outflow totals; treasury movements show linked cash location evidence. Transfers and manual adjustments remain separate.';

commit;