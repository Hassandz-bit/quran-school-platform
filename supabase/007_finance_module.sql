-- Quran School SaaS - finance module
-- Adds tenant-isolated fees, charges, payments, discounts, expenses, permissions, and RLS.

begin;

-- A composite student identity is required by all finance tables so a finance
-- row cannot point to a student in another school or branch.
create unique index if not exists students_school_branch_id_unique_idx
  on public.students (school_id, branch_id, id);

-- Reusable school or branch fee definitions. Plans are archived, never deleted.
create table public.fee_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  name text not null,
  code text not null,
  billing_cycle text not null default 'monthly',
  amount numeric(12, 2) not null,
  currency text not null default 'DZD',
  due_day smallint,
  status text not null default 'active',
  description text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_plans_school_fk
    foreign key (school_id) references public.schools(id),
  constraint fee_plans_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint fee_plans_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint fee_plans_name_length_check
    check (char_length(btrim(name)) between 2 and 150),
  constraint fee_plans_code_format_check
    check (code = upper(code) and code ~ '^[A-Z0-9_]+$'),
  constraint fee_plans_billing_cycle_check
    check (billing_cycle in ('one_time', 'monthly', 'quarterly', 'yearly')),
  constraint fee_plans_amount_check
    check (amount >= 0),
  constraint fee_plans_currency_check
    check (currency = 'DZD'),
  constraint fee_plans_due_day_check
    check (due_day is null or due_day between 1 and 28),
  constraint fee_plans_status_check
    check (status in ('active', 'inactive', 'archived')),
  constraint fee_plans_description_nonblank_check
    check (description is null or btrim(description) <> ''),
  constraint fee_plans_school_code_unique
    unique (school_id, code),
  constraint fee_plans_school_id_id_unique
    unique (school_id, id)
);

comment on table public.fee_plans is
  'School or branch fee definitions; archived status replaces deletion.';
comment on column public.fee_plans.school_id is
  'Tenant boundary; immutable through browser UPDATE privileges.';
comment on column public.fee_plans.branch_id is
  'Optional immutable branch scope constrained to the same school.';
comment on column public.fee_plans.created_by is
  'Profile that created the plan; immutable through browser UPDATE privileges.';

-- Charges are approved amounts for individual students. The generated net
-- amount cannot be supplied or edited by the browser.
create table public.student_charges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  fee_plan_id uuid,
  charge_type text not null default 'fee',
  period_start date,
  period_end date,
  description text not null,
  original_amount numeric(12, 2) not null,
  discount_amount numeric(12, 2) not null default 0,
  net_amount numeric(12, 2)
    generated always as (original_amount - discount_amount) stored,
  due_date date not null,
  status text not null default 'pending',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_charges_school_fk
    foreign key (school_id) references public.schools(id),
  constraint student_charges_student_branch_school_fk
    foreign key (school_id, branch_id, student_id)
    references public.students(school_id, branch_id, id),
  constraint student_charges_fee_plan_school_fk
    foreign key (school_id, fee_plan_id)
    references public.fee_plans(school_id, id),
  constraint student_charges_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint student_charges_type_check
    check (charge_type in ('fee', 'registration', 'materials', 'transport', 'other')),
  constraint student_charges_description_length_check
    check (char_length(btrim(description)) between 2 and 200),
  constraint student_charges_original_amount_check
    check (original_amount >= 0),
  constraint student_charges_discount_amount_check
    check (discount_amount >= 0 and discount_amount <= original_amount),
  constraint student_charges_period_check
    check (
      period_start is null
      or period_end is null
      or period_end >= period_start
    ),
  constraint student_charges_status_check
    check (status in ('pending', 'partially_paid', 'paid', 'waived', 'cancelled')),
  constraint student_charges_school_id_id_unique
    unique (school_id, id),
  constraint student_charges_school_branch_student_id_unique
    unique (school_id, branch_id, student_id, id)
);

comment on table public.student_charges is
  'Approved student amounts, including the actual discount applied to each charge.';
comment on column public.student_charges.net_amount is
  'Stored generated amount equal to original_amount minus discount_amount.';
comment on column public.student_charges.status is
  'Derived from completed payments except for trusted waived and cancelled states.';

