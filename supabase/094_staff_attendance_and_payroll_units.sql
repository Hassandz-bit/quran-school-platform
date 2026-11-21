-- QuranOS: staff attendance and unit-based payroll
-- Migration 094: teachers are paid per completed session by default; employees per attended day.
-- Monthly, hourly, task-based and manual compensation remain configurable per person.

begin;

alter table public.payroll_compensation_profiles
  add column if not exists pay_unit text not null default 'month';

update public.payroll_compensation_profiles
set pay_unit = case payee_kind
  when 'teacher' then 'session'
  when 'employee' then 'day'
  else 'month'
end
where pay_unit = 'month';

alter table public.payroll_compensation_profiles
  add constraint payroll_compensation_pay_unit_check
  check (pay_unit in ('session', 'day', 'hour', 'month', 'task', 'manual'));

alter table public.payroll_entries
  add column if not exists pay_unit_snapshot text not null default 'month',
  add column if not exists unit_rate_snapshot numeric(12,2),
  add column if not exists units_count_snapshot numeric(10,2) not null default 1;

create table public.staff_attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  branch_id uuid,
  payee_kind text not null,
  teacher_id uuid,
  employee_id uuid,
  attendance_date date not null,
  unit_kind text not null,
  units numeric(10,2) not null default 1,
  status text not null,
  session_label text,
  note text,
  recorded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_attendance_branch_fk
    foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint staff_attendance_teacher_fk
    foreign key (school_id, branch_id, teacher_id)
    references public.teachers(school_id, branch_id, id),
  constraint staff_attendance_employee_fk
    foreign key (school_id, employee_id)
    references public.employees(school_id, id),
  constraint staff_attendance_payee_kind_check
    check (payee_kind in ('teacher', 'employee')),
  constraint staff_attendance_exact_payee_check check (
    (payee_kind = 'teacher' and teacher_id is not null and employee_id is null and branch_id is not null)
    or (payee_kind = 'employee' and employee_id is not null and teacher_id is null)
  ),
  constraint staff_attendance_unit_check
    check (unit_kind in ('session', 'day', 'hour', 'task')),
  constraint staff_attendance_units_check check (units between 0 and 100),
  constraint staff_attendance_status_check
    check (status in ('present', 'late', 'partial', 'absent', 'excused', 'leave')),
  constraint staff_attendance_absence_units_check
    check (status not in ('absent', 'leave') or units = 0),
  constraint staff_attendance_session_label_check
    check (session_label is null or char_length(btrim(session_label)) between 1 and 120),
  constraint staff_attendance_note_check
    check (note is null or char_length(btrim(note)) between 1 and 500)
);

create index staff_attendance_school_branch_date_idx
  on public.staff_attendance_records (school_id, branch_id, attendance_date desc);
create index staff_attendance_teacher_date_idx
  on public.staff_attendance_records (school_id, teacher_id, attendance_date desc)
  where teacher_id is not null;
create index staff_attendance_employee_date_idx
  on public.staff_attendance_records (school_id, employee_id, attendance_date desc)
  where employee_id is not null;
create unique index staff_attendance_one_employee_day_idx
  on public.staff_attendance_records (school_id, employee_id, attendance_date)
  where employee_id is not null and unit_kind = 'day';
create unique index staff_attendance_teacher_session_label_idx
  on public.staff_attendance_records (school_id, teacher_id, attendance_date, session_label)
  where teacher_id is not null and unit_kind = 'session';

create trigger staff_attendance_set_updated_at
before update on public.staff_attendance_records
for each row execute function public.set_updated_at();

alter table public.staff_attendance_records enable row level security;
revoke all on public.staff_attendance_records from public, anon, authenticated;

