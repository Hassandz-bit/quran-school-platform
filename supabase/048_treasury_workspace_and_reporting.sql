-- QuranOS V2 - treasury workspace, reporting, and adjustment hardening
-- V2 review migration only. Do not apply to Production manually.

begin;

create or replace function public.record_treasury_adjustment(
  target_school_id uuid,
  target_account_id uuid,
  target_kind text,
  target_amount numeric,
  target_date date,
  target_reference_number text,
  target_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.treasury_accounts%rowtype;
  created_id uuid;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;

  select * into account_row
  from public.treasury_accounts a
  where a.school_id = target_school_id and a.id = target_account_id
  for update;
  if not found then raise exception using errcode = '23514', message = 'TREASURY_ACCOUNT_UNAVAILABLE'; end if;
  if account_row.status <> 'active' then raise exception using errcode = '55000', message = 'TREASURY_ACCOUNT_NOT_ACTIVE'; end if;
  if not public.treasury_can_manage_account(target_school_id, account_row.branch_id) then
    raise exception using errcode = '42501', message = 'TREASURY_MANAGE_REQUIRED';
  end if;
  if target_kind not in ('manual_deposit', 'manual_withdrawal')
    or target_amount is null or target_amount <= 0 or target_date is null
    or target_notes is null or char_length(btrim(target_notes)) not between 3 and 250
  then raise exception using errcode = '22023', message = 'TREASURY_ADJUSTMENT_INPUT_INVALID'; end if;

  insert into public.treasury_movements (
    school_id, account_id, direction, movement_type, amount, movement_date,
    reference_number, notes, actor_profile_id
  ) values (
    target_school_id, target_account_id,
    case when target_kind = 'manual_deposit' then 'in' else 'out' end,
    target_kind, target_amount, target_date, nullif(btrim(target_reference_number), ''),
    btrim(target_notes), (select auth.uid())
  ) returning id into created_id;

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, new_values, actor_profile_id
  )
  select target_school_id, 'movement', created_id, 'adjustment', to_jsonb(m), (select auth.uid())
  from public.treasury_movements m where m.id = created_id;
  return created_id;
end;
$$;