-- Payments preserve the complete tenant, branch, student, and charge identity.
-- Accounting reversals use status instead of deletion.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  charge_id uuid not null,
  amount numeric(12, 2) not null,
  payment_method text not null default 'cash',
  payment_date date not null default current_date,
  reference_number text,
  notes text,
  status text not null default 'completed',
  received_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_school_fk
    foreign key (school_id) references public.schools(id),
  constraint payments_student_branch_school_fk
    foreign key (school_id, branch_id, student_id)
    references public.students(school_id, branch_id, id),
  constraint payments_charge_student_branch_school_fk
    foreign key (school_id, branch_id, student_id, charge_id)
    references public.student_charges(school_id, branch_id, student_id, id),
  constraint payments_received_by_fk
    foreign key (received_by) references public.profiles(id),
  constraint payments_amount_check
    check (amount > 0),
  constraint payments_method_check
    check (payment_method in ('cash', 'bank_transfer', 'postal', 'cheque', 'other')),
  constraint payments_reference_number_nonblank_check
    check (reference_number is null or btrim(reference_number) <> ''),
  constraint payments_notes_nonblank_check
    check (notes is null or btrim(notes) <> ''),
  constraint payments_status_check
    check (status in ('completed', 'reversed'))
);

comment on table public.payments is
  'Actual student payments; reversed status preserves the accounting audit trail.';
comment on column public.payments.received_by is
  'Profile that received the payment; immutable through browser UPDATE privileges.';

-- Discount policies are recorded separately from the actual amount applied.
create table public.student_discounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  discount_type text not null,
  value_type text not null,
  value numeric(12, 2) not null,
  reason text not null,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_discounts_school_fk
    foreign key (school_id) references public.schools(id),
  constraint student_discounts_student_branch_school_fk
    foreign key (school_id, branch_id, student_id)
    references public.students(school_id, branch_id, id),
  constraint student_discounts_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint student_discounts_type_check
    check (discount_type in ('sibling', 'needy', 'scholarship', 'staff', 'custom')),
  constraint student_discounts_value_type_check
    check (value_type in ('percentage', 'fixed')),
  constraint student_discounts_value_check
    check (value > 0 and (value_type <> 'percentage' or value <= 100)),
  constraint student_discounts_reason_length_check
    check (char_length(btrim(reason)) between 2 and 250),
  constraint student_discounts_date_check
    check (end_date is null or end_date >= start_date),
  constraint student_discounts_status_check
    check (status in ('active', 'inactive', 'expired', 'archived'))
);

comment on table public.student_discounts is
  'Student discount policies; applying a policy to a charge remains explicit.';

-- School-wide or branch-scoped expenses. Cancelled status replaces deletion.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  category text not null,
  description text not null,
  amount numeric(12, 2) not null,
  expense_date date not null default current_date,
  payment_method text not null default 'cash',
  reference_number text,
  notes text,
  status text not null default 'recorded',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_school_fk
    foreign key (school_id) references public.schools(id),
  constraint expenses_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint expenses_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint expenses_category_check
    check (category in ('salaries', 'rent', 'utilities', 'maintenance', 'supplies', 'transport', 'activities', 'other')),
  constraint expenses_description_length_check
    check (char_length(btrim(description)) between 2 and 250),
  constraint expenses_amount_check
    check (amount > 0),
  constraint expenses_method_check
    check (payment_method in ('cash', 'bank_transfer', 'postal', 'cheque', 'other')),
  constraint expenses_reference_number_nonblank_check
    check (reference_number is null or btrim(reference_number) <> ''),
  constraint expenses_notes_nonblank_check
    check (notes is null or btrim(notes) <> ''),
  constraint expenses_status_check
    check (status in ('recorded', 'cancelled'))
);

comment on table public.expenses is
  'School-wide or branch-scoped expenses; cancelled status replaces deletion.';

-- Tenant-scoped filters and foreign-key lookups.
create index fee_plans_school_status_idx
  on public.fee_plans (school_id, status);
create index fee_plans_school_branch_status_idx
  on public.fee_plans (school_id, branch_id, status);
create index fee_plans_created_by_idx
  on public.fee_plans (created_by);

create index student_charges_school_branch_student_status_idx
  on public.student_charges (school_id, branch_id, student_id, status);
create index student_charges_school_due_date_status_idx
  on public.student_charges (school_id, due_date, status);
create index student_charges_fee_plan_id_idx
  on public.student_charges (school_id, fee_plan_id)
  where fee_plan_id is not null;
create index student_charges_created_by_idx
  on public.student_charges (created_by);

create index payments_school_branch_student_date_idx
  on public.payments (school_id, branch_id, student_id, payment_date);
create index payments_school_charge_status_idx
  on public.payments (school_id, charge_id, status);
create index payments_received_by_idx
  on public.payments (received_by);

