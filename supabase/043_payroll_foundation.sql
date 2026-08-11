-- Quran School SaaS - payroll foundation
-- V2 review migration only. Do not apply to Production manually.
-- Adds effective-dated compensation, monthly payroll periods, audited payroll entries,
-- reversible payroll payments, and RPC-only browser access.

begin;

create table public.payroll_compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  payee_kind text not null,
  teacher_id uuid,
  membership_id uuid,
  base_amount numeric(12,2) not null,
  currency text not null default 'DZD',
  effective_from date not null,
  effective_to date,
  status text not null default 'active',
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_comp_school_fk foreign key (school_id) references public.schools(id),
  constraint payroll_comp_branch_school_fk foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint payroll_comp_teacher_school_fk foreign key (school_id, teacher_id) references public.teachers(school_id, id),
  constraint payroll_comp_membership_school_fk foreign key (school_id, membership_id) references public.school_memberships(school_id, id),
  constraint payroll_comp_created_by_fk foreign key (created_by) references public.profiles(id),
  constraint payroll_comp_payee_kind_check check (payee_kind in ('teacher', 'member')),
  constraint payroll_comp_exact_payee_check check (
    (payee_kind = 'teacher' and teacher_id is not null and membership_id is null)
    or (payee_kind = 'member' and membership_id is not null and teacher_id is null)
  ),
  constraint payroll_comp_amount_check check (base_amount > 0),
  constraint payroll_comp_currency_check check (currency = 'DZD'),
  constraint payroll_comp_dates_check check (effective_to is null or effective_to >= effective_from),
  constraint payroll_comp_status_check check (status in ('active', 'inactive', 'archived')),
  constraint payroll_comp_notes_check check (notes is null or btrim(notes) <> ''),
  constraint payroll_comp_school_id_id_unique unique (school_id, id)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  period_month date not null,
  status text not null default 'draft',
  notes text,
  created_by uuid not null default auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  closed_by uuid,
  closed_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_period_school_fk foreign key (school_id) references public.schools(id),
  constraint payroll_period_branch_school_fk foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint payroll_period_created_by_fk foreign key (created_by) references public.profiles(id),
  constraint payroll_period_approved_by_fk foreign key (approved_by) references public.profiles(id),
  constraint payroll_period_closed_by_fk foreign key (closed_by) references public.profiles(id),
  constraint payroll_period_cancelled_by_fk foreign key (cancelled_by) references public.profiles(id),
  constraint payroll_period_month_check check (period_month = date_trunc('month', period_month)::date),
  constraint payroll_period_status_check check (status in ('draft', 'approved', 'closed', 'cancelled')),
  constraint payroll_period_notes_check check (notes is null or btrim(notes) <> ''),
  constraint payroll_period_school_id_id_unique unique (school_id, id)
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  period_id uuid not null,
  compensation_profile_id uuid not null,
  payee_kind text not null,
  teacher_id uuid,
  membership_id uuid,
  payee_name_snapshot text not null,
  payee_role_snapshot text,
  base_amount numeric(12,2) not null,
  additions numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  advances numeric(12,2) not null default 0,
  net_amount numeric(12,2) generated always as
    (base_amount + additions - deductions - advances) stored,
  status text not null default 'draft',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_entry_school_fk foreign key (school_id) references public.schools(id),
  constraint payroll_entry_branch_school_fk foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint payroll_entry_period_school_fk foreign key (school_id, period_id) references public.payroll_periods(school_id, id),
  constraint payroll_entry_comp_school_fk foreign key (school_id, compensation_profile_id) references public.payroll_compensation_profiles(school_id, id),
  constraint payroll_entry_teacher_school_fk foreign key (school_id, teacher_id) references public.teachers(school_id, id),
  constraint payroll_entry_membership_school_fk foreign key (school_id, membership_id) references public.school_memberships(school_id, id),
  constraint payroll_entry_created_by_fk foreign key (created_by) references public.profiles(id),
  constraint payroll_entry_payee_kind_check check (payee_kind in ('teacher', 'member')),
  constraint payroll_entry_exact_payee_check check (
    (payee_kind = 'teacher' and teacher_id is not null and membership_id is null)
    or (payee_kind = 'member' and membership_id is not null and teacher_id is null)
  ),
  constraint payroll_entry_payee_name_check check (char_length(btrim(payee_name_snapshot)) between 2 and 150),
  constraint payroll_entry_role_check check (payee_role_snapshot is null or btrim(payee_role_snapshot) <> ''),
  constraint payroll_entry_amounts_check check (
    base_amount > 0 and additions >= 0 and deductions >= 0 and advances >= 0
    and base_amount + additions - deductions - advances >= 0
  ),
  constraint payroll_entry_status_check check (status in ('draft', 'approved', 'paid', 'cancelled')),
  constraint payroll_entry_period_comp_unique unique (period_id, compensation_profile_id),
  constraint payroll_entry_school_id_id_unique unique (school_id, id)
);