create or replace function public.list_staff_attendance_candidates(
  target_school_id uuid,
  target_branch_id uuid default null
)
returns table (
  payee_kind text,
  teacher_id uuid,
  employee_id uuid,
  branch_id uuid,
  full_name text,
  job_label text,
  pay_unit text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'STAFF_ATTENDANCE_VIEW_REQUIRED';
  end if;

  return query
  select 'teacher'::text, teacher.id, null::uuid, teacher.branch_id,
    btrim(concat_ws(' ', teacher.first_name, teacher.last_name)),
    'المعلم'::text,
    coalesce(profile.pay_unit, 'session')
  from public.teachers as teacher
  left join lateral (
    select compensation.pay_unit
    from public.payroll_compensation_profiles as compensation
    where compensation.school_id = teacher.school_id
      and compensation.payee_kind = 'teacher'
      and compensation.teacher_id = teacher.id
      and compensation.status = 'active'
      and compensation.effective_from <= current_date
      and (compensation.effective_to is null or compensation.effective_to >= current_date)
    order by compensation.effective_from desc
    limit 1
  ) as profile on true
  where teacher.school_id = target_school_id
    and teacher.branch_id is not distinct from target_branch_id
    and teacher.status = 'active'
  union all
  select 'employee'::text, null::uuid, employee.id, employee.branch_id,
    employee.full_name,
    case employee.job_code
      when 'manager' then 'المدير'
      when 'deputy_manager' then 'نائب المدير'
      when 'bursar' then 'المقتصد'
      when 'teacher' then 'المعلم'
      when 'guard' then 'الحارس'
      when 'cleaner' then 'عامل النظافة'
      when 'driver' then 'السائق'
      else coalesce(employee.custom_job_title, 'موظف')
    end,
    coalesce(profile.pay_unit, 'day')
  from public.employees as employee
  left join lateral (
    select compensation.pay_unit
    from public.payroll_compensation_profiles as compensation
    where compensation.school_id = employee.school_id
      and compensation.payee_kind = 'employee'
      and compensation.employee_id = employee.id
      and compensation.status = 'active'
      and compensation.effective_from <= current_date
      and (compensation.effective_to is null or compensation.effective_to >= current_date)
    order by compensation.effective_from desc
    limit 1
  ) as profile on true
  where employee.school_id = target_school_id
    and employee.branch_id is not distinct from target_branch_id
    and employee.status = 'active'
  order by 5;
end;
$$;

create or replace function public.list_staff_attendance_records(
  target_school_id uuid,
  target_branch_id uuid default null,
  target_from date default (date_trunc('month', current_date)::date),
  target_to date default current_date
)
returns table (
  record_id uuid,
  attendance_date date,
  payee_kind text,
  teacher_id uuid,
  employee_id uuid,
  full_name text,
  unit_kind text,
  units numeric,
  status text,
  session_label text,
  note text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id)
  then
    raise exception using errcode = '42501', message = 'STAFF_ATTENDANCE_VIEW_REQUIRED';
  end if;
  if target_from is null or target_to is null or target_to < target_from
    or target_to - target_from > 93 then
    raise exception using errcode = '22023', message = 'STAFF_ATTENDANCE_DATE_RANGE_INVALID';
  end if;

  return query
  select record.id, record.attendance_date, record.payee_kind,
    record.teacher_id, record.employee_id,
    case when record.payee_kind = 'teacher'
      then btrim(concat_ws(' ', teacher.first_name, teacher.last_name))
      else employee.full_name end,
    record.unit_kind, record.units, record.status, record.session_label, record.note
  from public.staff_attendance_records as record
  left join public.teachers as teacher
    on teacher.school_id = record.school_id and teacher.id = record.teacher_id
  left join public.employees as employee
    on employee.school_id = record.school_id and employee.id = record.employee_id
  where record.school_id = target_school_id
    and record.branch_id is not distinct from target_branch_id
    and record.attendance_date between target_from and target_to
  order by record.attendance_date desc, record.created_at desc;
end;
$$;

create or replace function public.record_staff_attendance(
  target_school_id uuid,
  target_branch_id uuid,
  target_payee_kind text,
  target_teacher_id uuid,
  target_employee_id uuid,
  target_attendance_date date,
  target_unit_kind text,
  target_units numeric,
  target_status text,
  target_session_label text default null,
  target_note text default null
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
    raise exception using errcode = '42501', message = 'STAFF_ATTENDANCE_MANAGE_REQUIRED';
  end if;

  if target_attendance_date is null
    or target_payee_kind not in ('teacher', 'employee')
    or target_unit_kind not in ('session', 'day', 'hour', 'task')
    or target_status not in ('present', 'late', 'partial', 'absent', 'excused', 'leave')
    or target_units is null or target_units < 0 or target_units > 100
    or (target_status in ('absent', 'leave') and target_units <> 0)
    or (target_status in ('present', 'late', 'partial') and target_units <= 0)
    or (target_payee_kind = 'teacher' and target_unit_kind = 'session'
      and nullif(btrim(target_session_label), '') is null)
    or (target_payee_kind = 'teacher' and (
      target_teacher_id is null or target_employee_id is not null or target_branch_id is null
      or not exists (
        select 1 from public.teachers as teacher
        where teacher.school_id = target_school_id
          and teacher.branch_id = target_branch_id
          and teacher.id = target_teacher_id
          and teacher.status = 'active'
      )
    ))
    or (target_payee_kind = 'employee' and (
      target_employee_id is null or target_teacher_id is not null
      or not exists (
        select 1 from public.employees as employee
        where employee.school_id = target_school_id
          and employee.id = target_employee_id
          and employee.branch_id is not distinct from target_branch_id
          and employee.status = 'active'
      )
    ))
  then
    raise exception using errcode = '22023', message = 'STAFF_ATTENDANCE_INPUT_INVALID';
  end if;

  insert into public.staff_attendance_records (
    school_id, branch_id, payee_kind, teacher_id, employee_id,
    attendance_date, unit_kind, units, status, session_label, note, recorded_by
  ) values (
    target_school_id, target_branch_id, target_payee_kind, target_teacher_id, target_employee_id,
    target_attendance_date, target_unit_kind, target_units, target_status,
    nullif(btrim(target_session_label), ''), nullif(btrim(target_note), ''), (select auth.uid())
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.create_employee_compensation_with_unit(
  target_school_id uuid,
  target_branch_id uuid,
  target_employee_id uuid,
  target_base_amount numeric,
  target_effective_from date,
  target_effective_to date,
  target_notes text,
  target_pay_unit text
)
returns uuid
language plpgsql security definer set search_path = ''
as $
declare
  created_id uuid;
  old_values jsonb;
begin
  if target_pay_unit not in ('session', 'day', 'hour', 'month', 'task', 'manual') then
    raise exception using errcode = '22023', message = 'PAYROLL_UNIT_INVALID';
  end if;
  created_id := public.create_employee_compensation(
    target_school_id, target_branch_id, target_employee_id,
    target_base_amount, target_effective_from, target_effective_to, target_notes
  );
  select to_jsonb(profile) into old_values
  from public.payroll_compensation_profiles as profile
  where profile.school_id = target_school_id and profile.id = created_id;
  update public.payroll_compensation_profiles
  set pay_unit = target_pay_unit
  where school_id = target_school_id and id = created_id;
  insert into public.payroll_audit_events (
    school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id
  ) values (
    target_school_id, 'compensation', created_id, 'status_update', old_values,
    jsonb_build_object('pay_unit', target_pay_unit), (select auth.uid())
  );
  return created_id;
end;
$;

create or replace function public.create_payroll_compensation_with_unit(
  target_school_id uuid,
  target_branch_id uuid,
  target_payee_kind text,
  target_teacher_id uuid,
  target_membership_id uuid,
  target_base_amount numeric,
  target_effective_from date,
  target_effective_to date,
  target_notes text,
  target_pay_unit text
)
returns uuid
language plpgsql security definer set search_path = ''
as $
declare
  created_id uuid;
  old_values jsonb;
begin
  if target_payee_kind <> 'teacher'
    or target_pay_unit not in ('session', 'day', 'hour', 'month', 'task', 'manual') then
    raise exception using errcode = '22023', message = 'PAYROLL_UNIT_INVALID';
  end if;
  created_id := public.create_payroll_compensation(
    target_school_id, target_branch_id, target_payee_kind,
    target_teacher_id, target_membership_id, target_base_amount,
    target_effective_from, target_effective_to, target_notes
  );
  select to_jsonb(profile) into old_values
  from public.payroll_compensation_profiles as profile
  where profile.school_id = target_school_id and profile.id = created_id;
  update public.payroll_compensation_profiles
  set pay_unit = target_pay_unit
  where school_id = target_school_id and id = created_id;
  insert into public.payroll_audit_events (
    school_id, entity_type, entity_id, operation, old_values, new_values, actor_profile_id
  ) values (
    target_school_id, 'compensation', created_id, 'status_update', old_values,
    jsonb_build_object('pay_unit', target_pay_unit), (select auth.uid())
  );
  return created_id;
end;
$;

create or replace function public.set_payroll_compensation_unit(
  target_school_id uuid,
  target_compensation_id uuid,
  target_pay_unit text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  target_branch uuid;
begin
  select profile.branch_id into target_branch
  from public.payroll_compensation_profiles as profile
  where profile.school_id = target_school_id and profile.id = target_compensation_id;
  if not found then return false; end if;
  if (select auth.uid()) is null
    or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id, target_branch)
  then
    raise exception using errcode = '42501', message = 'PAYROLL_MANAGE_REQUIRED';
  end if;
  if target_pay_unit not in ('session', 'day', 'hour', 'month', 'task', 'manual') then
    raise exception using errcode = '22023', message = 'PAYROLL_UNIT_INVALID';
  end if;
  update public.payroll_compensation_profiles
  set pay_unit = target_pay_unit
  where school_id = target_school_id and id = target_compensation_id;
  return found;
end;
$$;

-- Rebuild only draft payroll lines. Session/day/hour/task rates are multiplied by
-- approved units entered for the payee in the selected month. Monthly/manual remain fixed.
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
    payee_name_snapshot, payee_role_snapshot, base_amount,
    pay_unit_snapshot, unit_rate_snapshot, units_count_snapshot, created_by
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
    profile.base_amount * calculated.units_count,
    profile.pay_unit, profile.base_amount, calculated.units_count, (select auth.uid())
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
  cross join lateral (
    select case
      when profile.pay_unit in ('month', 'manual') then 1::numeric
      else coalesce((
        select sum(attendance.units)
        from public.staff_attendance_records as attendance
        where attendance.school_id = profile.school_id
          and attendance.branch_id is not distinct from profile.branch_id
          and attendance.attendance_date between target_period_month and month_end
          and attendance.status in ('present', 'late', 'partial', 'excused')
          and (
            (profile.payee_kind = 'teacher' and attendance.payee_kind = 'teacher'
              and attendance.teacher_id = profile.teacher_id and attendance.unit_kind = profile.pay_unit)
            or (profile.payee_kind = 'employee' and attendance.payee_kind = 'employee'
              and attendance.employee_id = profile.employee_id and attendance.unit_kind = profile.pay_unit)
          )
      ), 0::numeric)
    end as units_count
  ) as calculated
  where profile.school_id = target_school_id
    and profile.branch_id is not distinct from target_branch_id
    and profile.status = 'active'
    and profile.effective_from <= month_end
    and (profile.effective_to is null or profile.effective_to >= target_period_month)
    and calculated.units_count > 0
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

revoke all on function public.list_staff_attendance_candidates(uuid, uuid) from public, anon;
revoke all on function public.list_staff_attendance_records(uuid, uuid, date, date) from public, anon;
revoke all on function public.record_staff_attendance(uuid, uuid, text, uuid, uuid, date, text, numeric, text, text, text) from public, anon;
revoke all on function public.create_employee_compensation_with_unit(uuid, uuid, uuid, numeric, date, date, text, text) from public, anon;
revoke all on function public.create_payroll_compensation_with_unit(uuid, uuid, text, uuid, uuid, numeric, date, date, text, text) from public, anon;
revoke all on function public.set_payroll_compensation_unit(uuid, uuid, text) from public, anon;
grant execute on function public.list_staff_attendance_candidates(uuid, uuid) to authenticated;
grant execute on function public.list_staff_attendance_records(uuid, uuid, date, date) to authenticated;
grant execute on function public.record_staff_attendance(uuid, uuid, text, uuid, uuid, date, text, numeric, text, text, text) to authenticated;
grant execute on function public.create_employee_compensation_with_unit(uuid, uuid, uuid, numeric, date, date, text, text) to authenticated;
grant execute on function public.create_payroll_compensation_with_unit(uuid, uuid, text, uuid, uuid, numeric, date, date, text, text) to authenticated;
grant execute on function public.set_payroll_compensation_unit(uuid, uuid, text) to authenticated;
grant execute on function public.generate_payroll_period(uuid, uuid, date, text) to authenticated;

commit;
