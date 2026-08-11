-- QuranOS V2 - treasury accounts, other income, and authoritative cash movements
-- Stacked on the validated payroll foundation (043/044).
-- V2 review migration only. Do not apply to Production manually.

begin;

create table public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  account_type text not null,
  name text not null,
  code text not null,
  account_reference text,
  currency text not null default 'DZD',
  status text not null default 'active',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint treasury_accounts_school_fk foreign key (school_id) references public.schools(id),
  constraint treasury_accounts_branch_school_fk foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint treasury_accounts_created_by_fk foreign key (created_by) references public.profiles(id),
  constraint treasury_accounts_type_check check (account_type in ('cash', 'bank', 'postal')),
  constraint treasury_accounts_name_check check (char_length(btrim(name)) between 2 and 150),
  constraint treasury_accounts_code_check check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  constraint treasury_accounts_reference_check check (account_reference is null or char_length(btrim(account_reference)) between 2 and 120),
  constraint treasury_accounts_currency_check check (currency = 'DZD'),
  constraint treasury_accounts_status_check check (status in ('active', 'inactive', 'archived')),
  constraint treasury_accounts_school_code_unique unique (school_id, code),
  constraint treasury_accounts_school_id_id_unique unique (school_id, id)
);

create table public.other_income (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  treasury_account_id uuid not null,
  category text not null,
  source_description text not null,
  amount numeric(12,2) not null,
  income_date date not null default current_date,
  payment_method text not null default 'cash',
  reference_number text,
  notes text,
  status text not null default 'recorded',
  created_by uuid not null default auth.uid(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint other_income_school_fk foreign key (school_id) references public.schools(id),
  constraint other_income_branch_school_fk foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint other_income_account_school_fk foreign key (school_id, treasury_account_id) references public.treasury_accounts(school_id, id),
  constraint other_income_created_by_fk foreign key (created_by) references public.profiles(id),
  constraint other_income_reversed_by_fk foreign key (reversed_by) references public.profiles(id),
  constraint other_income_category_check check (category in ('donation', 'grant_subsidy', 'activity', 'rent_asset', 'other')),
  constraint other_income_source_check check (char_length(btrim(source_description)) between 2 and 250),
  constraint other_income_amount_check check (amount > 0),
  constraint other_income_method_check check (payment_method in ('cash', 'bank_transfer', 'postal', 'cheque', 'other')),
  constraint other_income_reference_check check (reference_number is null or btrim(reference_number) <> ''),
  constraint other_income_notes_check check (notes is null or btrim(notes) <> ''),
  constraint other_income_status_check check (status in ('recorded', 'reversed')),
  constraint other_income_reversal_check check (
    (status = 'recorded' and reversed_by is null and reversed_at is null and reversal_reason is null)
    or (status = 'reversed' and reversed_by is not null and reversed_at is not null
      and reversal_reason is not null and char_length(btrim(reversal_reason)) between 3 and 250)
  ),
  constraint other_income_school_id_id_unique unique (school_id, id)
);

create table public.treasury_transfers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount numeric(12,2) not null,
  transfer_date date not null default current_date,
  reference_number text,
  notes text,
  status text not null default 'posted',
  created_by uuid not null default auth.uid(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  constraint treasury_transfers_school_fk foreign key (school_id) references public.schools(id),
  constraint treasury_transfers_from_account_fk foreign key (school_id, from_account_id) references public.treasury_accounts(school_id, id),
  constraint treasury_transfers_to_account_fk foreign key (school_id, to_account_id) references public.treasury_accounts(school_id, id),
  constraint treasury_transfers_created_by_fk foreign key (created_by) references public.profiles(id),
  constraint treasury_transfers_reversed_by_fk foreign key (reversed_by) references public.profiles(id),
  constraint treasury_transfers_accounts_check check (from_account_id <> to_account_id),
  constraint treasury_transfers_amount_check check (amount > 0),
  constraint treasury_transfers_reference_check check (reference_number is null or btrim(reference_number) <> ''),
  constraint treasury_transfers_notes_check check (notes is null or btrim(notes) <> ''),
  constraint treasury_transfers_status_check check (status in ('posted', 'reversed')),
  constraint treasury_transfers_reversal_check check (
    (status = 'posted' and reversed_by is null and reversed_at is null and reversal_reason is null)
    or (status = 'reversed' and reversed_by is not null and reversed_at is not null
      and reversal_reason is not null and char_length(btrim(reversal_reason)) between 3 and 250)
  ),
  constraint treasury_transfers_school_id_id_unique unique (school_id, id)
);

create table public.treasury_movements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  account_id uuid not null,
  direction text not null,
  movement_type text not null,
  amount numeric(12,2) not null,
  movement_date date not null default current_date,
  source_type text,
  source_id uuid,
  transfer_id uuid,
  reference_number text,
  notes text,
  status text not null default 'posted',
  actor_profile_id uuid not null default auth.uid(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  constraint treasury_movements_school_fk foreign key (school_id) references public.schools(id),
  constraint treasury_movements_account_fk foreign key (school_id, account_id) references public.treasury_accounts(school_id, id),
  constraint treasury_movements_transfer_fk foreign key (school_id, transfer_id) references public.treasury_transfers(school_id, id),
  constraint treasury_movements_actor_fk foreign key (actor_profile_id) references public.profiles(id),
  constraint treasury_movements_reversed_by_fk foreign key (reversed_by) references public.profiles(id),
  constraint treasury_movements_direction_check check (direction in ('in', 'out')),
  constraint treasury_movements_type_check check (movement_type in (
    'opening_balance', 'student_payment', 'other_income', 'expense', 'payroll_payment',
    'manual_deposit', 'manual_withdrawal', 'transfer_in', 'transfer_out'
  )),
  constraint treasury_movements_amount_check check (amount > 0),
  constraint treasury_movements_source_check check (
    (movement_type in ('student_payment', 'other_income', 'expense', 'payroll_payment')
      and source_type = movement_type and source_id is not null and transfer_id is null)
    or (movement_type = 'opening_balance' and source_type = 'treasury_account' and source_id = account_id and transfer_id is null)
    or (movement_type in ('manual_deposit', 'manual_withdrawal') and source_type is null and source_id is null and transfer_id is null)
    or (movement_type in ('transfer_in', 'transfer_out') and source_type = 'treasury_transfer' and source_id = transfer_id and transfer_id is not null)
  ),
  constraint treasury_movements_direction_type_check check (
    (movement_type in ('student_payment', 'other_income', 'manual_deposit', 'transfer_in') and direction = 'in')
    or (movement_type in ('expense', 'payroll_payment', 'manual_withdrawal', 'transfer_out') and direction = 'out')
    or movement_type = 'opening_balance'
  ),
  constraint treasury_movements_reference_check check (reference_number is null or btrim(reference_number) <> ''),
  constraint treasury_movements_notes_check check (notes is null or btrim(notes) <> ''),
  constraint treasury_movements_status_check check (status in ('posted', 'reversed')),
  constraint treasury_movements_reversal_check check (
    (status = 'posted' and reversed_by is null and reversed_at is null and reversal_reason is null)
    or (status = 'reversed' and reversed_by is not null and reversed_at is not null
      and reversal_reason is not null and char_length(btrim(reversal_reason)) between 3 and 250)
  )
);

create table public.treasury_audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  old_values jsonb,
  new_values jsonb,
  actor_profile_id uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint treasury_audit_school_fk foreign key (school_id) references public.schools(id),
  constraint treasury_audit_actor_fk foreign key (actor_profile_id) references public.profiles(id),
  constraint treasury_audit_entity_check check (entity_type in ('account', 'other_income', 'transfer', 'movement')),
  constraint treasury_audit_operation_check check (operation in ('create', 'update', 'status_update', 'reverse', 'adjustment'))
);