create table public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid,
  payroll_entry_id uuid not null,
  amount numeric(12,2) not null,
  payment_method text not null default 'cash',
  payment_date date not null default current_date,
  reference_number text,
  notes text,
  status text not null default 'completed',
  paid_by uuid not null default auth.uid(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_payment_school_fk foreign key (school_id) references public.schools(id),
  constraint payroll_payment_branch_school_fk foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint payroll_payment_entry_school_fk foreign key (school_id, payroll_entry_id) references public.payroll_entries(school_id, id),
  constraint payroll_payment_paid_by_fk foreign key (paid_by) references public.profiles(id),
  constraint payroll_payment_reversed_by_fk foreign key (reversed_by) references public.profiles(id),
  constraint payroll_payment_amount_check check (amount > 0),
  constraint payroll_payment_method_check check (payment_method in ('cash', 'bank_transfer', 'postal', 'cheque', 'other')),
  constraint payroll_payment_reference_check check (reference_number is null or btrim(reference_number) <> ''),
  constraint payroll_payment_notes_check check (notes is null or btrim(notes) <> ''),
  constraint payroll_payment_status_check check (status in ('completed', 'reversed')),
  constraint payroll_payment_reversal_check check (
    (status = 'completed' and reversed_by is null and reversed_at is null and reversal_reason is null)
    or (status = 'reversed' and reversed_by is not null and reversed_at is not null
      and reversal_reason is not null and btrim(reversal_reason) <> '')
  )
);

create table public.payroll_audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  old_values jsonb,
  new_values jsonb,
  actor_profile_id uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint payroll_audit_school_fk foreign key (school_id) references public.schools(id),
  constraint payroll_audit_actor_fk foreign key (actor_profile_id) references public.profiles(id),
  constraint payroll_audit_entity_check check (entity_type in ('compensation', 'period', 'entry', 'payment')),
  constraint payroll_audit_operation_check check (
    operation in ('create', 'status_update', 'generate', 'adjust', 'approve', 'pay', 'reverse', 'cancel', 'close')
  )
);

create unique index payroll_comp_teacher_effective_from_unique_idx
  on public.payroll_compensation_profiles (school_id, teacher_id, effective_from)
  where teacher_id is not null;
create unique index payroll_comp_member_effective_from_unique_idx
  on public.payroll_compensation_profiles (school_id, membership_id, branch_id, effective_from)
  nulls not distinct where membership_id is not null;
create index payroll_comp_school_branch_status_idx
  on public.payroll_compensation_profiles (school_id, branch_id, status, effective_from);
create index payroll_comp_teacher_idx
  on public.payroll_compensation_profiles (school_id, teacher_id) where teacher_id is not null;
create index payroll_comp_member_idx
  on public.payroll_compensation_profiles (school_id, membership_id) where membership_id is not null;

create unique index payroll_period_schoolwide_month_unique_idx
  on public.payroll_periods (school_id, period_month) where branch_id is null;
create unique index payroll_period_branch_month_unique_idx
  on public.payroll_periods (school_id, branch_id, period_month) where branch_id is not null;
create index payroll_period_school_status_month_idx
  on public.payroll_periods (school_id, status, period_month desc);

create index payroll_entry_period_status_idx on public.payroll_entries (period_id, status);
create index payroll_entry_school_branch_status_idx on public.payroll_entries (school_id, branch_id, status);
create index payroll_entry_teacher_idx on public.payroll_entries (school_id, teacher_id) where teacher_id is not null;
create index payroll_entry_member_idx on public.payroll_entries (school_id, membership_id) where membership_id is not null;

create unique index payroll_payment_one_completed_per_entry_idx
  on public.payroll_payments (payroll_entry_id) where status = 'completed';
create index payroll_payment_school_branch_date_idx
  on public.payroll_payments (school_id, branch_id, payment_date, status);
create index payroll_audit_entity_idx
  on public.payroll_audit_events (school_id, entity_type, entity_id, changed_at);

create trigger payroll_comp_set_updated_at before update on public.payroll_compensation_profiles
for each row execute function public.set_updated_at();
create trigger payroll_period_set_updated_at before update on public.payroll_periods
for each row execute function public.set_updated_at();
create trigger payroll_entry_set_updated_at before update on public.payroll_entries
for each row execute function public.set_updated_at();
create trigger payroll_payment_set_updated_at before update on public.payroll_payments
for each row execute function public.set_updated_at();

create or replace function public.payroll_can_view_scope(target_school_id uuid, target_branch_id uuid)
returns boolean
language sql stable security definer set search_path = ''
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

