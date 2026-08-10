-- QuranOS V2 - official payment and registration receipts
-- Receipt numbers are allocated only on first explicit issuance, then remain
-- stable for every reprint. Tables are private; authenticated access is RPC-only.

begin;

create unique index if not exists payments_school_branch_student_id_unique_idx
  on public.payments (school_id, branch_id, student_id, id);

create unique index if not exists student_charges_school_branch_student_id_unique_idx
  on public.student_charges (school_id, branch_id, student_id, id);

create table public.official_receipt_counters (
  school_id uuid primary key references public.schools(id) on delete cascade,
  last_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint official_receipt_counters_nonnegative_check
    check (last_sequence >= 0)
);

create table public.official_receipts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  receipt_type text not null,
  sequence_number bigint not null,
  receipt_number text not null,
  payment_id uuid,
  charge_id uuid,
  enrollment_start_date date,
  school_name text not null,
  branch_name text not null,
  student_name text not null,
  guardian_name text,
  issuer_name text not null,
  charge_type text,
  description text,
  amount numeric(12, 2),
  currency text not null default 'DZD',
  payment_method text,
  payment_date date,
  payment_reference text,
  receipt_status text not null default 'issued',
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  reversed_at timestamptz,
  constraint official_receipts_school_fk
    foreign key (school_id) references public.schools(id),
  constraint official_receipts_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint official_receipts_student_scope_fk
    foreign key (school_id, branch_id, student_id)
    references public.students(school_id, branch_id, id),
  constraint official_receipts_payment_scope_fk
    foreign key (school_id, branch_id, student_id, payment_id)
    references public.payments(school_id, branch_id, student_id, id),
  constraint official_receipts_charge_scope_fk
    foreign key (school_id, branch_id, student_id, charge_id)
    references public.student_charges(school_id, branch_id, student_id, id),
  constraint official_receipts_issued_by_fk
    foreign key (issued_by) references public.profiles(id),
  constraint official_receipts_type_check
    check (receipt_type in ('payment', 'registration')),
  constraint official_receipts_sequence_positive_check
    check (sequence_number > 0),
  constraint official_receipts_number_format_check
    check (receipt_number ~ '^QOS-[0-9]{8,}$'),
  constraint official_receipts_snapshot_names_check
    check (
      char_length(btrim(school_name)) between 2 and 150
      and char_length(btrim(branch_name)) between 2 and 150
      and char_length(btrim(student_name)) between 2 and 220
      and char_length(btrim(issuer_name)) between 2 and 150
      and (guardian_name is null or btrim(guardian_name) <> '')
    ),
  constraint official_receipts_currency_check
    check (currency = 'DZD'),
  constraint official_receipts_status_check
    check (receipt_status in ('issued', 'reversed')),
  constraint official_receipts_reversed_at_check
    check (
      (receipt_status = 'issued' and reversed_at is null)
      or (receipt_status = 'reversed' and reversed_at is not null)
    ),
  constraint official_receipts_payment_shape_check
    check (
      receipt_type <> 'payment'
      or (
        payment_id is not null
        and charge_id is not null
        and enrollment_start_date is null
        and charge_type in ('fee', 'registration', 'materials', 'transport', 'other')
        and amount is not null
        and amount > 0
        and payment_method in ('cash', 'bank_transfer', 'postal', 'cheque', 'other')
        and payment_date is not null
      )
    ),
  constraint official_receipts_registration_shape_check
    check (
      receipt_type <> 'registration'
      or (
        payment_id is null
        and charge_id is null
        and enrollment_start_date is not null
        and charge_type is null
        and amount is null
        and payment_method is null
        and payment_date is null
        and payment_reference is null
        and receipt_status = 'issued'
        and reversed_at is null
      )
    ),
  constraint official_receipts_school_sequence_unique
    unique (school_id, sequence_number),
  constraint official_receipts_school_number_unique
    unique (school_id, receipt_number)
);

create unique index official_receipts_payment_once_idx
  on public.official_receipts (payment_id)
  where payment_id is not null;

create unique index official_receipts_registration_once_idx
  on public.official_receipts (school_id, student_id, enrollment_start_date)
  where receipt_type = 'registration';

create index official_receipts_school_issued_idx
  on public.official_receipts (school_id, issued_at desc);
create index official_receipts_school_branch_type_idx
  on public.official_receipts (school_id, branch_id, receipt_type, issued_at desc);
create index official_receipts_student_idx
  on public.official_receipts (school_id, student_id, issued_at desc);