alter table public.payments
  add column treasury_account_id uuid,
  add constraint payments_treasury_account_fk foreign key (school_id, treasury_account_id)
    references public.treasury_accounts(school_id, id);

alter table public.expenses
  add column treasury_account_id uuid,
  add constraint expenses_treasury_account_fk foreign key (school_id, treasury_account_id)
    references public.treasury_accounts(school_id, id);

alter table public.payroll_payments
  add column treasury_account_id uuid,
  add constraint payroll_payments_treasury_account_fk foreign key (school_id, treasury_account_id)
    references public.treasury_accounts(school_id, id);

grant insert (treasury_account_id) on public.payments to authenticated;
grant update (treasury_account_id) on public.payments to authenticated;
grant insert (treasury_account_id) on public.expenses to authenticated;
grant update (treasury_account_id) on public.expenses to authenticated;

create unique index treasury_movements_one_posted_business_source_idx
  on public.treasury_movements (school_id, source_type, source_id)
  where status = 'posted'
    and source_type in ('student_payment', 'other_income', 'expense', 'payroll_payment');
create unique index treasury_movements_transfer_direction_idx
  on public.treasury_movements (transfer_id, movement_type)
  where transfer_id is not null;
create unique index treasury_movements_opening_idx
  on public.treasury_movements (account_id)
  where movement_type = 'opening_balance';
create index treasury_accounts_school_branch_status_idx
  on public.treasury_accounts (school_id, branch_id, status, name);
create index other_income_school_branch_date_idx
  on public.other_income (school_id, branch_id, income_date desc, status);
create index treasury_movements_account_date_idx
  on public.treasury_movements (account_id, movement_date desc, created_at desc);
