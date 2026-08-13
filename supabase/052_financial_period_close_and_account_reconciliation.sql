-- QuranOS V2 - financial period close and treasury account reconciliation
-- V2 review migration only. Do not apply to Production manually.

begin;

create table public.financial_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  period_month date not null,
  status text not null default 'open',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  closing_started_by uuid,
  closing_started_at timestamptz,
  closed_by uuid,
  closed_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  reopen_reason text,
  constraint financial_period_school_fk foreign key (school_id) references public.schools(id),
  constraint financial_period_created_by_fk foreign key (created_by) references public.profiles(id),
  constraint financial_period_closing_by_fk foreign key (closing_started_by) references public.profiles(id),
  constraint financial_period_closed_by_fk foreign key (closed_by) references public.profiles(id),
  constraint financial_period_reopened_by_fk foreign key (reopened_by) references public.profiles(id),
  constraint financial_period_month_check check (period_month = date_trunc('month', period_month)::date),
  constraint financial_period_status_check check (status in ('open', 'closing', 'closed')),
  constraint financial_period_reopen_reason_check check (reopen_reason is null or char_length(btrim(reopen_reason)) between 5 and 300),
  constraint financial_period_school_month_unique unique (school_id, period_month),
  constraint financial_period_school_id_id_unique unique (school_id, id)
);

create table public.financial_period_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  period_id uuid not null,
  action text not null,
  from_status text,
  to_status text not null,
  reason text,
  actor_profile_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint financial_period_event_school_fk foreign key (school_id) references public.schools(id),
  constraint financial_period_event_period_fk foreign key (school_id, period_id) references public.financial_periods(school_id, id),
  constraint financial_period_event_actor_fk foreign key (actor_profile_id) references public.profiles(id),
  constraint financial_period_event_action_check check (action in ('create', 'start_closing', 'close', 'reopen')),
  constraint financial_period_event_from_check check (from_status is null or from_status in ('open', 'closing', 'closed')),
  constraint financial_period_event_to_check check (to_status in ('open', 'closing', 'closed')),
  constraint financial_period_event_reason_check check (reason is null or char_length(btrim(reason)) between 5 and 300)
);

create table public.treasury_account_reconciliations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  period_id uuid not null,
  account_id uuid not null,
  system_balance numeric(14,2) not null,
  actual_balance numeric(14,2) not null,
  difference numeric(14,2) generated always as (actual_balance - system_balance) stored,
  evidence_type text not null,
  evidence_reference text,
  notes text,
  reconciled_by uuid not null default auth.uid(),
  reconciled_at timestamptz not null default now(),
  constraint treasury_period_reconciliation_school_fk foreign key (school_id) references public.schools(id),
  constraint treasury_period_reconciliation_period_fk foreign key (school_id, period_id) references public.financial_periods(school_id, id),
  constraint treasury_period_reconciliation_account_fk foreign key (school_id, account_id) references public.treasury_accounts(school_id, id),
  constraint treasury_period_reconciliation_actor_fk foreign key (reconciled_by) references public.profiles(id),
  constraint treasury_period_reconciliation_evidence_check check (evidence_type in ('cash_count', 'bank_statement', 'postal_statement')),
  constraint treasury_period_reconciliation_reference_check check (evidence_reference is null or char_length(btrim(evidence_reference)) between 2 and 200),
  constraint treasury_period_reconciliation_notes_check check (notes is null or char_length(btrim(notes)) between 3 and 500)
);

create index financial_period_school_status_month_idx on public.financial_periods (school_id, status, period_month desc);
create index financial_period_events_period_idx on public.financial_period_events (period_id, created_at desc);
create index treasury_period_reconciliation_latest_idx on public.treasury_account_reconciliations (period_id, account_id, reconciled_at desc);