alter table public.official_receipt_counters enable row level security;
alter table public.official_receipts enable row level security;

revoke all on table public.official_receipt_counters, public.official_receipts
from public, anon, authenticated;

create or replace function public.allocate_official_receipt_sequence(
  target_school_id uuid
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  allocated_sequence bigint;
begin
  if target_school_id is null or not exists (
    select 1 from public.schools as school
    where school.id = target_school_id and school.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'receipt school unavailable';
  end if;

  insert into public.official_receipt_counters (school_id, last_sequence)
  values (target_school_id, 1)
  on conflict (school_id) do update
    set last_sequence = public.official_receipt_counters.last_sequence + 1,
        updated_at = now()
  returning last_sequence into allocated_sequence;

  return allocated_sequence;
end;
$$;

revoke all on function public.allocate_official_receipt_sequence(uuid)
from public, anon, authenticated;

create or replace function public.receipt_record_is_active_demo(
  target_school_id uuid,
  target_entity_type text,
  target_record_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demo_seed_records as record
    join public.demo_seed_batches as batch
      on batch.id = record.batch_id
     and batch.school_id = record.school_id
    where record.school_id = target_school_id
      and record.entity_type = target_entity_type
      and record.record_id = target_record_id
      and batch.status = 'active'
  );
$$;

revoke all on function public.receipt_record_is_active_demo(uuid, text, uuid)
from public, anon, authenticated;

create or replace function public.issue_payment_receipt(target_payment_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  payment_row record;
  existing_receipt_id uuid;
  new_receipt_id uuid;
  next_sequence bigint;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select
    payment.id,
    payment.school_id,
    payment.branch_id,
    payment.student_id,
    payment.charge_id,
    payment.amount,
    payment.payment_method,
    payment.payment_date,
    payment.reference_number,
    payment.status,
    school.name as school_name,
    branch.name as branch_name,
    concat_ws(' ', student.first_name, student.last_name) as student_name,
    student.guardian_name,
    charge.charge_type,
    charge.description,
    issuer.full_name as issuer_name
  into payment_row
  from public.payments as payment
  join public.schools as school on school.id = payment.school_id
  join public.branches as branch
    on branch.school_id = payment.school_id and branch.id = payment.branch_id
  join public.students as student
    on student.school_id = payment.school_id
   and student.branch_id = payment.branch_id
   and student.id = payment.student_id
  join public.student_charges as charge
    on charge.school_id = payment.school_id
   and charge.branch_id = payment.branch_id
   and charge.student_id = payment.student_id
   and charge.id = payment.charge_id
  join public.profiles as issuer on issuer.id = actor_id
  where payment.id = target_payment_id
  for update of payment;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment unavailable';
  end if;

  if not public.has_branch_permission(
    payment_row.school_id,
    payment_row.branch_id,
    'finance.manage'
  ) then
    raise exception using errcode = '42501', message = 'receipt issue denied';
  end if;

  select receipt.id into existing_receipt_id
  from public.official_receipts as receipt
  where receipt.payment_id = payment_row.id;

  if existing_receipt_id is not null then
    return existing_receipt_id;
  end if;

  if public.receipt_record_is_active_demo(
       payment_row.school_id, 'payment', payment_row.id
     )
     or public.receipt_record_is_active_demo(
       payment_row.school_id, 'student', payment_row.student_id
     ) then
    raise exception using errcode = 'P0001', message = 'official_receipt_demo_record';
  end if;

  next_sequence := public.allocate_official_receipt_sequence(payment_row.school_id);

  insert into public.official_receipts (
    school_id,
    branch_id,
    student_id,
    receipt_type,
    sequence_number,
    receipt_number,
    payment_id,
    charge_id,
    school_name,
    branch_name,
    student_name,
    guardian_name,
    issuer_name,
    charge_type,
    description,
    amount,
    payment_method,
    payment_date,
    payment_reference,
    receipt_status,
    issued_by,
    reversed_at
  ) values (
    payment_row.school_id,
    payment_row.branch_id,
    payment_row.student_id,
    'payment',
    next_sequence,
    'QOS-' || lpad(next_sequence::text, 8, '0'),
    payment_row.id,
    payment_row.charge_id,
    payment_row.school_name,
    payment_row.branch_name,
    payment_row.student_name,
    payment_row.guardian_name,
    payment_row.issuer_name,
    payment_row.charge_type,
    payment_row.description,
    payment_row.amount,
    payment_row.payment_method,
    payment_row.payment_date,
    payment_row.reference_number,
    case when payment_row.status = 'reversed' then 'reversed' else 'issued' end,
    actor_id,
    case when payment_row.status = 'reversed' then now() else null end
  )
  returning id into new_receipt_id;

  return new_receipt_id;
end;
$$;

revoke all on function public.issue_payment_receipt(uuid)
from public, anon;
grant execute on function public.issue_payment_receipt(uuid) to authenticated;

create or replace function public.issue_registration_receipt(target_student_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  student_row record;
  existing_receipt_id uuid;
  new_receipt_id uuid;
  next_sequence bigint;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select
    student.id,
    student.school_id,
    student.branch_id,
    student.start_date,
    concat_ws(' ', student.first_name, student.last_name) as student_name,
    student.guardian_name,
    school.name as school_name,
    branch.name as branch_name,
    issuer.full_name as issuer_name
  into student_row
  from public.students as student
  join public.schools as school on school.id = student.school_id
  join public.branches as branch
    on branch.school_id = student.school_id and branch.id = student.branch_id
  join public.profiles as issuer on issuer.id = actor_id
  where student.id = target_student_id
  for update of student;

  if not found then
    raise exception using errcode = 'P0002', message = 'student unavailable';
  end if;

  if not public.has_branch_permission(
    student_row.school_id,
    student_row.branch_id,
    'students.manage'
  ) then
    raise exception using errcode = '42501', message = 'receipt issue denied';
  end if;

  select receipt.id into existing_receipt_id
  from public.official_receipts as receipt
  where receipt.school_id = student_row.school_id
    and receipt.student_id = student_row.id
    and receipt.receipt_type = 'registration'
    and receipt.enrollment_start_date = student_row.start_date;

  if existing_receipt_id is not null then
    return existing_receipt_id;
  end if;

  if public.receipt_record_is_active_demo(
    student_row.school_id, 'student', student_row.id
  ) then
    raise exception using errcode = 'P0001', message = 'official_receipt_demo_record';
  end if;

  next_sequence := public.allocate_official_receipt_sequence(student_row.school_id);

  insert into public.official_receipts (
    school_id,
    branch_id,
    student_id,
    receipt_type,
    sequence_number,
    receipt_number,
    enrollment_start_date,
    school_name,
    branch_name,
    student_name,
    guardian_name,
    issuer_name,
    issued_by
  ) values (
    student_row.school_id,
    student_row.branch_id,
    student_row.id,
    'registration',
    next_sequence,
    'QOS-' || lpad(next_sequence::text, 8, '0'),
    student_row.start_date,
    student_row.school_name,
    student_row.branch_name,
    student_row.student_name,
    student_row.guardian_name,
    student_row.issuer_name,
    actor_id
  )
  returning id into new_receipt_id;

  return new_receipt_id;
end;
$$;

revoke all on function public.issue_registration_receipt(uuid)
from public, anon;
grant execute on function public.issue_registration_receipt(uuid) to authenticated;

create or replace function public.sync_payment_receipt_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'completed' and new.status = 'reversed' then
    update public.official_receipts as receipt
    set receipt_status = 'reversed',
        reversed_at = coalesce(receipt.reversed_at, now())
    where receipt.payment_id = new.id
      and receipt.receipt_type = 'payment';
  end if;

  return new;
end;
$$;

create trigger payments_sync_official_receipt_reversal
after update of status on public.payments
for each row execute function public.sync_payment_receipt_reversal();

revoke all on function public.sync_payment_receipt_reversal()
from public, anon, authenticated;

create or replace function public.get_official_receipt(target_receipt_id uuid)
returns table (
  receipt_id uuid,
  school_id uuid,
  branch_id uuid,
  student_id uuid,
  receipt_type text,
  sequence_number bigint,
  receipt_number text,
  payment_id uuid,
  charge_id uuid,
  enrollment_start_date date,
  school_name text,
  branch_name text,
  student_name text,
  guardian_name text,
  issuer_name text,
  charge_type text,
  description text,
  amount numeric,
  currency text,
  payment_method text,
  payment_date date,
  payment_reference text,
  receipt_status text,
  issued_at timestamptz,
  reversed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  return query
  select
    receipt.id,
    receipt.school_id,
    receipt.branch_id,
    receipt.student_id,
    receipt.receipt_type,
    receipt.sequence_number,
    receipt.receipt_number,
    receipt.payment_id,
    receipt.charge_id,
    receipt.enrollment_start_date,
    receipt.school_name,
    receipt.branch_name,
    receipt.student_name,
    receipt.guardian_name,
    receipt.issuer_name,
    receipt.charge_type,
    receipt.description,
    receipt.amount,
    receipt.currency,
    receipt.payment_method,
    receipt.payment_date,
    receipt.payment_reference,
    receipt.receipt_status,
    receipt.issued_at,
    receipt.reversed_at
  from public.official_receipts as receipt
  where receipt.id = target_receipt_id
    and (
      (
        receipt.receipt_type = 'payment'
        and (
          public.has_branch_permission(receipt.school_id, receipt.branch_id, 'finance.view')
          or public.has_branch_permission(receipt.school_id, receipt.branch_id, 'finance.manage')
        )
      )
      or (
        receipt.receipt_type = 'registration'
        and public.has_branch_permission(receipt.school_id, receipt.branch_id, 'students.manage')
      )
    );
end;
$$;

revoke all on function public.get_official_receipt(uuid)
from public, anon;
grant execute on function public.get_official_receipt(uuid) to authenticated;

create or replace function public.list_my_official_receipts(
  target_school_id uuid,
  target_limit integer default 200
)
returns table (
  receipt_id uuid,
  receipt_type text,
  receipt_number text,
  student_id uuid,
  student_name text,
  branch_id uuid,
  branch_name text,
  description text,
  amount numeric,
  receipt_status text,
  issued_at timestamptz,
  payment_id uuid,
  enrollment_start_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.current_profile_is_active()
     or target_school_id is null
     or target_limit is null
     or target_limit < 1
     or target_limit > 500 then
    raise exception using errcode = '42501', message = 'receipt list denied';
  end if;

  return query
  select
    receipt.id,
    receipt.receipt_type,
    receipt.receipt_number,
    receipt.student_id,
    receipt.student_name,
    receipt.branch_id,
    receipt.branch_name,
    receipt.description,
    receipt.amount,
    receipt.receipt_status,
    receipt.issued_at,
    receipt.payment_id,
    receipt.enrollment_start_date
  from public.official_receipts as receipt
  where receipt.school_id = target_school_id
    and (
      (
        receipt.receipt_type = 'payment'
        and (
          public.has_branch_permission(receipt.school_id, receipt.branch_id, 'finance.view')
          or public.has_branch_permission(receipt.school_id, receipt.branch_id, 'finance.manage')
        )
      )
      or (
        receipt.receipt_type = 'registration'
        and public.has_branch_permission(receipt.school_id, receipt.branch_id, 'students.manage')
      )
    )
  order by receipt.issued_at desc, receipt.sequence_number desc
  limit target_limit;
end;
$$;

revoke all on function public.list_my_official_receipts(uuid, integer)
from public, anon;
grant execute on function public.list_my_official_receipts(uuid, integer)
to authenticated;

create or replace function public.get_official_receipt_access(target_school_id uuid)
returns table (
  can_view_payment_receipts boolean,
  can_issue_payment_receipts boolean,
  can_issue_registration_receipts boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and (
          public.has_branch_permission(target_school_id, branch.id, 'finance.view')
          or public.has_branch_permission(target_school_id, branch.id, 'finance.manage')
        )
    ),
    exists (
      select 1
      from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and public.has_branch_permission(target_school_id, branch.id, 'finance.manage')
    ),
    exists (
      select 1
      from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and public.has_branch_permission(target_school_id, branch.id, 'students.manage')
    )
  where (select auth.uid()) is not null
    and public.current_profile_is_active()
    and target_school_id is not null;
$$;

revoke all on function public.get_official_receipt_access(uuid)
from public, anon;
grant execute on function public.get_official_receipt_access(uuid)
to authenticated;

create or replace function public.list_registration_receipt_students(
  target_school_id uuid
)
returns table (
  student_id uuid,
  branch_id uuid,
  student_name text,
  guardian_name text,
  enrollment_start_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or target_school_id is null
     or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'registration receipt list denied';
  end if;

  return query
  select
    student.id,
    student.branch_id,
    concat_ws(' ', student.first_name, student.last_name),
    student.guardian_name,
    student.start_date
  from public.students as student
  where student.school_id = target_school_id
    and public.has_branch_permission(
      student.school_id,
      student.branch_id,
      'students.manage'
    )
  order by student.last_name, student.first_name, student.id;
end;
$$;

revoke all on function public.list_registration_receipt_students(uuid)
from public, anon;
grant execute on function public.list_registration_receipt_students(uuid)
to authenticated;

commit;