create index student_discounts_school_branch_student_status_idx
  on public.student_discounts (school_id, branch_id, student_id, status);
create index student_discounts_school_type_status_idx
  on public.student_discounts (school_id, discount_type, status);
create index student_discounts_created_by_idx
  on public.student_discounts (created_by);

create index expenses_school_date_status_idx
  on public.expenses (school_id, expense_date, status);
create index expenses_school_branch_date_idx
  on public.expenses (school_id, branch_id, expense_date);
create index expenses_created_by_idx
  on public.expenses (created_by);

-- Reuse the existing timestamp function.
create trigger fee_plans_set_updated_at
before update on public.fee_plans
for each row execute function public.set_updated_at();

create trigger student_charges_set_updated_at
before update on public.student_charges
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger student_discounts_set_updated_at
before update on public.student_discounts
for each row execute function public.set_updated_at();

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

-- A branch-specific fee plan may only be applied to a charge in the same branch.
-- School-wide plans have a null branch and may be used by every authorized branch.
create or replace function public.validate_charge_fee_plan_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_branch_id uuid;
begin
  if new.fee_plan_id is null then
    return new;
  end if;

  select plan.branch_id
    into plan_branch_id
  from public.fee_plans as plan
  where plan.school_id = new.school_id
    and plan.id = new.fee_plan_id;

  if not found then
    raise foreign_key_violation
      using message = 'fee plan does not exist in the charge school';
  end if;

  if plan_branch_id is not null and plan_branch_id <> new.branch_id then
    raise check_violation
      using message = 'branch-scoped fee plan must match the student charge branch';
  end if;

  return new;
end;
$$;

create trigger student_charges_validate_fee_plan_scope
before insert or update of school_id, branch_id, fee_plan_id
on public.student_charges
for each row execute function public.validate_charge_fee_plan_scope();

-- Keep every ordinary charge status exactly synchronized with completed payments.
-- Changes that reduce the net amount below money already received are rejected.
create or replace function public.validate_student_charge_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_payment_total numeric;
  calculated_net_amount numeric(12, 2);
  expected_status text;
begin
  calculated_net_amount := new.original_amount - new.discount_amount;

  select coalesce(sum(payment.amount), 0)
    into completed_payment_total
  from public.payments as payment
  where payment.school_id = new.school_id
    and payment.branch_id = new.branch_id
    and payment.student_id = new.student_id
    and payment.charge_id = new.id
    and payment.status = 'completed';

  if completed_payment_total > calculated_net_amount then
    raise check_violation
      using message = 'completed payments cannot exceed the charge net amount';
  end if;

  if tg_op = 'UPDATE'
     and old.status in ('waived', 'cancelled')
     and new.status = old.status
     and (
       new.original_amount is distinct from old.original_amount
       or new.discount_amount is distinct from old.discount_amount
     ) then
    raise check_violation
      using message = 'reactivate an administratively closed charge before changing its amount';
  end if;

  if new.status in ('waived', 'cancelled') then
    if completed_payment_total > 0 then
      raise check_violation
        using message = 'completed payments must be reversed before waiver or cancellation';
    end if;
    return new;
  end if;

  expected_status := case
    when completed_payment_total = 0 then 'pending'
    when completed_payment_total < calculated_net_amount then 'partially_paid'
    when completed_payment_total = calculated_net_amount then 'paid'
    else null
  end;

  if expected_status is null then
    raise check_violation
      using message = 'charge payment state is inconsistent';
  end if;

  new.status := expected_status;
  return new;
end;
$$;

create trigger student_charges_validate_status
before insert or update of status, original_amount, discount_amount
on public.student_charges
for each row execute function public.validate_student_charge_status();