create index treasury_movements_school_source_idx
  on public.treasury_movements (school_id, source_type, source_id, status);
create index treasury_audit_entity_idx
  on public.treasury_audit_events (school_id, entity_type, entity_id, changed_at desc);

create trigger treasury_accounts_set_updated_at before update on public.treasury_accounts
for each row execute function public.set_updated_at();
create trigger other_income_set_updated_at before update on public.other_income
for each row execute function public.set_updated_at();

create or replace function public.treasury_can_view_account(
  target_school_id uuid,
  target_account_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_account_branch_id is null then
      public.has_school_permission(target_school_id, 'finance.view')
      or public.has_school_permission(target_school_id, 'finance.manage')
    else
      public.has_branch_permission(target_school_id, target_account_branch_id, 'finance.view')
      or public.has_branch_permission(target_school_id, target_account_branch_id, 'finance.manage')
  end;
$$;

create or replace function public.treasury_can_manage_account(
  target_school_id uuid,
  target_account_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_account_branch_id is null then public.has_school_permission(target_school_id, 'finance.manage')
    else public.has_branch_permission(target_school_id, target_account_branch_id, 'finance.manage')
  end;
$$;

create or replace function public.treasury_account_balance_internal(
  target_school_id uuid,
  target_account_id uuid
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
    and m.status = 'posted';
$$;

create or replace function public.validate_treasury_account_for_transaction(
  target_school_id uuid,
  target_transaction_branch_id uuid,
  target_account_id uuid,
  require_active boolean default true
)
returns public.treasury_accounts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_row public.treasury_accounts%rowtype;
begin
  if target_account_id is null then
    raise exception using errcode = '22023', message = 'TREASURY_ACCOUNT_REQUIRED';
  end if;

  select * into account_row
  from public.treasury_accounts a
  where a.school_id = target_school_id and a.id = target_account_id;
  if not found then
    raise exception using errcode = '23514', message = 'TREASURY_ACCOUNT_UNAVAILABLE';
  end if;

  if require_active and account_row.status <> 'active' then
    raise exception using errcode = '55000', message = 'TREASURY_ACCOUNT_NOT_ACTIVE';
  end if;

  if target_transaction_branch_id is null then
    if account_row.branch_id is not null then
      raise exception using errcode = '23514', message = 'TREASURY_ACCOUNT_SCOPE_MISMATCH';
    end if;
  elsif account_row.branch_id is not null and account_row.branch_id <> target_transaction_branch_id then
    raise exception using errcode = '23514', message = 'TREASURY_ACCOUNT_SCOPE_MISMATCH';
  end if;

  if not public.treasury_can_manage_account(target_school_id, account_row.branch_id) then
    raise exception using errcode = '42501', message = 'TREASURY_MANAGE_REQUIRED';
  end if;

  return account_row;
end;
$$;

create or replace function public.sync_treasury_business_movement(
  target_school_id uuid,
  target_transaction_branch_id uuid,
  target_account_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_direction text,
  target_amount numeric,
  target_date date,
  target_reference_number text,
  target_should_post boolean,
  target_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_row public.treasury_movements%rowtype;
  created_id uuid;
  movement_type_value text;
  reverse_actor uuid := coalesce((select auth.uid()), target_actor_profile_id);
begin
  if target_source_type not in ('student_payment', 'other_income', 'expense', 'payroll_payment')
    or target_source_id is null
    or target_direction not in ('in', 'out')
    or target_amount is null or target_amount <= 0
    or target_date is null
    or target_actor_profile_id is null
  then
    raise exception using errcode = '22023', message = 'TREASURY_SOURCE_INPUT_INVALID';
  end if;

  movement_type_value := target_source_type;

  select * into existing_row
  from public.treasury_movements m
  where m.school_id = target_school_id
    and m.source_type = target_source_type
    and m.source_id = target_source_id
    and m.status = 'posted'
  for update;

  if not target_should_post or target_account_id is null then
    if found then
      update public.treasury_movements
      set status = 'reversed', reversed_by = reverse_actor, reversed_at = now(),
          reversal_reason = case when target_account_id is null then 'تم فصل العملية عن حساب الخزينة' else 'تم عكس العملية المصدرية' end
      where id = existing_row.id;
    end if;
    return null;
  end if;

  perform public.validate_treasury_account_for_transaction(
    target_school_id, target_transaction_branch_id, target_account_id, true
  );

  if existing_row.id is not null
    and existing_row.account_id = target_account_id
    and existing_row.direction = target_direction
    and existing_row.amount = target_amount
    and existing_row.movement_date = target_date
    and existing_row.reference_number is not distinct from nullif(btrim(target_reference_number), '')
  then
    return existing_row.id;
  end if;

  if existing_row.id is not null then
    update public.treasury_movements
    set status = 'reversed', reversed_by = reverse_actor, reversed_at = now(),
        reversal_reason = 'تم تصحيح العملية المصدرية مع الاحتفاظ بالحركة السابقة'
    where id = existing_row.id;
  end if;

  insert into public.treasury_movements (
    school_id, account_id, direction, movement_type, amount, movement_date,
    source_type, source_id, reference_number, actor_profile_id
  ) values (
    target_school_id, target_account_id, target_direction, movement_type_value,
    target_amount, target_date, target_source_type, target_source_id,
    nullif(btrim(target_reference_number), ''), target_actor_profile_id
  ) returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.validate_payment_treasury_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.treasury_account_id is not null
    and (tg_op = 'INSERT' or new.treasury_account_id is distinct from old.treasury_account_id)
  then
    perform public.validate_treasury_account_for_transaction(
      new.school_id, new.branch_id, new.treasury_account_id, true
    );
  end if;
  return new;
end;
$$;

create or replace function public.sync_payment_treasury_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_treasury_business_movement(
    new.school_id, new.branch_id, new.treasury_account_id,
    'student_payment', new.id, 'in', new.amount, new.payment_date,
    new.reference_number, new.status = 'completed',
    coalesce((select auth.uid()), new.received_by)
  );
  return new;
end;
$$;

create trigger payments_treasury_validate
before insert or update of treasury_account_id on public.payments
for each row execute function public.validate_payment_treasury_link();
create trigger payments_treasury_sync
after insert or update of status, treasury_account_id, payment_date, reference_number on public.payments
for each row execute function public.sync_payment_treasury_movement();

create or replace function public.validate_expense_treasury_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.treasury_account_id is not null
    and new.status = 'recorded'
    and (
      tg_op = 'INSERT'
      or new.treasury_account_id is distinct from old.treasury_account_id
      or new.branch_id is distinct from old.branch_id
      or new.amount is distinct from old.amount
      or new.expense_date is distinct from old.expense_date
    )
  then
    perform public.validate_treasury_account_for_transaction(
      new.school_id, new.branch_id, new.treasury_account_id, true
    );
  end if;
  return new;
end;
$$;

create or replace function public.sync_expense_treasury_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_treasury_business_movement(
    new.school_id, new.branch_id, new.treasury_account_id,
    'expense', new.id, 'out', new.amount, new.expense_date,
    new.reference_number, new.status = 'recorded',
    coalesce((select auth.uid()), new.created_by)
  );
  return new;
end;
$$;

create trigger expenses_treasury_validate
before insert or update of treasury_account_id, branch_id, amount, expense_date, status on public.expenses
for each row execute function public.validate_expense_treasury_link();
create trigger expenses_treasury_sync
after insert or update of status, treasury_account_id, branch_id, amount, expense_date, reference_number on public.expenses
for each row execute function public.sync_expense_treasury_movement();

create or replace function public.validate_payroll_payment_treasury_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.treasury_account_id is not null
    and new.status = 'completed'
    and (tg_op = 'INSERT' or new.treasury_account_id is distinct from old.treasury_account_id)
  then
    perform public.validate_treasury_account_for_transaction(
      new.school_id, new.branch_id, new.treasury_account_id, true
    );
  end if;
  return new;
end;
$$;

create or replace function public.sync_payroll_payment_treasury_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_treasury_business_movement(
    new.school_id, new.branch_id, new.treasury_account_id,
    'payroll_payment', new.id, 'out', new.amount, new.payment_date,
    new.reference_number, new.status = 'completed',
    coalesce((select auth.uid()), new.paid_by)
  );
  return new;
end;
$$;

create trigger payroll_payments_treasury_validate
before insert or update of treasury_account_id on public.payroll_payments
for each row execute function public.validate_payroll_payment_treasury_link();
create trigger payroll_payments_treasury_sync
after insert or update of status, treasury_account_id, payment_date, reference_number on public.payroll_payments
for each row execute function public.sync_payroll_payment_treasury_movement();

create or replace function public.validate_other_income_treasury_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'recorded' then
    perform public.validate_treasury_account_for_transaction(
      new.school_id, new.branch_id, new.treasury_account_id, true
    );
  end if;
  return new;
end;
$$;

create or replace function public.sync_other_income_treasury_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_treasury_business_movement(
    new.school_id, new.branch_id, new.treasury_account_id,
    'other_income', new.id, 'in', new.amount, new.income_date,
    new.reference_number, new.status = 'recorded',
    coalesce((select auth.uid()), new.created_by)
  );
  return new;
end;
$$;

create trigger other_income_treasury_validate
before insert or update of treasury_account_id, branch_id, status on public.other_income
for each row execute function public.validate_other_income_treasury_link();
create trigger other_income_treasury_sync
after insert or update of status, treasury_account_id, branch_id, amount, income_date, reference_number on public.other_income
for each row execute function public.sync_other_income_treasury_movement();

create or replace function public.create_treasury_account(
  target_school_id uuid,
  target_branch_id uuid,
  target_account_type text,
  target_name text,
  target_code text,
  target_account_reference text,
  target_opening_balance numeric,
  target_opening_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  account_row public.treasury_accounts%rowtype;
  normalized_code text := upper(btrim(target_code));
  opening_amount numeric;
  opening_direction text;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  if not public.treasury_can_manage_account(target_school_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'TREASURY_MANAGE_REQUIRED';
  end if;
  if target_account_type not in ('cash', 'bank', 'postal')
    or target_name is null or char_length(btrim(target_name)) not between 2 and 150
    or normalized_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or target_opening_balance is null or abs(target_opening_balance) > 9999999999.99
    or target_opening_date is null
  then
    raise exception using errcode = '22023', message = 'TREASURY_ACCOUNT_INPUT_INVALID';
  end if;

  insert into public.treasury_accounts (
    school_id, branch_id, account_type, name, code, account_reference, created_by
  ) values (
    target_school_id, target_branch_id, target_account_type, btrim(target_name), normalized_code,
    nullif(btrim(target_account_reference), ''), (select auth.uid())
  ) returning * into account_row;
  created_id := account_row.id;

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, new_values, actor_profile_id
  ) values (
    target_school_id, 'account', created_id, 'create',
    jsonb_build_object('account', to_jsonb(account_row), 'opening_balance', target_opening_balance, 'opening_date', target_opening_date),
    (select auth.uid())
  );

  if target_opening_balance <> 0 then
    opening_amount := abs(target_opening_balance);
    opening_direction := case when target_opening_balance > 0 then 'in' else 'out' end;
    insert into public.treasury_movements (
      school_id, account_id, direction, movement_type, amount, movement_date,
      source_type, source_id, notes, actor_profile_id
    ) values (
      target_school_id, created_id, opening_direction, 'opening_balance', opening_amount,
      target_opening_date, 'treasury_account', created_id, 'الرصيد الافتتاحي', (select auth.uid())
    );
  end if;

  return created_id;
end;
$$;

create or replace function public.update_treasury_account(
  target_school_id uuid,
  target_account_id uuid,
  target_name text,
  target_account_reference text,
  target_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.treasury_accounts%rowtype;
  updated_row public.treasury_accounts%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  select * into current_row from public.treasury_accounts
  where school_id = target_school_id and id = target_account_id for update;
  if not found then return false; end if;
  if not public.treasury_can_manage_account(current_row.school_id, current_row.branch_id) then return false; end if;
  if current_row.status = 'archived' then raise exception using errcode = '55000', message = 'TREASURY_ACCOUNT_ARCHIVED'; end if;
  if target_status not in ('active', 'inactive', 'archived')
    or target_name is null or char_length(btrim(target_name)) not between 2 and 150
  then raise exception using errcode = '22023', message = 'TREASURY_ACCOUNT_INPUT_INVALID'; end if;
  if target_status = 'archived'
    and public.treasury_account_balance_internal(current_row.school_id, current_row.id) <> 0
  then raise exception using errcode = '55000', message = 'TREASURY_ACCOUNT_NONZERO_BALANCE'; end if;

  update public.treasury_accounts
  set name = btrim(target_name), account_reference = nullif(btrim(target_account_reference), ''), status = target_status
  where id = current_row.id returning * into updated_row;

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id
  ) values (
    current_row.school_id, 'account', current_row.id,
    case when current_row.status is distinct from updated_row.status then 'status_update' else 'update' end,
    to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid())
  );
  return true;
end;
$$;

create or replace function public.create_other_income(
  target_school_id uuid,
  target_branch_id uuid,
  target_account_id uuid,
  target_category text,
  target_source_description text,
  target_amount numeric,
  target_income_date date,
  target_payment_method text,
  target_reference_number text default null,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  created_row public.other_income%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  if target_category not in ('donation', 'grant_subsidy', 'activity', 'rent_asset', 'other')
    or target_source_description is null or char_length(btrim(target_source_description)) not between 2 and 250
    or target_amount is null or target_amount <= 0 or target_amount > 9999999999.99
    or target_income_date is null
    or target_payment_method not in ('cash', 'bank_transfer', 'postal', 'cheque', 'other')
  then raise exception using errcode = '22023', message = 'OTHER_INCOME_INPUT_INVALID'; end if;

  perform public.validate_treasury_account_for_transaction(
    target_school_id, target_branch_id, target_account_id, true
  );

  insert into public.other_income (
    school_id, branch_id, treasury_account_id, category, source_description, amount,
    income_date, payment_method, reference_number, notes, created_by
  ) values (
    target_school_id, target_branch_id, target_account_id, target_category,
    btrim(target_source_description), target_amount, target_income_date, target_payment_method,
    nullif(btrim(target_reference_number), ''), nullif(btrim(target_notes), ''), (select auth.uid())
  ) returning * into created_row;
  created_id := created_row.id;

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, new_values, actor_profile_id
  ) values (target_school_id, 'other_income', created_id, 'create', to_jsonb(created_row), (select auth.uid()));
  return created_id;
end;
$$;

create or replace function public.reverse_other_income(
  target_school_id uuid,
  target_income_id uuid,
  target_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.other_income%rowtype;
  updated_row public.other_income%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  select * into current_row from public.other_income
  where school_id = target_school_id and id = target_income_id for update;
  if not found then return false; end if;
  if current_row.status <> 'recorded' then raise exception using errcode = '55000', message = 'OTHER_INCOME_NOT_REVERSIBLE'; end if;
  if target_reason is null or char_length(btrim(target_reason)) not between 3 and 250 then
    raise exception using errcode = '22023', message = 'TREASURY_REVERSAL_REASON_REQUIRED';
  end if;
  perform public.validate_treasury_account_for_transaction(
    current_row.school_id, current_row.branch_id, current_row.treasury_account_id, false
  );

  update public.other_income
  set status = 'reversed', reversed_by = (select auth.uid()), reversed_at = now(), reversal_reason = btrim(target_reason)
  where id = current_row.id returning * into updated_row;

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id
  ) values (current_row.school_id, 'other_income', current_row.id, 'reverse', to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

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
  account_row := public.validate_treasury_account_for_transaction(target_school_id, null, target_account_id, true);
  -- Branch accounts use their own branch as transaction scope instead of null.
  if account_row.branch_id is not null then
    account_row := public.validate_treasury_account_for_transaction(target_school_id, account_row.branch_id, target_account_id, true);
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

create or replace function public.reverse_treasury_adjustment(
  target_school_id uuid,
  target_movement_id uuid,
  target_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  movement_row public.treasury_movements%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  select * into movement_row from public.treasury_movements
  where school_id = target_school_id and id = target_movement_id for update;
  if not found then return false; end if;
  if movement_row.status <> 'posted' or movement_row.movement_type not in ('manual_deposit', 'manual_withdrawal') then
    raise exception using errcode = '55000', message = 'TREASURY_ADJUSTMENT_NOT_REVERSIBLE';
  end if;
  if target_reason is null or char_length(btrim(target_reason)) not between 3 and 250 then
    raise exception using errcode = '22023', message = 'TREASURY_REVERSAL_REASON_REQUIRED';
  end if;
  if not public.treasury_can_manage_account(
    target_school_id,
    (select a.branch_id from public.treasury_accounts a where a.school_id = target_school_id and a.id = movement_row.account_id)
  ) then return false; end if;

  update public.treasury_movements
  set status = 'reversed', reversed_by = (select auth.uid()), reversed_at = now(), reversal_reason = btrim(target_reason)
  where id = movement_row.id;

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id
  )
  select target_school_id, 'movement', movement_row.id, 'reverse', to_jsonb(movement_row), to_jsonb(m), (select auth.uid())
  from public.treasury_movements m where m.id = movement_row.id;
  return true;
end;
$$;

create or replace function public.record_treasury_transfer(
  target_school_id uuid,
  target_from_account_id uuid,
  target_to_account_id uuid,
  target_amount numeric,
  target_date date,
  target_reference_number text default null,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_row public.treasury_accounts%rowtype;
  to_row public.treasury_accounts%rowtype;
  transfer_row public.treasury_transfers%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  if target_from_account_id is null or target_to_account_id is null or target_from_account_id = target_to_account_id
    or target_amount is null or target_amount <= 0 or target_date is null
  then raise exception using errcode = '22023', message = 'TREASURY_TRANSFER_INPUT_INVALID'; end if;

  select * into from_row from public.treasury_accounts
  where school_id = target_school_id and id = target_from_account_id for update;
  if not found then raise exception using errcode = '23514', message = 'TREASURY_ACCOUNT_UNAVAILABLE'; end if;
  select * into to_row from public.treasury_accounts
  where school_id = target_school_id and id = target_to_account_id for update;
  if not found then raise exception using errcode = '23514', message = 'TREASURY_ACCOUNT_UNAVAILABLE'; end if;
  if from_row.status <> 'active' or to_row.status <> 'active' then
    raise exception using errcode = '55000', message = 'TREASURY_ACCOUNT_NOT_ACTIVE';
  end if;
  if not public.treasury_can_manage_account(target_school_id, from_row.branch_id)
    or not public.treasury_can_manage_account(target_school_id, to_row.branch_id)
  then raise exception using errcode = '42501', message = 'TREASURY_MANAGE_REQUIRED'; end if;

  insert into public.treasury_transfers (
    school_id, from_account_id, to_account_id, amount, transfer_date,
    reference_number, notes, created_by
  ) values (
    target_school_id, target_from_account_id, target_to_account_id, target_amount, target_date,
    nullif(btrim(target_reference_number), ''), nullif(btrim(target_notes), ''), (select auth.uid())
  ) returning * into transfer_row;

  insert into public.treasury_movements (
    school_id, account_id, direction, movement_type, amount, movement_date,
    source_type, source_id, transfer_id, reference_number, notes, actor_profile_id
  ) values
  (
    target_school_id, target_from_account_id, 'out', 'transfer_out', target_amount, target_date,
    'treasury_transfer', transfer_row.id, transfer_row.id, nullif(btrim(target_reference_number), ''),
    nullif(btrim(target_notes), ''), (select auth.uid())
  ),
  (
    target_school_id, target_to_account_id, 'in', 'transfer_in', target_amount, target_date,
    'treasury_transfer', transfer_row.id, transfer_row.id, nullif(btrim(target_reference_number), ''),
    nullif(btrim(target_notes), ''), (select auth.uid())
  );

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, new_values, actor_profile_id
  ) values (target_school_id, 'transfer', transfer_row.id, 'create', to_jsonb(transfer_row), (select auth.uid()));
  return transfer_row.id;
end;
$$;

create or replace function public.reverse_treasury_transfer(
  target_school_id uuid,
  target_transfer_id uuid,
  target_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_row public.treasury_transfers%rowtype;
  updated_row public.treasury_transfers%rowtype;
  from_branch uuid;
  to_branch uuid;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED'; end if;
  select * into transfer_row from public.treasury_transfers
  where school_id = target_school_id and id = target_transfer_id for update;
  if not found then return false; end if;
  if transfer_row.status <> 'posted' then raise exception using errcode = '55000', message = 'TREASURY_TRANSFER_NOT_REVERSIBLE'; end if;
  if target_reason is null or char_length(btrim(target_reason)) not between 3 and 250 then
    raise exception using errcode = '22023', message = 'TREASURY_REVERSAL_REASON_REQUIRED';
  end if;
  select branch_id into from_branch from public.treasury_accounts where school_id = target_school_id and id = transfer_row.from_account_id;
  select branch_id into to_branch from public.treasury_accounts where school_id = target_school_id and id = transfer_row.to_account_id;
  if not public.treasury_can_manage_account(target_school_id, from_branch)
    or not public.treasury_can_manage_account(target_school_id, to_branch)
  then return false; end if;

  update public.treasury_movements
  set status = 'reversed', reversed_by = (select auth.uid()), reversed_at = now(), reversal_reason = btrim(target_reason)
  where school_id = target_school_id and transfer_id = transfer_row.id and status = 'posted';
  if not found then raise exception using errcode = '55000', message = 'TREASURY_TRANSFER_MOVEMENTS_MISSING'; end if;

  update public.treasury_transfers
  set status = 'reversed', reversed_by = (select auth.uid()), reversed_at = now(), reversal_reason = btrim(target_reason)
  where id = transfer_row.id returning * into updated_row;

  insert into public.treasury_audit_events (
    school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id
  ) values (target_school_id, 'transfer', transfer_row.id, 'reverse', to_jsonb(transfer_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.record_payroll_payment_with_treasury(
  target_school_id uuid,
  target_entry_id uuid,
  target_payment_date date,
  target_payment_method text,
  target_reference_number text default null,
  target_notes text default null,
  target_treasury_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row public.payroll_entries%rowtype;
  locked_period_id uuid;
  period_status text;
  period_month date;
  payment_id uuid;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select e.period_id into locked_period_id
  from public.payroll_entries e
  where e.school_id = target_school_id and e.id = target_entry_id;
  if not found then return null; end if;
  select p.status, p.period_month into period_status, period_month
  from public.payroll_periods p
  where p.school_id = target_school_id and p.id = locked_period_id for update;
  if not found then return null; end if;
  select * into entry_row from public.payroll_entries e
  where e.school_id = target_school_id and e.id = target_entry_id and e.period_id = locked_period_id for update;
  if not found then return null; end if;
  if not public.payroll_can_manage_scope(entry_row.school_id, entry_row.branch_id) then return null; end if;
  if period_status <> 'approved' or entry_row.status <> 'approved' then
    raise exception using errcode = '55000', message = 'PAYROLL_ENTRY_NOT_PAYABLE';
  end if;
  if entry_row.net_amount <= 0 then raise exception using errcode = '22023', message = 'PAYROLL_ZERO_NET_NO_PAYMENT'; end if;
  if target_payment_date is null or target_payment_date < period_month
    or target_payment_method not in ('cash', 'bank_transfer', 'postal', 'cheque', 'other')
  then raise exception using errcode = '22023', message = 'PAYROLL_PAYMENT_INPUT_INVALID'; end if;

  if target_treasury_account_id is not null then
    perform public.validate_treasury_account_for_transaction(
      entry_row.school_id, entry_row.branch_id, target_treasury_account_id, true
    );
  end if;

  insert into public.payroll_payments (
    school_id, branch_id, payroll_entry_id, amount, payment_method, payment_date,
    reference_number, notes, paid_by, treasury_account_id
  ) values (
    entry_row.school_id, entry_row.branch_id, entry_row.id, entry_row.net_amount,
    target_payment_method, target_payment_date, nullif(btrim(target_reference_number), ''),
    nullif(btrim(target_notes), ''), (select auth.uid()), target_treasury_account_id
  ) returning id into payment_id;
  update public.payroll_entries set status = 'paid' where id = entry_row.id;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, new_values, actor_profile_id)
  select entry_row.school_id, 'payment', payment_id, 'pay', to_jsonb(p), (select auth.uid())
  from public.payroll_payments p where p.id = payment_id;
  return payment_id;
end;
$$;

alter table public.treasury_accounts enable row level security;
alter table public.other_income enable row level security;
alter table public.treasury_transfers enable row level security;
alter table public.treasury_movements enable row level security;
alter table public.treasury_audit_events enable row level security;

revoke all on public.treasury_accounts, public.other_income, public.treasury_transfers,
  public.treasury_movements, public.treasury_audit_events from public, anon, authenticated;

revoke all on function public.treasury_can_view_account(uuid, uuid) from public;
revoke all on function public.treasury_can_manage_account(uuid, uuid) from public;
revoke all on function public.treasury_account_balance_internal(uuid, uuid) from public;
revoke all on function public.validate_treasury_account_for_transaction(uuid, uuid, uuid, boolean) from public;
revoke all on function public.sync_treasury_business_movement(uuid, uuid, uuid, text, uuid, text, numeric, date, text, boolean, uuid) from public;
revoke all on function public.validate_payment_treasury_link() from public;
revoke all on function public.sync_payment_treasury_movement() from public;
revoke all on function public.validate_expense_treasury_link() from public;
revoke all on function public.sync_expense_treasury_movement() from public;
revoke all on function public.validate_payroll_payment_treasury_link() from public;
revoke all on function public.sync_payroll_payment_treasury_movement() from public;
revoke all on function public.validate_other_income_treasury_link() from public;
revoke all on function public.sync_other_income_treasury_movement() from public;
revoke all on function public.create_treasury_account(uuid, uuid, text, text, text, text, numeric, date) from public, anon;
revoke all on function public.update_treasury_account(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.create_other_income(uuid, uuid, uuid, text, text, numeric, date, text, text, text) from public, anon;
revoke all on function public.reverse_other_income(uuid, uuid, text) from public, anon;
revoke all on function public.record_treasury_adjustment(uuid, uuid, text, numeric, date, text, text) from public, anon;
revoke all on function public.reverse_treasury_adjustment(uuid, uuid, text) from public, anon;
revoke all on function public.record_treasury_transfer(uuid, uuid, uuid, numeric, date, text, text) from public, anon;
revoke all on function public.reverse_treasury_transfer(uuid, uuid, text) from public, anon;
revoke all on function public.record_payroll_payment_with_treasury(uuid, uuid, date, text, text, text, uuid) from public, anon;

grant execute on function public.create_treasury_account(uuid, uuid, text, text, text, text, numeric, date) to authenticated;
grant execute on function public.update_treasury_account(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.create_other_income(uuid, uuid, uuid, text, text, numeric, date, text, text, text) to authenticated;
grant execute on function public.reverse_other_income(uuid, uuid, text) to authenticated;
grant execute on function public.record_treasury_adjustment(uuid, uuid, text, numeric, date, text, text) to authenticated;
grant execute on function public.reverse_treasury_adjustment(uuid, uuid, text) to authenticated;
grant execute on function public.record_treasury_transfer(uuid, uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.reverse_treasury_transfer(uuid, uuid, text) to authenticated;
grant execute on function public.record_payroll_payment_with_treasury(uuid, uuid, date, text, text, text, uuid) to authenticated;

comment on table public.treasury_accounts is 'Cash, bank, and postal accounts. Current balances are derived from posted treasury movements; there is no mutable balance column.';
comment on table public.other_income is 'First-class non-student income. Reversal preserves the original row and reverses its linked treasury movement.';
comment on table public.treasury_movements is 'Authoritative cash-location ledger. Business movements mirror source transactions for reconciliation and are never counted a second time as income/expense.';
comment on table public.treasury_transfers is 'Atomic internal transfers represented by one posted out movement and one posted in movement; transfers are not revenue or expense.';

commit;