alter table public.financial_periods enable row level security;
alter table public.financial_period_events enable row level security;
alter table public.treasury_account_reconciliations enable row level security;
revoke all on public.financial_periods from public, anon, authenticated;
revoke all on public.financial_period_events from public, anon, authenticated;
revoke all on public.treasury_account_reconciliations from public, anon, authenticated;

create or replace function public.financial_period_assert_date_open(
  target_school_id uuid,
  target_date date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare locked_status text;
begin
  if target_school_id is null or target_date is null then
    raise exception using errcode = '22023', message = 'FINANCIAL_PERIOD_DATE_REQUIRED';
  end if;
  select fp.status into locked_status
  from public.financial_periods fp
  where fp.school_id = target_school_id
    and fp.period_month = date_trunc('month', target_date)::date;
  if locked_status in ('closing', 'closed') then
    raise exception using errcode = '55000', message = 'FINANCIAL_PERIOD_LOCKED';
  end if;
end;
$$;

create or replace function public.financial_guard_dated_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare old_data jsonb; new_data jsonb; date_column text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    new_data := to_jsonb(new);
    perform public.financial_period_assert_date_open((new_data ->> 'school_id')::uuid, (new_data ->> date_column)::date);
    return new;
  elsif tg_op = 'DELETE' then
    old_data := to_jsonb(old);
    perform public.financial_period_assert_date_open((old_data ->> 'school_id')::uuid, (old_data ->> date_column)::date);
    return old;
  end if;
  old_data := to_jsonb(old);
  new_data := to_jsonb(new);
  perform public.financial_period_assert_date_open((old_data ->> 'school_id')::uuid, (old_data ->> date_column)::date);
  perform public.financial_period_assert_date_open((new_data ->> 'school_id')::uuid, (new_data ->> date_column)::date);
  return new;
end;
$$;

create or replace function public.financial_guard_student_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.financial_period_assert_date_open(new.school_id, new.due_date);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.financial_period_assert_date_open(old.school_id, old.due_date);
    return old;
  end if;
  if new.branch_id is distinct from old.branch_id
    or new.charge_type is distinct from old.charge_type
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.original_amount is distinct from old.original_amount
    or new.discount_amount is distinct from old.discount_amount
    or new.discount_value_type is distinct from old.discount_value_type
    or new.discount_value is distinct from old.discount_value
    or new.discount_reason is distinct from old.discount_reason
    or new.due_date is distinct from old.due_date
    or (new.status is distinct from old.status and (new.status in ('waived','cancelled') or old.status in ('waived','cancelled')))
  then
    perform public.financial_period_assert_date_open(old.school_id, old.due_date);
    perform public.financial_period_assert_date_open(new.school_id, new.due_date);
  end if;
  return new;
end;
$$;

create or replace function public.financial_guard_payroll_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare old_month date; new_month date;
begin
  if tg_op <> 'INSERT' then
    select period_month into old_month from public.payroll_periods where school_id = old.school_id and id = old.period_id;
  end if;
  if tg_op <> 'DELETE' then
    select period_month into new_month from public.payroll_periods where school_id = new.school_id and id = new.period_id;
  end if;
  if tg_op = 'INSERT' then
    perform public.financial_period_assert_date_open(new.school_id, new_month);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.financial_period_assert_date_open(old.school_id, old_month);
    return old;
  end if;
  if new.branch_id is distinct from old.branch_id
    or new.period_id is distinct from old.period_id
    or new.base_amount is distinct from old.base_amount
    or new.additions is distinct from old.additions
    or new.deductions is distinct from old.deductions
    or new.advances is distinct from old.advances
    or (new.status is distinct from old.status and (new.status = 'cancelled' or old.status = 'cancelled'))
  then
    perform public.financial_period_assert_date_open(old.school_id, old_month);
    perform public.financial_period_assert_date_open(new.school_id, new_month);
  end if;
  return new;
end;
$$;

create or replace function public.financial_guard_manual_treasury_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.movement_type in ('opening_balance','manual_deposit','manual_withdrawal') then
      perform public.financial_period_assert_date_open(new.school_id, new.movement_date);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.movement_type in ('opening_balance','manual_deposit','manual_withdrawal') then
      perform public.financial_period_assert_date_open(old.school_id, old.movement_date);
    end if;
    return old;
  end if;
  if old.movement_type in ('opening_balance','manual_deposit','manual_withdrawal')
    or new.movement_type in ('opening_balance','manual_deposit','manual_withdrawal') then
    perform public.financial_period_assert_date_open(old.school_id, old.movement_date);
    perform public.financial_period_assert_date_open(new.school_id, new.movement_date);
  end if;
  return new;
end;
$$;

create trigger payments_financial_period_guard before insert or update or delete on public.payments
for each row execute function public.financial_guard_dated_row('payment_date');
create trigger expenses_financial_period_guard before insert or update or delete on public.expenses
for each row execute function public.financial_guard_dated_row('expense_date');
create trigger payroll_payments_financial_period_guard before insert or update or delete on public.payroll_payments
for each row execute function public.financial_guard_dated_row('payment_date');
create trigger other_income_financial_period_guard before insert or update or delete on public.other_income
for each row execute function public.financial_guard_dated_row('income_date');
create trigger treasury_transfers_financial_period_guard before insert or update or delete on public.treasury_transfers
for each row execute function public.financial_guard_dated_row('transfer_date');
create trigger student_charges_financial_period_guard before insert or update or delete on public.student_charges
for each row execute function public.financial_guard_student_charge();
create trigger payroll_entries_financial_period_guard before insert or update or delete on public.payroll_entries
for each row execute function public.financial_guard_payroll_entry();
create trigger treasury_movements_financial_period_guard before insert or update or delete on public.treasury_movements
for each row execute function public.financial_guard_manual_treasury_movement();

create or replace function public.financial_period_account_balance_as_of(
  target_school_id uuid,
  target_account_id uuid,
  target_date date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case m.direction when 'in' then m.amount else -m.amount end), 0)::numeric(14,2)
  from public.treasury_movements m
  where m.school_id = target_school_id
    and m.account_id = target_account_id
    and m.status = 'posted'
    and m.movement_date <= target_date;