create or replace function public.list_treasury_link_accounts(
  target_school_id uuid,
  target_transaction_branch_id uuid
)
returns table (
  id uuid,
  branch_id uuid,
  account_type text,
  name text,
  code text,
  account_reference text,
  current_balance numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.branch_id,
    a.account_type,
    a.name,
    a.code,
    a.account_reference,
    public.treasury_account_balance_internal(a.school_id, a.id)
  from public.treasury_accounts a
  where a.school_id = target_school_id
    and a.status = 'active'
    and (
      (target_transaction_branch_id is null
        and a.branch_id is null
        and public.has_school_permission(target_school_id, 'finance.manage'))
      or
      (target_transaction_branch_id is not null
        and a.branch_id = target_transaction_branch_id
        and public.has_branch_permission(target_school_id, target_transaction_branch_id, 'finance.manage'))
      or
      (target_transaction_branch_id is not null
        and a.branch_id is null
        and public.has_school_permission(target_school_id, 'finance.manage'))
    )
  order by a.branch_id nulls first, a.name, a.id;
$$;

create or replace function public.get_treasury_workspace(
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
  result jsonb;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  if target_limit is null or target_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'TREASURY_LIMIT_INVALID';
  end if;
  if not public.is_active_school_member(target_school_id) then
    raise exception using errcode = '42501', message = 'TREASURY_VIEW_REQUIRED';
  end if;
  if not (
    public.has_school_permission(target_school_id, 'finance.view')
    or public.has_school_permission(target_school_id, 'finance.manage')
    or exists (
      select 1 from public.treasury_accounts a
      where a.school_id = target_school_id
        and a.branch_id is not null
        and public.treasury_can_view_account(target_school_id, a.branch_id)
    )
  ) then
    raise exception using errcode = '42501', message = 'TREASURY_VIEW_REQUIRED';
  end if;

  select jsonb_build_object(
    'can_manage_school', public.has_school_permission(target_school_id, 'finance.manage'),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'branch_id', a.branch_id,
        'account_type', a.account_type,
        'name', a.name,
        'code', a.code,
        'account_reference', a.account_reference,
        'currency', a.currency,
        'status', a.status,
        'balance', public.treasury_account_balance_internal(a.school_id, a.id),
        'can_manage', public.treasury_can_manage_account(a.school_id, a.branch_id)
      ) order by a.branch_id nulls first, a.name)
      from public.treasury_accounts a
      where a.school_id = target_school_id
        and public.treasury_can_view_account(a.school_id, a.branch_id)
    ), '[]'::jsonb),
    'other_income', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'branch_id', i.branch_id,
        'treasury_account_id', i.treasury_account_id,
        'category', i.category,
        'source_description', i.source_description,
        'amount', i.amount,
        'income_date', i.income_date,
        'payment_method', i.payment_method,
        'reference_number', i.reference_number,
        'notes', i.notes,
        'status', i.status,
        'created_at', i.created_at
      ) order by i.income_date desc, i.created_at desc)
      from (
        select * from public.other_income i0
        where i0.school_id = target_school_id
          and (
            (i0.branch_id is null and (
              public.has_school_permission(target_school_id, 'finance.view')
              or public.has_school_permission(target_school_id, 'finance.manage')
            ))
            or (i0.branch_id is not null and (
              public.has_branch_permission(target_school_id, i0.branch_id, 'finance.view')
              or public.has_branch_permission(target_school_id, i0.branch_id, 'finance.manage')
            ))
          )
        order by i0.income_date desc, i0.created_at desc
        limit target_limit
      ) i
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'account_id', m.account_id,
        'direction', m.direction,
        'movement_type', m.movement_type,
        'amount', m.amount,
        'movement_date', m.movement_date,
        'source_type', m.source_type,
        'source_id', m.source_id,
        'transfer_id', m.transfer_id,
        'reference_number', m.reference_number,
        'notes', m.notes,
        'status', m.status,
        'created_at', m.created_at
      ) order by m.movement_date desc, m.created_at desc)
      from (
        select m0.*
        from public.treasury_movements m0
        join public.treasury_accounts a0
          on a0.school_id = m0.school_id and a0.id = m0.account_id
        where m0.school_id = target_school_id
          and public.treasury_can_view_account(a0.school_id, a0.branch_id)
        order by m0.movement_date desc, m0.created_at desc
        limit target_limit
      ) m
    ), '[]'::jsonb),
    'transfers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'from_account_id', t.from_account_id,
        'to_account_id', t.to_account_id,
        'amount', t.amount,
        'transfer_date', t.transfer_date,
        'reference_number', t.reference_number,
        'notes', t.notes,
        'status', t.status,
        'created_at', t.created_at
      ) order by t.transfer_date desc, t.created_at desc)
      from (
        select t0.*
        from public.treasury_transfers t0
        join public.treasury_accounts af on af.school_id = t0.school_id and af.id = t0.from_account_id
        join public.treasury_accounts at on at.school_id = t0.school_id and at.id = t0.to_account_id
        where t0.school_id = target_school_id
          and public.treasury_can_view_account(af.school_id, af.branch_id)
          and public.treasury_can_view_account(at.school_id, at.branch_id)
        order by t0.transfer_date desc, t0.created_at desc
        limit target_limit
      ) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_treasury_report_snapshot(
  target_school_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;

  select jsonb_build_object(
    'other_income', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'branch_id', i.branch_id,
        'treasury_account_id', i.treasury_account_id,
        'category', i.category,
        'amount', i.amount,
        'income_date', i.income_date,
        'payment_method', i.payment_method,
        'reference_number', i.reference_number,
        'status', i.status
      ) order by i.income_date desc, i.id)
      from public.other_income i
      where i.school_id = target_school_id
        and (
          (i.branch_id is null and (
            public.has_school_permission(target_school_id, 'finance.view')
            or public.has_school_permission(target_school_id, 'finance.manage')
          ))
          or (i.branch_id is not null and (
            public.has_branch_permission(target_school_id, i.branch_id, 'finance.view')
            or public.has_branch_permission(target_school_id, i.branch_id, 'finance.manage')
          ))
        )
    ), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'branch_id', a.branch_id,
        'account_type', a.account_type,
        'name', a.name,
        'code', a.code,
        'status', a.status,
        'balance', public.treasury_account_balance_internal(a.school_id, a.id)
      ) order by a.branch_id nulls first, a.name)
      from public.treasury_accounts a
      where a.school_id = target_school_id
        and public.treasury_can_view_account(a.school_id, a.branch_id)
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'account_id', m.account_id,
        'direction', m.direction,
        'movement_type', m.movement_type,
        'amount', m.amount,
        'movement_date', m.movement_date,
        'source_type', m.source_type,
        'source_id', m.source_id,
        'status', m.status
      ) order by m.movement_date desc, m.id)
      from public.treasury_movements m
      join public.treasury_accounts a
        on a.school_id = m.school_id and a.id = m.account_id
      where m.school_id = target_school_id
        and public.treasury_can_view_account(a.school_id, a.branch_id)
    ), '[]'::jsonb)
  ) into result;

  if jsonb_array_length(result -> 'accounts') = 0
    and jsonb_array_length(result -> 'other_income') = 0
    and not (
      public.has_school_permission(target_school_id, 'finance.view')
      or public.has_school_permission(target_school_id, 'finance.manage')
    )
  then
    raise exception using errcode = '42501', message = 'TREASURY_VIEW_REQUIRED';
  end if;

  return result;
end;
$$;

revoke all on function public.record_treasury_adjustment(uuid, uuid, text, numeric, date, text, text) from public, anon;
revoke all on function public.list_treasury_link_accounts(uuid, uuid) from public, anon;
revoke all on function public.get_treasury_workspace(uuid, integer) from public, anon;
revoke all on function public.get_treasury_report_snapshot(uuid) from public, anon;

grant execute on function public.record_treasury_adjustment(uuid, uuid, text, numeric, date, text, text) to authenticated;
grant execute on function public.list_treasury_link_accounts(uuid, uuid) to authenticated;
grant execute on function public.get_treasury_workspace(uuid, integer) to authenticated;
grant execute on function public.get_treasury_report_snapshot(uuid) to authenticated;

comment on function public.list_treasury_link_accounts(uuid, uuid) is
  'Returns only active accounts compatible with the transaction scope and manageable by the current finance user.';
comment on function public.get_treasury_workspace(uuid, integer) is
  'Finance-scoped RPC workspace for accounts, balances, other income, movements, and balanced transfers without raw treasury table grants.';
comment on function public.get_treasury_report_snapshot(uuid) is
  'Finance-scoped reporting snapshot. Business income/expense totals remain sourced from their business tables; treasury movements are reconciliation evidence only.';

commit;