-- Administrative status changes are exposed through one narrow routine.
-- Requesting pending means reactivate and recalculate the correct payment state.
create or replace function public.set_student_charge_administrative_status(
  target_charge_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school_id uuid;
  target_branch_id uuid;
  target_student_id uuid;
  target_net_amount numeric(12, 2);
  completed_payment_total numeric;
  resolved_status text;
begin
  if target_status is null
     or target_status not in ('pending', 'waived', 'cancelled') then
    raise check_violation
      using message = 'only pending, waived, or cancelled are accepted';
  end if;

  select
    charge.school_id,
    charge.branch_id,
    charge.student_id,
    charge.net_amount
  into
    target_school_id,
    target_branch_id,
    target_student_id,
    target_net_amount
  from public.student_charges as charge
  where charge.id = target_charge_id
  for update;

  if not found then
    raise foreign_key_violation
      using message = 'student charge does not exist';
  end if;

  if (select auth.uid()) is null
     or not public.has_branch_permission(
       target_school_id,
       target_branch_id,
       'finance.manage'
     ) then
    raise insufficient_privilege
      using message = 'finance permission is required for this charge';
  end if;

  select coalesce(sum(payment.amount), 0)
    into completed_payment_total
  from public.payments as payment
  where payment.school_id = target_school_id
    and payment.branch_id = target_branch_id
    and payment.student_id = target_student_id
    and payment.charge_id = target_charge_id
    and payment.status = 'completed';

  if completed_payment_total > target_net_amount then
    raise check_violation
      using message = 'completed payments exceed the charge net amount';
  end if;

  if target_status in ('waived', 'cancelled') then
    if completed_payment_total > 0 then
      raise check_violation
        using message = 'reverse completed payments before waiver or cancellation';
    end if;
    resolved_status := target_status;
  else
    resolved_status := case
      when completed_payment_total = 0 then 'pending'
      when completed_payment_total < target_net_amount then 'partially_paid'
      when completed_payment_total = target_net_amount then 'paid'
      else null
    end;
  end if;

  if resolved_status is null then
    raise check_violation
      using message = 'charge payment state is inconsistent';
  end if;

  update public.student_charges as charge
  set status = resolved_status
  where charge.school_id = target_school_id
    and charge.branch_id = target_branch_id
    and charge.student_id = target_student_id
    and charge.id = target_charge_id;
end;
$$;

-- Recalculate one open charge while locking it so concurrent payments cannot
-- leave a stale or overpaid state.
create or replace function public.refresh_student_charge_status(
  target_charge_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school_id uuid;
  target_branch_id uuid;
  target_student_id uuid;
  current_charge_status text;
  target_net_amount numeric(12, 2);
  completed_payment_total numeric;
  refreshed_status text;
begin
  select
    charge.school_id,
    charge.branch_id,
    charge.student_id,
    charge.status,
    charge.net_amount
  into
    target_school_id,
    target_branch_id,
    target_student_id,
    current_charge_status,
    target_net_amount
  from public.student_charges as charge
  where charge.id = target_charge_id
  for update;

  if not found then
    raise foreign_key_violation
      using message = 'student charge does not exist';
  end if;

  if (select auth.uid()) is not null
     and not public.has_branch_permission(
       target_school_id,
       target_branch_id,
       'finance.manage'
     ) then
    raise insufficient_privilege
      using message = 'finance permission is required for this charge';
  end if;

  if current_charge_status in ('waived', 'cancelled') then
    return;
  end if;

  select coalesce(sum(payment.amount), 0)
    into completed_payment_total
  from public.payments as payment
  where payment.school_id = target_school_id
    and payment.branch_id = target_branch_id
    and payment.student_id = target_student_id
    and payment.charge_id = target_charge_id
    and payment.status = 'completed';

  if completed_payment_total > target_net_amount then
    raise check_violation
      using message = 'completed payments cannot exceed the charge net amount';
  end if;

  refreshed_status := case
    when completed_payment_total = 0 then 'pending'
    when completed_payment_total < target_net_amount then 'partially_paid'
    when completed_payment_total = target_net_amount then 'paid'
    else null
  end;

  if refreshed_status is null then
    raise check_violation
      using message = 'charge payment state is inconsistent';
  end if;

  update public.student_charges as charge
  set status = refreshed_status
  where charge.school_id = target_school_id
    and charge.branch_id = target_branch_id
    and charge.student_id = target_student_id
    and charge.id = target_charge_id
    and charge.status not in ('waived', 'cancelled')
    and charge.status is distinct from refreshed_status;
end;
$$;

-- Serialize payments per charge and prevent overpayment before data is written.
create or replace function public.validate_payment_against_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge_net_amount numeric(12, 2);
  charge_status text;
  other_completed_total numeric;
  expected_completed_total numeric;
begin
  select charge.net_amount, charge.status
    into charge_net_amount, charge_status
  from public.student_charges as charge
  where charge.school_id = new.school_id
    and charge.branch_id = new.branch_id
    and charge.student_id = new.student_id
    and charge.id = new.charge_id
  for update;

  if not found then
    raise foreign_key_violation
      using message = 'payment charge does not exist for the same student and branch';
  end if;

  select coalesce(sum(payment.amount), 0)
    into other_completed_total
  from public.payments as payment
  where payment.school_id = new.school_id
    and payment.branch_id = new.branch_id
    and payment.student_id = new.student_id
    and payment.charge_id = new.charge_id
    and payment.status = 'completed'
    and payment.id <> new.id;

  if new.status = 'completed' then
    if charge_status in ('waived', 'cancelled') then
      raise check_violation
        using message = 'completed payments are not allowed on waived or cancelled charges';
    end if;
    expected_completed_total := other_completed_total + new.amount;
  else
    expected_completed_total := other_completed_total;
  end if;

  if expected_completed_total > charge_net_amount then
    raise check_violation
      using message = 'payment would exceed the remaining charge balance';
  end if;

  return new;
end;
$$;

create trigger payments_validate_against_charge
before insert or update of amount, status, school_id, branch_id, student_id, charge_id
on public.payments
for each row execute function public.validate_payment_against_charge();

create or replace function public.refresh_student_charge_status_from_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.charge_id is distinct from new.charge_id then
    perform public.refresh_student_charge_status(old.charge_id);
  end if;

  perform public.refresh_student_charge_status(new.charge_id);
  return new;
end;
$$;

create trigger payments_refresh_student_charge_status
after insert or update of amount, status, school_id, branch_id, student_id, charge_id
on public.payments
for each row execute function public.refresh_student_charge_status_from_payment();

-- Trigger functions are never callable directly from browser roles.
revoke all on function public.validate_charge_fee_plan_scope()
from public, anon, authenticated;
revoke all on function public.validate_student_charge_status()
from public, anon, authenticated;
revoke all on function public.validate_payment_against_charge()
from public, anon, authenticated;
revoke all on function public.refresh_student_charge_status(uuid)
from public, anon, authenticated;
revoke all on function public.refresh_student_charge_status_from_payment()
from public, anon, authenticated;
revoke all on function public.set_student_charge_administrative_status(uuid, text)
from public, anon, authenticated;

grant execute on function public.set_student_charge_administrative_status(uuid, text)
to authenticated;

-- Global finance permissions without fixed identifiers.
insert into public.permissions (code, module, name_ar, description)
values
  (
    'finance.view',
    'finance',
    'عرض المالية',
    'عرض الرسوم والاستحقاقات والدفعات والخصومات والمصروفات المصرح بها'
  ),
  (
    'finance.manage',
    'finance',
    'إدارة المالية',
    'إدارة خطط الرسوم والاستحقاقات والدفعات والخصومات'
  ),
  (
    'finance.expenses',
    'finance',
    'إدارة المصروفات',
    'تسجيل المصروفات وتعديلها وإلغاؤها محاسبيًا'
  )
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'finance.view'),
    ('school_admin', 'finance.manage'),
    ('school_admin', 'finance.expenses'),
    ('finance_officer', 'finance.view'),
    ('finance_officer', 'finance.manage'),
    ('finance_officer', 'finance.expenses'),
    ('branch_manager', 'finance.view'),
    ('branch_manager', 'finance.manage'),
    ('branch_manager', 'finance.expenses')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

-- Browser access is deny-by-default, with RLS and explicit column privileges.
alter table public.fee_plans enable row level security;
alter table public.student_charges enable row level security;
alter table public.payments enable row level security;
alter table public.student_discounts enable row level security;
alter table public.expenses enable row level security;

revoke all on
  public.fee_plans,
  public.student_charges,
  public.payments,
  public.student_discounts,
  public.expenses
from public, anon, authenticated;

grant select on public.fee_plans to authenticated;
grant insert (
  school_id,
  branch_id,
  name,
  code,
  billing_cycle,
  amount,
  currency,
  due_day,
  status,
  description
) on public.fee_plans to authenticated;
grant update (
  name,
  code,
  billing_cycle,
  amount,
  currency,
  due_day,
  status,
  description
) on public.fee_plans to authenticated;

grant select on public.student_charges to authenticated;
grant insert (
  school_id,
  branch_id,
  student_id,
  fee_plan_id,
  charge_type,
  period_start,
  period_end,
  description,
  original_amount,
  discount_amount,
  due_date
) on public.student_charges to authenticated;
grant update (
  fee_plan_id,
  charge_type,
  period_start,
  period_end,
  description,
  original_amount,
  discount_amount,
  due_date
) on public.student_charges to authenticated;

grant select on public.payments to authenticated;
grant insert (
  school_id,
  branch_id,
  student_id,
  charge_id,
  amount,
  payment_method,
  payment_date,
  reference_number,
  notes
) on public.payments to authenticated;
grant update (
  status,
  notes,
  reference_number
) on public.payments to authenticated;

grant select on public.student_discounts to authenticated;
grant insert (
  school_id,
  branch_id,
  student_id,
  discount_type,
  value_type,
  value,
  reason,
  start_date,
  end_date,
  status
) on public.student_discounts to authenticated;
grant update (
  discount_type,
  value_type,
  value,
  reason,
  start_date,
  end_date,
  status
) on public.student_discounts to authenticated;

grant select on public.expenses to authenticated;
grant insert (
  school_id,
  branch_id,
  category,
  description,
  amount,
  expense_date,
  payment_method,
  reference_number,
  notes,
  status
) on public.expenses to authenticated;
grant update (
  branch_id,
  category,
  description,
  amount,
  expense_date,
  payment_method,
  reference_number,
  notes,
  status
) on public.expenses to authenticated;

-- Fee plans: school-wide rows require school permission; branch rows require
-- permission for their exact immutable branch.
create policy fee_plans_select_authorized on public.fee_plans
for select to authenticated
using (
  (
    branch_id is null
    and (
      public.has_school_permission(school_id, 'finance.view')
      or public.has_school_permission(school_id, 'finance.manage')
    )
  )
  or
  (
    branch_id is not null
    and (
      public.has_branch_permission(school_id, branch_id, 'finance.view')
      or public.has_branch_permission(school_id, branch_id, 'finance.manage')
    )
  )
);

create policy fee_plans_insert_authorized on public.fee_plans
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (
      branch_id is null
      and public.has_school_permission(school_id, 'finance.manage')
    )
    or
    (
      branch_id is not null
      and public.has_branch_permission(school_id, branch_id, 'finance.manage')
    )
  )
);

