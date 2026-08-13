-- QuranOS V2 - independent staff and payroll module
-- V2 only. Production remains unchanged until the release gate is approved.

begin;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  branch_id uuid,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  linked_teacher_id uuid,
  employee_number text,
  full_name text not null,
  job_code text not null,
  custom_job_title text,
  phone text,
  hire_date date,
  status text not null default 'active',
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_branch_school_fk
    foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint employees_teacher_school_fk
    foreign key (school_id, linked_teacher_id) references public.teachers(school_id, id),
  constraint employees_job_code_check check (job_code in (
    'manager', 'deputy_manager', 'bursar', 'teacher',
    'guard', 'cleaner', 'driver', 'other'
  )),
  constraint employees_custom_title_check check (
    (job_code = 'other' and char_length(btrim(custom_job_title)) between 2 and 100)
    or (job_code <> 'other' and custom_job_title is null)
  ),
  constraint employees_name_check check (char_length(btrim(full_name)) between 2 and 150),
  constraint employees_number_check check (
    employee_number is null or char_length(btrim(employee_number)) between 1 and 40
  ),
  constraint employees_phone_check check (
    phone is null or char_length(btrim(phone)) between 5 and 30
  ),
  constraint employees_notes_check check (
    notes is null or char_length(btrim(notes)) between 1 and 500
  ),
  constraint employees_status_check check (status in ('active', 'inactive')),
  constraint employees_school_id_id_unique unique (school_id, id)
);

comment on table public.employees is
  'Independent employment directory. Employees do not require login accounts and job titles never grant authorization.';

create unique index employees_number_unique_idx
  on public.employees (school_id, employee_number)
  where employee_number is not null;
create unique index employees_linked_teacher_unique_idx
  on public.employees (school_id, linked_teacher_id)
  where linked_teacher_id is not null;
create index employees_school_branch_status_idx
  on public.employees (school_id, branch_id, status, full_name);

create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

alter table public.employees enable row level security;
revoke all on public.employees from public, anon, authenticated;

alter table public.payroll_compensation_profiles
  add column employee_id uuid;
alter table public.payroll_compensation_profiles
  add constraint payroll_comp_employee_school_fk
    foreign key (school_id, employee_id) references public.employees(school_id, id);
alter table public.payroll_compensation_profiles
  drop constraint payroll_comp_payee_kind_check,
  drop constraint payroll_comp_exact_payee_check;
alter table public.payroll_compensation_profiles
  add constraint payroll_comp_payee_kind_check
    check (payee_kind in ('teacher', 'member', 'employee')),
  add constraint payroll_comp_exact_payee_check check (
    (payee_kind = 'teacher' and teacher_id is not null and membership_id is null and employee_id is null)
    or (payee_kind = 'member' and membership_id is not null and teacher_id is null and employee_id is null)
    or (payee_kind = 'employee' and employee_id is not null and teacher_id is null and membership_id is null)
  );
create unique index payroll_comp_employee_effective_from_unique_idx
  on public.payroll_compensation_profiles (school_id, employee_id, effective_from)
  where employee_id is not null;
create index payroll_comp_employee_idx
  on public.payroll_compensation_profiles (school_id, employee_id)
  where employee_id is not null;

alter table public.payroll_entries
  add column employee_id uuid;
alter table public.payroll_entries
  add constraint payroll_entry_employee_school_fk
    foreign key (school_id, employee_id) references public.employees(school_id, id);
alter table public.payroll_entries
  drop constraint payroll_entry_payee_kind_check,
  drop constraint payroll_entry_exact_payee_check;
alter table public.payroll_entries
  add constraint payroll_entry_payee_kind_check
    check (payee_kind in ('teacher', 'member', 'employee')),
  add constraint payroll_entry_exact_payee_check check (
    (payee_kind = 'teacher' and teacher_id is not null and membership_id is null and employee_id is null)
    or (payee_kind = 'member' and membership_id is not null and teacher_id is null and employee_id is null)
    or (payee_kind = 'employee' and employee_id is not null and teacher_id is null and membership_id is null)
  );
create index payroll_entry_employee_idx
  on public.payroll_entries (school_id, employee_id)
  where employee_id is not null;