create or replace function public.payroll_can_manage_scope(target_school_id uuid, target_branch_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when target_branch_id is null then public.has_school_permission(target_school_id, 'finance.manage')
    else public.has_branch_permission(target_school_id, target_branch_id, 'finance.manage')
  end;
$$;

create or replace function public.validate_payroll_compensation_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_branch uuid;
begin
  if new.payee_kind = 'teacher' then
    select t.branch_id into teacher_branch
    from public.teachers t
    where t.school_id = new.school_id and t.id = new.teacher_id and t.status <> 'archived';
    if not found then
      raise exception using errcode = '23514', message = 'PAYROLL_TEACHER_UNAVAILABLE';
    end if;
    if new.branch_id is null or new.branch_id <> teacher_branch then
      raise exception using errcode = '23514', message = 'PAYROLL_TEACHER_BRANCH_MISMATCH';
    end if;
  else
    if not exists (
      select 1 from public.school_memberships sm
      where sm.school_id = new.school_id and sm.id = new.membership_id and sm.status = 'active'
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_UNAVAILABLE';
    end if;
    if new.branch_id is null then
      if not exists (
        select 1
        from public.membership_roles mr
        join public.roles r on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        where mr.school_id = new.school_id and mr.membership_id = new.membership_id and mr.branch_id is null
      ) then
        raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_SCHOOL_SCOPE_REQUIRED';
      end if;
    else
      if not exists (
        select 1
        from public.membership_roles mr
        join public.roles r on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        where mr.school_id = new.school_id and mr.membership_id = new.membership_id
          and (mr.branch_id is null or mr.branch_id = new.branch_id)
      ) then
        raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_BRANCH_SCOPE_REQUIRED';
      end if;
    end if;
    if exists (
      select 1
      from public.teachers t
      join public.school_memberships sm on sm.school_id = t.school_id and sm.profile_id = t.profile_id
      where t.school_id = new.school_id and sm.id = new.membership_id and t.status <> 'archived'
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_LINKED_TEACHER_USE_TEACHER_PAYEE';
    end if;
  end if;

  if exists (
    select 1
    from public.payroll_compensation_profiles p
    where p.school_id = new.school_id and p.id <> new.id and p.payee_kind = new.payee_kind
      and (
        (new.payee_kind = 'teacher' and p.teacher_id = new.teacher_id)
        or (new.payee_kind = 'member' and p.membership_id = new.membership_id
          and p.branch_id is not distinct from new.branch_id)
      )
      and daterange(p.effective_from, coalesce(p.effective_to, 'infinity'::date), '[]')
        && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception using errcode = '23514', message = 'PAYROLL_COMPENSATION_PERIOD_OVERLAP';
  end if;
  return new;
end;
$$;

create trigger payroll_comp_validate
before insert or update of school_id, branch_id, payee_kind, teacher_id, membership_id, effective_from, effective_to
on public.payroll_compensation_profiles
for each row execute function public.validate_payroll_compensation_profile();

create or replace function public.create_payroll_compensation(
  target_school_id uuid,
  target_branch_id uuid,
  target_payee_kind text,
  target_teacher_id uuid,
  target_membership_id uuid,
  target_base_amount numeric,
  target_effective_from date,
  target_effective_to date default null,
  target_notes text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  created_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED';
  end if;
  if not public.payroll_can_manage_scope(target_school_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'PAYROLL_MANAGE_REQUIRED';
  end if;
  if target_base_amount is null or target_base_amount <= 0
    or target_effective_from is null
    or (target_effective_to is not null and target_effective_to < target_effective_from)
    or target_payee_kind not in ('teacher', 'member') then
    raise exception using errcode = '22023', message = 'PAYROLL_COMPENSATION_INPUT_INVALID';
  end if;

  insert into public.payroll_compensation_profiles (
    school_id, branch_id, payee_kind, teacher_id, membership_id, base_amount,
    effective_from, effective_to, notes, created_by
  ) values (
    target_school_id, target_branch_id, target_payee_kind, target_teacher_id, target_membership_id,
    target_base_amount, target_effective_from, target_effective_to,
    nullif(btrim(target_notes), ''), (select auth.uid())
  ) returning id into created_id;

  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, new_values, actor_profile_id)
  select target_school_id, 'compensation', created_id, 'create', to_jsonb(p), (select auth.uid())
  from public.payroll_compensation_profiles p where p.id = created_id;
  return created_id;
end;
$$;

create or replace function public.set_payroll_compensation_status(
  target_school_id uuid,
  target_compensation_id uuid,
  target_status text,
  target_effective_to date default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.payroll_compensation_profiles%rowtype;
  updated_row public.payroll_compensation_profiles%rowtype;
  final_effective_to date;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED';
  end if;
  select * into current_row
  from public.payroll_compensation_profiles
  where school_id = target_school_id and id = target_compensation_id for update;
  if not found then return false; end if;
  if not public.payroll_can_manage_scope(current_row.school_id, current_row.branch_id) then return false; end if;
  if current_row.status = 'archived' then
    raise exception using errcode = '55000', message = 'PAYROLL_COMPENSATION_ARCHIVED';
  end if;
  if target_status not in ('active', 'inactive', 'archived') then
    raise exception using errcode = '22023', message = 'PAYROLL_COMPENSATION_STATUS_INVALID';
  end if;
  final_effective_to := case
    when target_status = 'active' then current_row.effective_to
    else coalesce(target_effective_to, current_row.effective_to, greatest(current_row.effective_from, current_date))
  end;
  if final_effective_to is not null and final_effective_to < current_row.effective_from then
    raise exception using errcode = '22023', message = 'PAYROLL_COMPENSATION_STATUS_INVALID';
  end if;

  update public.payroll_compensation_profiles
  set status = target_status, effective_to = final_effective_to
  where id = current_row.id returning * into updated_row;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id)
  values (current_row.school_id, 'compensation', current_row.id, 'status_update',
    to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.generate_payroll_period(
  target_school_id uuid,
  target_branch_id uuid,
  target_period_month date,
  target_notes text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  period_id uuid;
  existing_status text;
  month_end date;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED';
  end if;
  if target_period_month is null or target_period_month <> date_trunc('month', target_period_month)::date then
    raise exception using errcode = '22023', message = 'PAYROLL_PERIOD_MONTH_INVALID';
  end if;
  if not public.payroll_can_manage_scope(target_school_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'PAYROLL_MANAGE_REQUIRED';
  end if;

  if target_branch_id is null then
    select id, status into period_id, existing_status
    from public.payroll_periods
    where school_id = target_school_id and branch_id is null and period_month = target_period_month;
  else
    select id, status into period_id, existing_status
    from public.payroll_periods
    where school_id = target_school_id and branch_id = target_branch_id and period_month = target_period_month;
  end if;

  if period_id is null then
    insert into public.payroll_periods (school_id, branch_id, period_month, notes, created_by)
    values (target_school_id, target_branch_id, target_period_month, nullif(btrim(target_notes), ''), (select auth.uid()))
    returning id, status into period_id, existing_status;
  elsif existing_status <> 'draft' then
    return period_id;
  end if;

  month_end := (target_period_month + interval '1 month - 1 day')::date;

  insert into public.payroll_entries (
    school_id, branch_id, period_id, compensation_profile_id, payee_kind, teacher_id, membership_id,
    payee_name_snapshot, payee_role_snapshot, base_amount, created_by
  )
  select
    p.school_id, p.branch_id, period_id, p.id, p.payee_kind, p.teacher_id, p.membership_id,
    case when p.payee_kind = 'teacher'
      then btrim(concat_ws(' ', t.first_name, t.last_name)) else btrim(pr.full_name) end,
    case when p.payee_kind = 'teacher' then 'معلم'
      else coalesce((
        select string_agg(distinct r.name_ar, '، ' order by r.name_ar)
        from public.membership_roles mr
        join public.roles r on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        where mr.school_id = p.school_id and mr.membership_id = p.membership_id
          and ((p.branch_id is null and mr.branch_id is null)
            or (p.branch_id is not null and (mr.branch_id is null or mr.branch_id = p.branch_id)))
      ), 'إداري/موظف')
    end,
    p.base_amount, (select auth.uid())
  from public.payroll_compensation_profiles p
  left join public.teachers t
    on p.payee_kind = 'teacher' and t.school_id = p.school_id and t.id = p.teacher_id
  left join public.school_memberships sm
    on p.payee_kind = 'member' and sm.school_id = p.school_id and sm.id = p.membership_id
  left join public.profiles pr on pr.id = sm.profile_id
  where p.school_id = target_school_id
    and p.branch_id is not distinct from target_branch_id
    and p.status = 'active'
    and p.effective_from <= month_end
    and (p.effective_to is null or p.effective_to >= target_period_month)
    and ((p.payee_kind = 'teacher' and t.status in ('active', 'on_leave'))
      or (p.payee_kind = 'member' and sm.status = 'active' and pr.status = 'active'))
  on conflict (period_id, compensation_profile_id) do nothing;

  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, new_values, actor_profile_id)
  values (target_school_id, 'period', period_id, 'generate',
    jsonb_build_object('period_month', target_period_month, 'branch_id', target_branch_id,
      'entry_count', (select count(*) from public.payroll_entries e where e.period_id = period_id)),
    (select auth.uid()));
  return period_id;
end;
$$;

create or replace function public.adjust_payroll_entry(
  target_school_id uuid,
  target_entry_id uuid,
  target_additions numeric,
  target_deductions numeric,
  target_advances numeric
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.payroll_entries%rowtype;
  updated_row public.payroll_entries%rowtype;
  period_status text;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select e, p.status into current_row, period_status
  from public.payroll_entries e
  join public.payroll_periods p on p.id = e.period_id and p.school_id = e.school_id
  where e.school_id = target_school_id and e.id = target_entry_id for update of e;
  if not found then return false; end if;
  if not public.payroll_can_manage_scope(current_row.school_id, current_row.branch_id) then return false; end if;
  if period_status <> 'draft' or current_row.status <> 'draft' then
    raise exception using errcode = '55000', message = 'PAYROLL_ENTRY_NOT_EDITABLE';
  end if;
  if target_additions is null or target_additions < 0 or target_deductions is null or target_deductions < 0
    or target_advances is null or target_advances < 0
    or current_row.base_amount + target_additions - target_deductions - target_advances < 0 then
    raise exception using errcode = '22023', message = 'PAYROLL_ENTRY_AMOUNTS_INVALID';
  end if;
  update public.payroll_entries
  set additions = target_additions, deductions = target_deductions, advances = target_advances
  where id = current_row.id returning * into updated_row;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id)
  values (current_row.school_id, 'entry', current_row.id, 'adjust',
    to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.approve_payroll_period(target_school_id uuid, target_period_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.payroll_periods%rowtype;
  updated_row public.payroll_periods%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select * into current_row from public.payroll_periods
  where school_id = target_school_id and id = target_period_id for update;
  if not found then return false; end if;
  if not public.payroll_can_manage_scope(current_row.school_id, current_row.branch_id) then return false; end if;
  if current_row.status <> 'draft' then raise exception using errcode = '55000', message = 'PAYROLL_PERIOD_NOT_DRAFT'; end if;
  if not exists (select 1 from public.payroll_entries where period_id = current_row.id and status = 'draft') then
    raise exception using errcode = '55000', message = 'PAYROLL_PERIOD_EMPTY';
  end if;
  update public.payroll_entries set status = 'approved' where period_id = current_row.id and status = 'draft';
  update public.payroll_periods
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
  where id = current_row.id returning * into updated_row;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id)
  values (current_row.school_id, 'period', current_row.id, 'approve',
    to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.cancel_payroll_entry(target_school_id uuid, target_entry_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.payroll_entries%rowtype;
  updated_row public.payroll_entries%rowtype;
  period_status text;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select e, p.status into current_row, period_status
  from public.payroll_entries e
  join public.payroll_periods p on p.id = e.period_id and p.school_id = e.school_id
  where e.school_id = target_school_id and e.id = target_entry_id for update of e;
  if not found then return false; end if;
  if not public.payroll_can_manage_scope(current_row.school_id, current_row.branch_id) then return false; end if;
  if period_status not in ('draft', 'approved') or current_row.status not in ('draft', 'approved') then
    raise exception using errcode = '55000', message = 'PAYROLL_ENTRY_NOT_CANCELLABLE';
  end if;
  if exists (select 1 from public.payroll_payments where payroll_entry_id = current_row.id and status = 'completed') then
    raise exception using errcode = '55000', message = 'PAYROLL_REVERSE_PAYMENT_FIRST';
  end if;
  update public.payroll_entries set status = 'cancelled' where id = current_row.id returning * into updated_row;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id)
  values (current_row.school_id, 'entry', current_row.id, 'cancel',
    to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.record_payroll_payment(
  target_school_id uuid,
  target_entry_id uuid,
  target_payment_date date,
  target_payment_method text,
  target_reference_number text default null,
  target_notes text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  entry_row public.payroll_entries%rowtype;
  period_status text;
  period_month date;
  payment_id uuid;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select e, p.status, p.period_month into entry_row, period_status, period_month
  from public.payroll_entries e
  join public.payroll_periods p on p.id = e.period_id and p.school_id = e.school_id
  where e.school_id = target_school_id and e.id = target_entry_id for update of e;
  if not found then return null; end if;
  if not public.payroll_can_manage_scope(entry_row.school_id, entry_row.branch_id) then return null; end if;
  if period_status <> 'approved' or entry_row.status <> 'approved' then
    raise exception using errcode = '55000', message = 'PAYROLL_ENTRY_NOT_PAYABLE';
  end if;
  if entry_row.net_amount <= 0 then raise exception using errcode = '22023', message = 'PAYROLL_ZERO_NET_NO_PAYMENT'; end if;
  if target_payment_date is null or target_payment_date < period_month
    or target_payment_method not in ('cash', 'bank_transfer', 'postal', 'cheque', 'other') then
    raise exception using errcode = '22023', message = 'PAYROLL_PAYMENT_INPUT_INVALID';
  end if;

  insert into public.payroll_payments (
    school_id, branch_id, payroll_entry_id, amount, payment_method, payment_date,
    reference_number, notes, paid_by
  ) values (
    entry_row.school_id, entry_row.branch_id, entry_row.id, entry_row.net_amount,
    target_payment_method, target_payment_date, nullif(btrim(target_reference_number), ''),
    nullif(btrim(target_notes), ''), (select auth.uid())
  ) returning id into payment_id;
  update public.payroll_entries set status = 'paid' where id = entry_row.id;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, new_values, actor_profile_id)
  select entry_row.school_id, 'payment', payment_id, 'pay', to_jsonb(p), (select auth.uid())
  from public.payroll_payments p where p.id = payment_id;
  return payment_id;
end;
$$;

create or replace function public.reverse_payroll_payment(
  target_school_id uuid,
  target_payment_id uuid,
  target_reason text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  payment_row public.payroll_payments%rowtype;
  entry_row public.payroll_entries%rowtype;
  period_status text;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select * into payment_row from public.payroll_payments
  where school_id = target_school_id and id = target_payment_id for update;
  if not found then return false; end if;
  select e, p.status into entry_row, period_status
  from public.payroll_entries e
  join public.payroll_periods p on p.id = e.period_id and p.school_id = e.school_id
  where e.id = payment_row.payroll_entry_id;
  if not public.payroll_can_manage_scope(payment_row.school_id, payment_row.branch_id) then return false; end if;
  if period_status <> 'approved' or payment_row.status <> 'completed' or entry_row.status <> 'paid' then
    raise exception using errcode = '55000', message = 'PAYROLL_PAYMENT_NOT_REVERSIBLE';
  end if;
  if target_reason is null or char_length(btrim(target_reason)) < 3 then
    raise exception using errcode = '22023', message = 'PAYROLL_REVERSAL_REASON_REQUIRED';
  end if;
  update public.payroll_payments
  set status = 'reversed', reversed_by = (select auth.uid()), reversed_at = now(), reversal_reason = btrim(target_reason)
  where id = payment_row.id;
  update public.payroll_entries set status = 'approved' where id = entry_row.id;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id)
  select payment_row.school_id, 'payment', payment_row.id, 'reverse',
    to_jsonb(payment_row), to_jsonb(p), (select auth.uid())
  from public.payroll_payments p where p.id = payment_row.id;
  return true;
end;
$$;

create or replace function public.close_payroll_period(target_school_id uuid, target_period_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.payroll_periods%rowtype;
  updated_row public.payroll_periods%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select * into current_row from public.payroll_periods
  where school_id = target_school_id and id = target_period_id for update;
  if not found then return false; end if;
  if not public.payroll_can_manage_scope(current_row.school_id, current_row.branch_id) then return false; end if;
  if current_row.status <> 'approved' then raise exception using errcode = '55000', message = 'PAYROLL_PERIOD_NOT_APPROVED'; end if;
  if exists (
    select 1 from public.payroll_entries e
    where e.period_id = current_row.id and e.status not in ('paid', 'cancelled') and e.net_amount > 0
  ) then
    raise exception using errcode = '55000', message = 'PAYROLL_PERIOD_HAS_UNSETTLED_ENTRIES';
  end if;
  update public.payroll_periods
  set status = 'closed', closed_by = (select auth.uid()), closed_at = now()
  where id = current_row.id returning * into updated_row;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id)
  values (current_row.school_id, 'period', current_row.id, 'close',
    to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.cancel_payroll_period(target_school_id uuid, target_period_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.payroll_periods%rowtype;
  updated_row public.payroll_periods%rowtype;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  select * into current_row from public.payroll_periods
  where school_id = target_school_id and id = target_period_id for update;
  if not found then return false; end if;
  if not public.payroll_can_manage_scope(current_row.school_id, current_row.branch_id) then return false; end if;
  if current_row.status <> 'draft' then raise exception using errcode = '55000', message = 'PAYROLL_PERIOD_NOT_CANCELLABLE'; end if;
  if exists (
    select 1 from public.payroll_payments pp
    join public.payroll_entries e on e.id = pp.payroll_entry_id
    where e.period_id = current_row.id
  ) then
    raise exception using errcode = '55000', message = 'PAYROLL_PERIOD_HAS_PAYMENT_HISTORY';
  end if;
  update public.payroll_entries set status = 'cancelled'
  where period_id = current_row.id and status = 'draft';
  update public.payroll_periods
  set status = 'cancelled', cancelled_by = (select auth.uid()), cancelled_at = now()
  where id = current_row.id returning * into updated_row;
  insert into public.payroll_audit_events (school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id)
  values (current_row.school_id, 'period', current_row.id, 'cancel',
    to_jsonb(current_row), to_jsonb(updated_row), (select auth.uid()));
  return true;
end;
$$;

create or replace function public.get_payroll_workspace(
  target_school_id uuid,
  target_branch_id uuid default null,
  target_period_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  can_manage boolean;
  result jsonb;
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED'; end if;
  if target_period_month is null or target_period_month <> date_trunc('month', target_period_month)::date then
    raise exception using errcode = '22023', message = 'PAYROLL_PERIOD_MONTH_INVALID';
  end if;
  if not public.payroll_can_view_scope(target_school_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'PAYROLL_VIEW_REQUIRED';
  end if;
  can_manage := public.payroll_can_manage_scope(target_school_id, target_branch_id);

  select jsonb_build_object(
    'can_manage', can_manage,
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'branch_id', p.branch_id, 'payee_kind', p.payee_kind,
        'teacher_id', p.teacher_id, 'membership_id', p.membership_id,
        'payee_name', case when p.payee_kind = 'teacher'
          then btrim(concat_ws(' ', t.first_name, t.last_name)) else pr.full_name end,
        'base_amount', p.base_amount, 'effective_from', p.effective_from,
        'effective_to', p.effective_to, 'status', p.status, 'notes', p.notes
      ) order by p.effective_from desc)
      from public.payroll_compensation_profiles p
      left join public.teachers t on p.payee_kind = 'teacher' and t.school_id = p.school_id and t.id = p.teacher_id
      left join public.school_memberships sm on p.payee_kind = 'member' and sm.school_id = p.school_id and sm.id = p.membership_id
      left join public.profiles pr on pr.id = sm.profile_id
      where p.school_id = target_school_id and p.branch_id is not distinct from target_branch_id
    ), '[]'::jsonb),
    'candidates', case when can_manage then coalesce((
      select jsonb_agg(candidate order by candidate ->> 'name')
      from (
        select jsonb_build_object(
          'kind', 'teacher', 'teacher_id', t.id, 'membership_id', null,
          'branch_id', t.branch_id, 'name', btrim(concat_ws(' ', t.first_name, t.last_name)),
          'role_label', 'معلم'
        ) as candidate
        from public.teachers t
        where t.school_id = target_school_id and t.status in ('active', 'on_leave')
          and t.branch_id is not distinct from target_branch_id
        union all
        select jsonb_build_object(
          'kind', 'member', 'teacher_id', null, 'membership_id', sm.id,
          'branch_id', target_branch_id, 'name', pr.full_name,
          'role_label', coalesce(string_agg(distinct r.name_ar, '، ' order by r.name_ar), 'إداري/موظف')
        ) as candidate
        from public.school_memberships sm
        join public.profiles pr on pr.id = sm.profile_id and pr.status = 'active'
        join public.membership_roles mr on mr.school_id = sm.school_id and mr.membership_id = sm.id
        join public.roles r on r.school_id = mr.school_id and r.id = mr.role_id and r.status = 'active'
        where sm.school_id = target_school_id and sm.status = 'active'
          and ((target_branch_id is null and mr.branch_id is null)
            or (target_branch_id is not null and (mr.branch_id is null or mr.branch_id = target_branch_id)))
          and not exists (
            select 1 from public.teachers t2
            where t2.school_id = sm.school_id and t2.profile_id = sm.profile_id and t2.status <> 'archived'
          )
        group by sm.id, pr.full_name
      ) q
    ), '[]'::jsonb) else '[]'::jsonb end,
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'branch_id', p.branch_id, 'period_month', p.period_month, 'status', p.status,
        'approved_at', p.approved_at, 'closed_at', p.closed_at, 'cancelled_at', p.cancelled_at,
        'entry_count', (select count(*) from public.payroll_entries e where e.period_id = p.id),
        'net_total', (select coalesce(sum(e.net_amount), 0) from public.payroll_entries e
          where e.period_id = p.id and e.status <> 'cancelled'),
        'paid_total', (select coalesce(sum(pp.amount), 0) from public.payroll_payments pp
          join public.payroll_entries e on e.id = pp.payroll_entry_id
          where e.period_id = p.id and pp.status = 'completed')
      ) order by p.period_month desc)
      from public.payroll_periods p
      where p.school_id = target_school_id and p.branch_id is not distinct from target_branch_id
        and p.period_month >= (target_period_month - interval '11 months')::date
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'period_id', e.period_id, 'payee_kind', e.payee_kind,
        'teacher_id', e.teacher_id, 'membership_id', e.membership_id,
        'payee_name', e.payee_name_snapshot, 'role_label', e.payee_role_snapshot,
        'base_amount', e.base_amount, 'additions', e.additions, 'deductions', e.deductions,
        'advances', e.advances, 'net_amount', e.net_amount, 'status', e.status,
        'payment', (
          select jsonb_build_object(
            'id', pp.id, 'amount', pp.amount, 'payment_method', pp.payment_method,
            'payment_date', pp.payment_date, 'reference_number', pp.reference_number, 'status', pp.status
          )
          from public.payroll_payments pp
          where pp.payroll_entry_id = e.id and pp.status = 'completed' limit 1
        )
      ) order by e.payee_name_snapshot)
      from public.payroll_entries e
      join public.payroll_periods p on p.id = e.period_id
      where e.school_id = target_school_id and e.branch_id is not distinct from target_branch_id
        and p.period_month = target_period_month
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.list_payroll_report_payments(target_school_id uuid)
returns table (
  id uuid,
  branch_id uuid,
  payroll_entry_id uuid,
  amount numeric,
  payment_method text,
  payment_date date,
  reference_number text,
  status text
)
language sql stable security definer set search_path = ''
as $$
  select pp.id, pp.branch_id, pp.payroll_entry_id, pp.amount, pp.payment_method,
    pp.payment_date, pp.reference_number, pp.status
  from public.payroll_payments pp
  where pp.school_id = target_school_id and (
    (pp.branch_id is null and (
      public.has_school_permission(target_school_id, 'finance.view')
      or public.has_school_permission(target_school_id, 'finance.manage')
    ))
    or (pp.branch_id is not null and (
      public.has_branch_permission(target_school_id, pp.branch_id, 'finance.view')
      or public.has_branch_permission(target_school_id, pp.branch_id, 'finance.manage')
    ))
  );
$$;

alter table public.payroll_compensation_profiles enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_payments enable row level security;
alter table public.payroll_audit_events enable row level security;

revoke all on public.payroll_compensation_profiles, public.payroll_periods, public.payroll_entries,
  public.payroll_payments, public.payroll_audit_events from public, anon, authenticated;

revoke all on function public.payroll_can_view_scope(uuid, uuid) from public;
revoke all on function public.payroll_can_manage_scope(uuid, uuid) from public;
revoke all on function public.validate_payroll_compensation_profile() from public;
revoke all on function public.create_payroll_compensation(uuid, uuid, text, uuid, uuid, numeric, date, date, text) from public;
revoke all on function public.set_payroll_compensation_status(uuid, uuid, text, date) from public;
revoke all on function public.generate_payroll_period(uuid, uuid, date, text) from public;
revoke all on function public.adjust_payroll_entry(uuid, uuid, numeric, numeric, numeric) from public;
revoke all on function public.approve_payroll_period(uuid, uuid) from public;
revoke all on function public.cancel_payroll_entry(uuid, uuid) from public;
revoke all on function public.record_payroll_payment(uuid, uuid, date, text, text, text) from public;
revoke all on function public.reverse_payroll_payment(uuid, uuid, text) from public;
revoke all on function public.close_payroll_period(uuid, uuid) from public;
revoke all on function public.cancel_payroll_period(uuid, uuid) from public;
revoke all on function public.get_payroll_workspace(uuid, uuid, date) from public;
revoke all on function public.list_payroll_report_payments(uuid) from public;

grant execute on function public.create_payroll_compensation(uuid, uuid, text, uuid, uuid, numeric, date, date, text) to authenticated;
grant execute on function public.set_payroll_compensation_status(uuid, uuid, text, date) to authenticated;
grant execute on function public.generate_payroll_period(uuid, uuid, date, text) to authenticated;
grant execute on function public.adjust_payroll_entry(uuid, uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.approve_payroll_period(uuid, uuid) to authenticated;
grant execute on function public.cancel_payroll_entry(uuid, uuid) to authenticated;
grant execute on function public.record_payroll_payment(uuid, uuid, date, text, text, text) to authenticated;
grant execute on function public.reverse_payroll_payment(uuid, uuid, text) to authenticated;
grant execute on function public.close_payroll_period(uuid, uuid) to authenticated;
grant execute on function public.cancel_payroll_period(uuid, uuid) to authenticated;
grant execute on function public.get_payroll_workspace(uuid, uuid, date) to authenticated;
grant execute on function public.list_payroll_report_payments(uuid) to authenticated;

comment on table public.payroll_compensation_profiles is 'Effective-dated teacher/staff fixed compensation setup. History is retained as new effective periods.';
comment on table public.payroll_periods is 'Monthly payroll approval/close envelope scoped to one branch or school-wide staff.';
comment on table public.payroll_entries is 'Monthly compensation snapshots. Net is generated from base + additions - deductions - advances.';
comment on table public.payroll_payments is 'Actual payroll cash outflows. Reversal retains the original payment history and removes it from completed outflow reporting.';
comment on function public.list_payroll_report_payments(uuid) is 'Finance-scoped completed/reversed payroll payments for cash-flow reporting without exposing salary setup to expense-only users.';

commit;