create policy fee_plans_update_authorized on public.fee_plans
for update to authenticated
using (
  (
    branch_id is null
    and public.has_school_permission(school_id, 'finance.manage')
  )
  or
  (
    branch_id is not null
    and public.has_branch_permission(school_id, branch_id, 'finance.manage')
  )
)
with check (
  (
    branch_id is null
    and public.has_school_permission(school_id, 'finance.manage')
  )
  or
  (
    branch_id is not null
    and public.has_branch_permission(school_id, branch_id, 'finance.manage')
  )
);

-- Student charges: every operation remains inside one permitted branch.
create policy student_charges_select_authorized on public.student_charges
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.view')
);

create policy student_charges_insert_authorized on public.student_charges
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

create policy student_charges_update_authorized on public.student_charges
for update to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
)
with check (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

-- Payments: immutable composite keys prevent moving a payment between tenants,
-- branches, students, or charges.
create policy payments_select_authorized on public.payments
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.view')
);

create policy payments_insert_authorized on public.payments
for insert to authenticated
with check (
  received_by = (select auth.uid())
  and public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

create policy payments_update_authorized on public.payments
for update to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
)
with check (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

-- Discount policies stay permanently attached to the original student/branch.
create policy student_discounts_select_authorized on public.student_discounts
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.view')
);