create or replace function public.list_staff_employees(
  target_school_id uuid,
  target_branch_id uuid default null
)
returns table (
  employee_id uuid,
  branch_id uuid,
  branch_name text,
  employee_number text,
  full_name text,
  job_code text,
  custom_job_title text,
  phone text,
  hire_date date,
  status text,
  linked_profile_id uuid,
  linked_teacher_id uuid,
  notes text,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'STAFF_PAYROLL_VIEW_REQUIRED';
  end if;

  return query
  select employee.id, employee.branch_id, branch.name, employee.employee_number,
    employee.full_name, employee.job_code, employee.custom_job_title,
    employee.phone, employee.hire_date, employee.status,
    employee.linked_profile_id, employee.linked_teacher_id,
    employee.notes, employee.updated_at
  from public.employees as employee
  left join public.branches as branch
    on branch.school_id = employee.school_id and branch.id = employee.branch_id
  where employee.school_id = target_school_id
    and employee.branch_id is not distinct from target_branch_id
  order by (employee.status = 'active') desc, employee.full_name, employee.id;
end;
$$;

create or replace function public.save_staff_employee(
  target_school_id uuid,
  target_employee_id uuid,
  target_branch_id uuid,
  target_full_name text,
  target_job_code text,
  target_custom_job_title text default null,
  target_employee_number text default null,
  target_phone text default null,
  target_hire_date date default null,
  target_notes text default null,
  target_linked_profile_id uuid default null,
  target_linked_teacher_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  saved_id uuid;
  normalized_name text := nullif(btrim(target_full_name), '');
  normalized_custom_title text := nullif(btrim(target_custom_job_title), '');
  normalized_number text := nullif(btrim(target_employee_number), '');
  normalized_phone text := nullif(btrim(target_phone), '');
  normalized_notes text := nullif(btrim(target_notes), '');
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'STAFF_PAYROLL_MANAGE_REQUIRED';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 2 and 150
    or target_job_code not in (
      'manager', 'deputy_manager', 'bursar', 'teacher',
      'guard', 'cleaner', 'driver', 'other'
    )
    or (target_job_code = 'other' and (
      normalized_custom_title is null or char_length(normalized_custom_title) not between 2 and 100
    ))
    or (target_job_code <> 'other' and normalized_custom_title is not null)
    or (normalized_number is not null and char_length(normalized_number) > 40)
    or (normalized_phone is not null and char_length(normalized_phone) not between 5 and 30)
    or (normalized_notes is not null and char_length(normalized_notes) > 500)
  then
    raise exception using errcode = '22023', message = 'STAFF_EMPLOYEE_INPUT_INVALID';
  end if;

  if target_branch_id is not null and not exists (
    select 1 from public.branches as branch
    where branch.school_id = target_school_id
      and branch.id = target_branch_id
      and branch.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'STAFF_EMPLOYEE_SCOPE_INVALID';
  end if;

  if target_linked_profile_id is not null and not exists (
    select 1 from public.school_memberships as membership
    where membership.school_id = target_school_id
      and membership.profile_id = target_linked_profile_id
      and membership.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'STAFF_EMPLOYEE_PROFILE_INVALID';
  end if;

  if target_linked_teacher_id is not null and not exists (
    select 1 from public.teachers as teacher
    where teacher.school_id = target_school_id
      and teacher.id = target_linked_teacher_id
      and teacher.status <> 'archived'
      and teacher.branch_id is not distinct from target_branch_id
  ) then
    raise exception using errcode = '23514', message = 'STAFF_EMPLOYEE_TEACHER_INVALID';
  end if;

  if target_employee_id is null then
    insert into public.employees (
      school_id, branch_id, linked_profile_id, linked_teacher_id,
      employee_number, full_name, job_code, custom_job_title,
      phone, hire_date, notes, created_by
    ) values (
      target_school_id, target_branch_id, target_linked_profile_id, target_linked_teacher_id,
      normalized_number, normalized_name, target_job_code,
      case when target_job_code = 'other' then normalized_custom_title else null end,
      normalized_phone, target_hire_date, normalized_notes, (select auth.uid())
    ) returning id into saved_id;
  else
    update public.employees as employee
    set employee_number = normalized_number,
        full_name = normalized_name,
        job_code = target_job_code,
        custom_job_title = case when target_job_code = 'other' then normalized_custom_title else null end,
        phone = normalized_phone,
        hire_date = target_hire_date,
        notes = normalized_notes,
        linked_profile_id = target_linked_profile_id,
        linked_teacher_id = target_linked_teacher_id
    where employee.school_id = target_school_id
      and employee.id = target_employee_id
      and employee.branch_id is not distinct from target_branch_id
    returning employee.id into saved_id;
    if saved_id is null then
      raise exception using errcode = '42501', message = 'STAFF_EMPLOYEE_SCOPE_INVALID';
    end if;
  end if;

  return saved_id;
end;
$$;

create or replace function public.set_staff_employee_status(
  target_school_id uuid,
  target_employee_id uuid,
  target_status text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  employee_branch_id uuid;
begin
  if target_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'STAFF_EMPLOYEE_STATUS_INVALID';
  end if;

  select employee.branch_id into employee_branch_id
  from public.employees as employee
  where employee.school_id = target_school_id and employee.id = target_employee_id;
  if not found then return false; end if;

  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id, employee_branch_id)
  then
    raise exception using errcode = '42501', message = 'STAFF_PAYROLL_MANAGE_REQUIRED';
  end if;

  update public.employees
  set status = target_status
  where school_id = target_school_id and id = target_employee_id;
  return found;
end;
$$;

create or replace function public.create_employee_compensation(
  target_school_id uuid,
  target_branch_id uuid,
  target_employee_id uuid,
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
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_MANAGE_REQUIRED';
  end if;
  if target_base_amount is null or target_base_amount <= 0
    or target_effective_from is null
    or (target_effective_to is not null and target_effective_to < target_effective_from)
    or not exists (
      select 1 from public.employees as employee
      where employee.school_id = target_school_id
        and employee.id = target_employee_id
        and employee.branch_id is not distinct from target_branch_id
        and employee.status = 'active'
    )
  then
    raise exception using errcode = '22023', message = 'PAYROLL_EMPLOYEE_INPUT_INVALID';
  end if;

  if exists (
    select 1 from public.payroll_compensation_profiles as profile
    where profile.school_id = target_school_id
      and profile.employee_id = target_employee_id
      and daterange(profile.effective_from, coalesce(profile.effective_to, 'infinity'::date), '[]')
        && daterange(target_effective_from, coalesce(target_effective_to, 'infinity'::date), '[]')
  ) then
    raise exception using errcode = '23514', message = 'PAYROLL_COMPENSATION_PERIOD_OVERLAP';
  end if;

  insert into public.payroll_compensation_profiles (
    school_id, branch_id, payee_kind, employee_id, base_amount,
    effective_from, effective_to, notes, created_by
  ) values (
    target_school_id, target_branch_id, 'employee', target_employee_id,
    target_base_amount, target_effective_from, target_effective_to,
    nullif(btrim(target_notes), ''), (select auth.uid())
  ) returning id into created_id;

  insert into public.payroll_audit_events (
    school_id, entity_type, entity_id, operation, new_values, actor_profile_id
  ) select target_school_id, 'compensation', created_id, 'create', to_jsonb(profile), (select auth.uid())
    from public.payroll_compensation_profiles as profile where profile.id = created_id;
  return created_id;
end;
$$;

create or replace function public.validate_payroll_compensation_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_branch uuid;
begin
  if new.payee_kind = 'employee' then
    if not exists (
      select 1 from public.employees as employee
      where employee.school_id = new.school_id
        and employee.id = new.employee_id
        and employee.branch_id is not distinct from new.branch_id
        and employee.status = 'active'
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_EMPLOYEE_UNAVAILABLE';
    end if;
  elsif new.payee_kind = 'teacher' then
    select teacher.branch_id into teacher_branch
    from public.teachers as teacher
    where teacher.school_id = new.school_id
      and teacher.id = new.teacher_id
      and teacher.status <> 'archived';
    if not found then
      raise exception using errcode = '23514', message = 'PAYROLL_TEACHER_UNAVAILABLE';
    end if;
    if new.branch_id is null or new.branch_id <> teacher_branch then
      raise exception using errcode = '23514', message = 'PAYROLL_TEACHER_BRANCH_MISMATCH';
    end if;
  else
    if not exists (
      select 1 from public.school_memberships as membership
      where membership.school_id = new.school_id
        and membership.id = new.membership_id
        and membership.status = 'active'
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_UNAVAILABLE';
    end if;
    if new.branch_id is null and not exists (
      select 1 from public.membership_roles as assignment
      join public.roles as role
        on role.school_id = assignment.school_id
       and role.id = assignment.role_id
       and role.status = 'active'
      where assignment.school_id = new.school_id
        and assignment.membership_id = new.membership_id
        and assignment.branch_id is null
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_SCHOOL_SCOPE_REQUIRED';
    end if;
    if new.branch_id is not null and not exists (
      select 1 from public.membership_roles as assignment
      join public.roles as role
        on role.school_id = assignment.school_id
       and role.id = assignment.role_id
       and role.status = 'active'
      where assignment.school_id = new.school_id
        and assignment.membership_id = new.membership_id
        and (assignment.branch_id is null or assignment.branch_id = new.branch_id)
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_BRANCH_SCOPE_REQUIRED';
    end if;
    if exists (
      select 1 from public.teachers as teacher
      join public.school_memberships as membership
        on membership.school_id = teacher.school_id
       and membership.profile_id = teacher.profile_id
      where teacher.school_id = new.school_id
        and membership.id = new.membership_id
        and teacher.status <> 'archived'
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_LINKED_TEACHER_USE_TEACHER_PAYEE';
    end if;
  end if;

  if exists (
    select 1 from public.payroll_compensation_profiles as profile
    where profile.school_id = new.school_id
      and profile.id <> new.id
      and profile.payee_kind = new.payee_kind
      and (
        (new.payee_kind = 'teacher' and profile.teacher_id = new.teacher_id)
        or (new.payee_kind = 'member' and profile.membership_id = new.membership_id)
        or (new.payee_kind = 'employee' and profile.employee_id = new.employee_id)
      )
      and daterange(profile.effective_from, coalesce(profile.effective_to, 'infinity'::date), '[]')
        && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception using errcode = '23514', message = 'PAYROLL_COMPENSATION_PERIOD_OVERLAP';
  end if;
  return new;
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
  generated_period_id uuid;
  existing_status text;
  month_end date;
begin
  if (select auth.uid()) is null
    or not public.payroll_can_manage_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_MANAGE_REQUIRED';
  end if;
  if target_period_month is null
    or target_period_month <> date_trunc('month', target_period_month)::date
  then
    raise exception using errcode = '22023', message = 'PAYROLL_PERIOD_MONTH_INVALID';
  end if;

  select period.id, period.status into generated_period_id, existing_status
  from public.payroll_periods as period
  where period.school_id = target_school_id
    and period.branch_id is not distinct from target_branch_id
    and period.period_month = target_period_month;

  if generated_period_id is null then
    insert into public.payroll_periods (
      school_id, branch_id, period_month, notes, created_by
    ) values (
      target_school_id, target_branch_id, target_period_month,
      nullif(btrim(target_notes), ''), (select auth.uid())
    ) returning id, status into generated_period_id, existing_status;
  elsif existing_status <> 'draft' then
    return generated_period_id;
  end if;

  month_end := (target_period_month + interval '1 month - 1 day')::date;
  insert into public.payroll_entries (
    school_id, branch_id, period_id, compensation_profile_id,
    payee_kind, teacher_id, membership_id, employee_id,
    payee_name_snapshot, payee_role_snapshot, base_amount, created_by
  )
  select profile.school_id, profile.branch_id, generated_period_id, profile.id,
    profile.payee_kind, profile.teacher_id, profile.membership_id, profile.employee_id,
    case profile.payee_kind
      when 'teacher' then btrim(concat_ws(' ', teacher.first_name, teacher.last_name))
      when 'employee' then employee.full_name
      else member_profile.full_name
    end,
    case profile.payee_kind
      when 'teacher' then 'المعلم'
      when 'employee' then case employee.job_code
        when 'manager' then 'المدير'
        when 'deputy_manager' then 'نائب المدير'
        when 'bursar' then 'المقتصد'
        when 'teacher' then 'المعلم'
        when 'guard' then 'الحارس'
        when 'cleaner' then 'عامل النظافة'
        when 'driver' then 'السائق'
        else employee.custom_job_title end
      else 'إداري/موظف'
    end,
    profile.base_amount, (select auth.uid())
  from public.payroll_compensation_profiles as profile
  left join public.teachers as teacher
    on profile.payee_kind = 'teacher'
   and teacher.school_id = profile.school_id and teacher.id = profile.teacher_id
  left join public.school_memberships as membership
    on profile.payee_kind = 'member'
   and membership.school_id = profile.school_id and membership.id = profile.membership_id
  left join public.profiles as member_profile on member_profile.id = membership.profile_id
  left join public.employees as employee
    on profile.payee_kind = 'employee'
   and employee.school_id = profile.school_id and employee.id = profile.employee_id
  where profile.school_id = target_school_id
    and profile.branch_id is not distinct from target_branch_id
    and profile.status = 'active'
    and profile.effective_from <= month_end
    and (profile.effective_to is null or profile.effective_to >= target_period_month)
    and (
      (profile.payee_kind = 'teacher' and teacher.status in ('active', 'on_leave'))
      or (profile.payee_kind = 'member' and membership.status = 'active' and member_profile.status = 'active')
      or (profile.payee_kind = 'employee' and employee.status = 'active')
    )
  on conflict (period_id, compensation_profile_id) do nothing;

  insert into public.payroll_audit_events (
    school_id, entity_type, entity_id, operation, new_values, actor_profile_id
  ) values (
    target_school_id, 'period', generated_period_id, 'generate',
    jsonb_build_object('period_month', target_period_month, 'branch_id', target_branch_id),
    (select auth.uid())
  );
  return generated_period_id;
end;
$$;

create or replace function public.get_staff_payroll_workspace(
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
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_VIEW_REQUIRED';
  end if;
  if target_period_month is null
    or target_period_month <> date_trunc('month', target_period_month)::date
  then
    raise exception using errcode = '22023', message = 'PAYROLL_PERIOD_MONTH_INVALID';
  end if;
  can_manage := public.payroll_can_manage_scope(target_school_id, target_branch_id);

  select jsonb_build_object(
    'can_manage', can_manage,
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', profile.id, 'branch_id', profile.branch_id,
        'payee_kind', profile.payee_kind, 'teacher_id', profile.teacher_id,
        'membership_id', profile.membership_id, 'employee_id', profile.employee_id,
        'payee_name', coalesce(employee.full_name,
          btrim(concat_ws(' ', teacher.first_name, teacher.last_name)), member_profile.full_name),
        'base_amount', profile.base_amount, 'effective_from', profile.effective_from,
        'effective_to', profile.effective_to, 'status', profile.status, 'notes', profile.notes
      ) order by profile.effective_from desc)
      from public.payroll_compensation_profiles as profile
      left join public.employees as employee
        on profile.payee_kind = 'employee' and employee.school_id = profile.school_id and employee.id = profile.employee_id
      left join public.teachers as teacher
        on profile.payee_kind = 'teacher' and teacher.school_id = profile.school_id and teacher.id = profile.teacher_id
      left join public.school_memberships as membership
        on profile.payee_kind = 'member' and membership.school_id = profile.school_id and membership.id = profile.membership_id
      left join public.profiles as member_profile on member_profile.id = membership.profile_id
      where profile.school_id = target_school_id
        and profile.branch_id is not distinct from target_branch_id
    ), '[]'::jsonb),
    'candidates', case when can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', 'employee', 'employee_id', employee.id,
        'teacher_id', null, 'membership_id', null,
        'branch_id', employee.branch_id, 'name', employee.full_name,
        'role_label', case employee.job_code
          when 'manager' then 'المدير' when 'deputy_manager' then 'نائب المدير'
          when 'bursar' then 'المقتصد' when 'teacher' then 'المعلم'
          when 'guard' then 'الحارس' when 'cleaner' then 'عامل النظافة'
          when 'driver' then 'السائق' else employee.custom_job_title end
      ) order by employee.full_name)
      from public.employees as employee
      where employee.school_id = target_school_id
        and employee.branch_id is not distinct from target_branch_id
        and employee.status = 'active'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', period.id, 'branch_id', period.branch_id,
        'period_month', period.period_month, 'status', period.status,
        'approved_at', period.approved_at, 'closed_at', period.closed_at,
        'cancelled_at', period.cancelled_at,
        'entry_count', (select count(*) from public.payroll_entries as entry where entry.period_id = period.id),
        'net_total', (select coalesce(sum(entry.net_amount), 0) from public.payroll_entries as entry where entry.period_id = period.id and entry.status <> 'cancelled'),
        'paid_total', (select coalesce(sum(payment.amount), 0) from public.payroll_payments as payment join public.payroll_entries as entry on entry.id = payment.payroll_entry_id where entry.period_id = period.id and payment.status = 'completed')
      ) order by period.period_month desc)
      from public.payroll_periods as period
      where period.school_id = target_school_id
        and period.branch_id is not distinct from target_branch_id
        and period.period_month >= (target_period_month - interval '11 months')::date
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entry.id, 'period_id', entry.period_id,
        'payee_kind', entry.payee_kind, 'teacher_id', entry.teacher_id,
        'membership_id', entry.membership_id, 'employee_id', entry.employee_id,
        'payee_name', entry.payee_name_snapshot, 'role_label', entry.payee_role_snapshot,
        'base_amount', entry.base_amount, 'additions', entry.additions,
        'deductions', entry.deductions, 'advances', entry.advances,
        'net_amount', entry.net_amount, 'status', entry.status,
        'payment', (select jsonb_build_object(
          'id', payment.id, 'amount', payment.amount,
          'payment_method', payment.payment_method, 'payment_date', payment.payment_date,
          'reference_number', payment.reference_number, 'status', payment.status
        ) from public.payroll_payments as payment
          where payment.payroll_entry_id = entry.id and payment.status = 'completed' limit 1)
      ) order by entry.payee_name_snapshot)
      from public.payroll_entries as entry
      join public.payroll_periods as period on period.id = entry.period_id
      where entry.school_id = target_school_id
        and entry.branch_id is not distinct from target_branch_id
        and period.period_month = target_period_month
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.list_staff_payroll_history(
  target_school_id uuid,
  target_branch_id uuid default null,
  target_limit integer default 100
)
returns table (
  entry_id uuid, branch_id uuid, period_month date, payee_kind text,
  teacher_id uuid, membership_id uuid, employee_id uuid,
  payee_name text, role_label text, base_amount numeric,
  additions numeric, deductions numeric, advances numeric, net_amount numeric,
  entry_status text, payment_id uuid, payment_amount numeric,
  payment_method text, payment_date date, payment_status text,
  payment_reference text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_VIEW_REQUIRED';
  end if;
  if target_limit is null or target_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'PAYROLL_HISTORY_LIMIT_INVALID';
  end if;

  return query
  select entry.id, entry.branch_id, period.period_month, entry.payee_kind,
    entry.teacher_id, entry.membership_id, entry.employee_id,
    entry.payee_name_snapshot, entry.payee_role_snapshot,
    entry.base_amount, entry.additions, entry.deductions, entry.advances,
    entry.net_amount, entry.status, payment.id, payment.amount,
    payment.payment_method, payment.payment_date, payment.status,
    payment.reference_number
  from public.payroll_entries as entry
  join public.payroll_periods as period
    on period.school_id = entry.school_id and period.id = entry.period_id
  left join lateral (
    select candidate.* from public.payroll_payments as candidate
    where candidate.school_id = entry.school_id
      and candidate.payroll_entry_id = entry.id
    order by candidate.created_at desc, candidate.id desc limit 1
  ) as payment on true
  where entry.school_id = target_school_id
    and entry.branch_id is not distinct from target_branch_id
  order by period.period_month desc, entry.payee_name_snapshot, entry.id
  limit target_limit;
end;
$$;

-- The first payroll prototype managed jobs on login memberships. Keep its data for
-- notification compatibility, but close its mutation/read RPCs so the independent
-- employee directory is the only staff-management surface. The guards also keep
-- this migration testable from a clean payroll schema.
do $$
declare
  legacy_signature text;
begin
  foreach legacy_signature in array array[
    'public.list_payroll_staff_candidates(uuid,uuid)',
    'public.list_payroll_staff(uuid,uuid)',
    'public.upsert_payroll_staff_position(uuid,uuid,text,text,uuid)',
    'public.deactivate_payroll_staff_position(uuid,uuid)'
  ] loop
    if to_regprocedure(legacy_signature) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', legacy_signature);
    end if;
  end loop;
end;
$$;

revoke all on function public.list_staff_employees(uuid, uuid) from public, anon;
revoke all on function public.save_staff_employee(uuid, uuid, uuid, text, text, text, text, text, date, text, uuid, uuid) from public, anon;
revoke all on function public.set_staff_employee_status(uuid, uuid, text) from public, anon;
revoke all on function public.create_employee_compensation(uuid, uuid, uuid, numeric, date, date, text) from public, anon;
revoke all on function public.get_staff_payroll_workspace(uuid, uuid, date) from public, anon;
revoke all on function public.list_staff_payroll_history(uuid, uuid, integer) from public, anon;
grant execute on function public.list_staff_employees(uuid, uuid) to authenticated;
grant execute on function public.save_staff_employee(uuid, uuid, uuid, text, text, text, text, text, date, text, uuid, uuid) to authenticated;
grant execute on function public.set_staff_employee_status(uuid, uuid, text) to authenticated;
grant execute on function public.create_employee_compensation(uuid, uuid, uuid, numeric, date, date, text) to authenticated;
grant execute on function public.get_staff_payroll_workspace(uuid, uuid, date) to authenticated;
grant execute on function public.list_staff_payroll_history(uuid, uuid, integer) to authenticated;

commit;