$$;

create or replace function public.get_financial_period_workspace(
  target_school_id uuid,
  target_period_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_month date := date_trunc('month', target_period_month)::date;
  period_end date := (date_trunc('month', target_period_month) + interval '1 month - 1 day')::date;
  period_row public.financial_periods%rowtype;
  has_scope boolean;
  can_manage_school boolean;
begin
  if (select auth.uid()) is null then raise exception using errcode='42501', message='FINANCIAL_PERIOD_AUTH_REQUIRED'; end if;
  if target_period_month is null or target_period_month <> normalized_month then raise exception using errcode='22023', message='FINANCIAL_PERIOD_MONTH_INVALID'; end if;
  can_manage_school := public.has_school_permission(target_school_id, 'finance.manage');
  has_scope := can_manage_school
    or public.has_school_permission(target_school_id, 'finance.view')
    or exists (select 1 from public.branches b where b.school_id = target_school_id and (
      public.has_branch_permission(target_school_id, b.id, 'finance.view') or public.has_branch_permission(target_school_id, b.id, 'finance.manage')));
  if not has_scope then raise exception using errcode='42501', message='FINANCIAL_PERIOD_VIEW_REQUIRED'; end if;

  select * into period_row from public.financial_periods
  where school_id = target_school_id and period_month = normalized_month;

  return jsonb_build_object(
    'period', case when period_row.id is null then null else jsonb_build_object(
      'id', period_row.id, 'period_month', period_row.period_month, 'status', period_row.status,
      'created_at', period_row.created_at, 'closing_started_at', period_row.closing_started_at,
      'closed_at', period_row.closed_at, 'reopened_at', period_row.reopened_at,
      'reopen_reason', period_row.reopen_reason
    ) end,
    'can_manage_school', can_manage_school,
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'branch_id', a.branch_id, 'name', a.name, 'code', a.code,
      'account_type', a.account_type, 'status', a.status,
      'system_balance', public.financial_period_account_balance_as_of(a.school_id, a.id, period_end),
      'can_manage', public.treasury_can_manage_account(a.school_id, a.branch_id),
      'latest_reconciliation', case when r.id is null then null else jsonb_build_object(
        'id', r.id, 'system_balance', r.system_balance, 'actual_balance', r.actual_balance,
        'difference', r.difference, 'evidence_type', r.evidence_type,
        'evidence_reference', r.evidence_reference, 'notes', r.notes, 'reconciled_at', r.reconciled_at
      ) end
    ) order by a.branch_id nulls first, a.name)
    from public.treasury_accounts a
    left join lateral (
      select tr.* from public.treasury_account_reconciliations tr
      where tr.period_id = period_row.id and tr.account_id = a.id
      order by tr.reconciled_at desc, tr.id desc limit 1
    ) r on true
    where a.school_id = target_school_id
      and a.created_at < (period_end + 1)::timestamp
      and public.treasury_can_view_account(a.school_id, a.branch_id)), '[]'::jsonb),
    'events', case when can_manage_school then coalesce((select jsonb_agg(jsonb_build_object(
      'action', e.action, 'from_status', e.from_status, 'to_status', e.to_status,
      'reason', e.reason, 'actor_profile_id', e.actor_profile_id, 'created_at', e.created_at
    ) order by e.created_at desc)
    from (select * from public.financial_period_events where period_id = period_row.id order by created_at desc limit 50) e), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.start_financial_period_closing(
  target_school_id uuid,
  target_period_month date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare normalized_month date := date_trunc('month', target_period_month)::date; period_row public.financial_periods%rowtype; created_id uuid;
begin
  if (select auth.uid()) is null or not public.has_school_permission(target_school_id, 'finance.manage') then raise exception using errcode='42501', message='FINANCIAL_PERIOD_MANAGE_REQUIRED'; end if;
  if target_period_month is null or target_period_month <> normalized_month then raise exception using errcode='22023', message='FINANCIAL_PERIOD_MONTH_INVALID'; end if;
  insert into public.financial_periods (school_id, period_month, created_by)
  values (target_school_id, normalized_month, (select auth.uid()))
  on conflict (school_id, period_month) do nothing returning id into created_id;
  if created_id is not null then
    insert into public.financial_period_events (school_id, period_id, action, to_status, actor_profile_id)
    values (target_school_id, created_id, 'create', 'open', (select auth.uid()));
  end if;
  select * into period_row from public.financial_periods where school_id=target_school_id and period_month=normalized_month for update;
  if period_row.status = 'closed' then raise exception using errcode='55000', message='FINANCIAL_PERIOD_ALREADY_CLOSED'; end if;
  if period_row.status = 'closing' then return period_row.id; end if;
  update public.financial_periods set status='closing', closing_started_by=(select auth.uid()), closing_started_at=now()
  where id=period_row.id;
  insert into public.financial_period_events (school_id, period_id, action, from_status, to_status, actor_profile_id)
  values (target_school_id, period_row.id, 'start_closing', 'open', 'closing', (select auth.uid()));
  return period_row.id;
end;
$$;

create or replace function public.reopen_financial_period(
  target_school_id uuid,
  target_period_id uuid,
  target_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare period_row public.financial_periods%rowtype;
begin
  if (select auth.uid()) is null or not public.has_school_permission(target_school_id, 'finance.manage') then raise exception using errcode='42501', message='FINANCIAL_PERIOD_MANAGE_REQUIRED'; end if;
  if target_reason is null or char_length(btrim(target_reason)) not between 5 and 300 then raise exception using errcode='22023', message='FINANCIAL_PERIOD_REOPEN_REASON_REQUIRED'; end if;
  select * into period_row from public.financial_periods where school_id=target_school_id and id=target_period_id for update;
  if not found then return false; end if;
  if period_row.status = 'open' then raise exception using errcode='55000', message='FINANCIAL_PERIOD_ALREADY_OPEN'; end if;
  update public.financial_periods set status='open', reopened_by=(select auth.uid()), reopened_at=now(), reopen_reason=btrim(target_reason)
  where id=period_row.id;
  insert into public.financial_period_events (school_id, period_id, action, from_status, to_status, reason, actor_profile_id)
  values (target_school_id, period_row.id, 'reopen', period_row.status, 'open', btrim(target_reason), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.record_treasury_period_reconciliation(
  target_school_id uuid,
  target_period_id uuid,
  target_account_id uuid,
  target_actual_balance numeric,
  target_evidence_reference text default null,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare period_row public.financial_periods%rowtype; account_row public.treasury_accounts%rowtype; period_end date; evidence text; system_value numeric; created_id uuid;
begin
  if (select auth.uid()) is null then raise exception using errcode='42501', message='FINANCIAL_PERIOD_AUTH_REQUIRED'; end if;
  select * into period_row from public.financial_periods where school_id=target_school_id and id=target_period_id for share;
  if not found then raise exception using errcode='22023', message='FINANCIAL_PERIOD_NOT_FOUND'; end if;
  if period_row.status = 'closed' then raise exception using errcode='55000', message='FINANCIAL_PERIOD_RECONCILIATION_CLOSED'; end if;
  select * into account_row from public.treasury_accounts where school_id=target_school_id and id=target_account_id;
  if not found or not public.treasury_can_manage_account(target_school_id, account_row.branch_id) then raise exception using errcode='42501', message='TREASURY_MANAGE_REQUIRED'; end if;
  if target_actual_balance is null or abs(target_actual_balance) > 9999999999.99 then raise exception using errcode='22023', message='TREASURY_RECONCILIATION_BALANCE_INVALID'; end if;
  evidence := case account_row.account_type when 'cash' then 'cash_count' when 'bank' then 'bank_statement' else 'postal_statement' end;
  if account_row.account_type in ('bank','postal') and (target_evidence_reference is null or char_length(btrim(target_evidence_reference)) < 2) then raise exception using errcode='22023', message='TREASURY_RECONCILIATION_REFERENCE_REQUIRED'; end if;
  period_end := (period_row.period_month + interval '1 month - 1 day')::date;
  system_value := public.financial_period_account_balance_as_of(target_school_id, target_account_id, period_end);
  insert into public.treasury_account_reconciliations (school_id, period_id, account_id, system_balance, actual_balance, evidence_type, evidence_reference, notes, reconciled_by)
  values (target_school_id, target_period_id, target_account_id, system_value, target_actual_balance, evidence, nullif(btrim(target_evidence_reference),''), nullif(btrim(target_notes),''), (select auth.uid()))
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.close_financial_period(
  target_school_id uuid,
  target_period_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_row public.financial_periods%rowtype;
  period_end date;
  unmatched_count integer;
  account_row record;
  reconciliation_row record;
  current_balance numeric;
begin
  if (select auth.uid()) is null or not public.has_school_permission(target_school_id, 'finance.manage') then raise exception using errcode='42501', message='FINANCIAL_PERIOD_MANAGE_REQUIRED'; end if;
  select * into period_row from public.financial_periods where school_id=target_school_id and id=target_period_id for update;
  if not found then return false; end if;
  if period_row.status <> 'closing' then raise exception using errcode='55000', message='FINANCIAL_PERIOD_NOT_CLOSING'; end if;
  period_end := (period_row.period_month + interval '1 month - 1 day')::date;

  select count(*) into unmatched_count from (
    select 'student_payment'::text source_type, p.id source_id from public.payments p where p.school_id=target_school_id and p.status='completed' and p.payment_date between period_row.period_month and period_end
    union all select 'other_income', i.id from public.other_income i where i.school_id=target_school_id and i.status='recorded' and i.income_date between period_row.period_month and period_end
    union all select 'expense', e.id from public.expenses e where e.school_id=target_school_id and e.status='recorded' and e.expense_date between period_row.period_month and period_end
    union all select 'payroll_payment', pp.id from public.payroll_payments pp where pp.school_id=target_school_id and pp.status='completed' and pp.payment_date between period_row.period_month and period_end
  ) s where not exists (
    select 1 from public.treasury_movements m where m.school_id=target_school_id and m.source_type=s.source_type and m.source_id=s.source_id and m.status='posted'
  );
  if unmatched_count > 0 then raise exception using errcode='55000', message='FINANCIAL_PERIOD_UNMATCHED_TREASURY_EVIDENCE'; end if;

  for account_row in select a.id, a.code from public.treasury_accounts a where a.school_id=target_school_id and a.created_at < (period_end + 1)::timestamp loop
    select r.* into reconciliation_row from public.treasury_account_reconciliations r
    where r.period_id=period_row.id and r.account_id=account_row.id
    order by r.reconciled_at desc, r.id desc limit 1;
    if not found then raise exception using errcode='55000', message='FINANCIAL_PERIOD_RECONCILIATION_REQUIRED'; end if;
    current_balance := public.financial_period_account_balance_as_of(target_school_id, account_row.id, period_end);
    if reconciliation_row.system_balance <> current_balance then raise exception using errcode='55000', message='FINANCIAL_PERIOD_RECONCILIATION_STALE'; end if;
    if reconciliation_row.difference <> 0 then raise exception using errcode='55000', message='FINANCIAL_PERIOD_RECONCILIATION_VARIANCE'; end if;
  end loop;

  update public.financial_periods set status='closed', closed_by=(select auth.uid()), closed_at=now() where id=period_row.id;
  insert into public.financial_period_events (school_id, period_id, action, from_status, to_status, actor_profile_id)
  values (target_school_id, period_row.id, 'close', 'closing', 'closed', (select auth.uid()));
  return true;
end;
$$;

revoke all on function public.financial_period_assert_date_open(uuid,date) from public;
revoke all on function public.financial_guard_dated_row() from public;
revoke all on function public.financial_guard_student_charge() from public;
revoke all on function public.financial_guard_payroll_entry() from public;
revoke all on function public.financial_guard_manual_treasury_movement() from public;
revoke all on function public.financial_period_account_balance_as_of(uuid,uuid,date) from public;
revoke all on function public.get_financial_period_workspace(uuid,date) from public,anon;
revoke all on function public.start_financial_period_closing(uuid,date) from public,anon;
revoke all on function public.reopen_financial_period(uuid,uuid,text) from public,anon;
revoke all on function public.record_treasury_period_reconciliation(uuid,uuid,uuid,numeric,text,text) from public,anon;
revoke all on function public.close_financial_period(uuid,uuid) from public,anon;
grant execute on function public.get_financial_period_workspace(uuid,date) to authenticated;
grant execute on function public.start_financial_period_closing(uuid,date) to authenticated;
grant execute on function public.reopen_financial_period(uuid,uuid,text) to authenticated;
grant execute on function public.record_treasury_period_reconciliation(uuid,uuid,uuid,numeric,text,text) to authenticated;
grant execute on function public.close_financial_period(uuid,uuid) to authenticated;

comment on table public.financial_periods is 'Monthly school financial close state. Closed/closing periods block ordinary dated accounting changes.';
comment on table public.financial_period_events is 'Append-only audit trail for period create, close preparation, close, and explicit reopen actions.';
comment on table public.treasury_account_reconciliations is 'Append-only cash-count/bank/postal statement reconciliations. Prior attempts are never overwritten.';

commit;