create policy student_discounts_insert_authorized on public.student_discounts
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

create policy student_discounts_update_authorized on public.student_discounts
for update to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
)
with check (
  public.has_branch_permission(school_id, branch_id, 'finance.manage')
);

-- Expenses: school-wide rows use school permission; branch rows remain scoped.
create policy expenses_select_authorized on public.expenses
for select to authenticated
using (
  (
    branch_id is null
    and public.has_school_permission(school_id, 'finance.view')
  )
  or
  (
    branch_id is not null
    and public.has_branch_permission(school_id, branch_id, 'finance.view')
  )
);

create policy expenses_insert_authorized on public.expenses
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (
      branch_id is null
      and public.has_school_permission(school_id, 'finance.expenses')
    )
    or
    (
      branch_id is not null
      and public.has_branch_permission(school_id, branch_id, 'finance.expenses')
    )
  )
);

create policy expenses_update_authorized on public.expenses
for update to authenticated
using (
  (
    branch_id is null
    and public.has_school_permission(school_id, 'finance.expenses')
  )
  or
  (
    branch_id is not null
    and public.has_branch_permission(school_id, branch_id, 'finance.expenses')
  )
)
with check (
  (
    branch_id is null
    and public.has_school_permission(school_id, 'finance.expenses')
  )
  or
  (
    branch_id is not null
    and public.has_branch_permission(school_id, branch_id, 'finance.expenses')
  )
);

-- No finance table has a browser DELETE grant or DELETE policy.

commit;
