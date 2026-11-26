-- QuranOS: apply admin-selected leave pay treatment to generated payroll snapshots.
begin;

alter table public.payroll_entries
  add column if not exists scheduled_units_snapshot numeric not null default 0,
  add column if not exists paid_leave_units_snapshot numeric not null default 0,
  add column if not exists unpaid_leave_units_snapshot numeric not null default 0,
  add column if not exists leave_deduction_amount_snapshot numeric not null default 0;

create or replace function public.staff_leave_payroll_adjustment(
  target_school_id uuid,
  target_branch_id uuid,
  target_payee_kind text,
  target_teacher_id uuid,
  target_employee_id uuid,
  target_pay_unit text,
  target_period_start date,
  target_period_end date
)
returns table(scheduled_units numeric, paid_leave_units numeric, unpaid_leave_units numeric)
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select generated_day::date as work_date
    from generate_series(target_period_start::timestamp, target_period_end::timestamp, interval '1 day') generated_day
  ),
  scheduled as (
    select d.work_date, schedule.units::numeric as units
    from days d
    join public.employee_work_schedules schedule
      on schedule.school_id=target_school_id
     and schedule.branch_id is not distinct from target_branch_id
     and schedule.employee_id=target_employee_id
     and schedule.active
     and schedule.weekday=extract(dow from d.work_date)::smallint
     and (target_pay_unit in ('month','manual') or schedule.unit_kind=target_pay_unit)
    where target_payee_kind='employee'

    union all

    select d.work_date,
      case
        when target_pay_unit='day' then 1::numeric
        when target_pay_unit='hour' then sum(
          extract(epoch from (coalesce(class.end_time,duwam.end_time)-coalesce(class.start_time,duwam.start_time)))/3600
        )::numeric
        else count(*)::numeric
      end as units
    from days d
    join public.classes class
      on class.school_id=target_school_id
     and class.branch_id is not distinct from target_branch_id
     and class.status='active'
    join public.class_teachers assignment
      on assignment.school_id=class.school_id
     and assignment.branch_id=class.branch_id
     and assignment.class_id=class.id
     and assignment.teacher_id=target_teacher_id
     and assignment.status='active'
    left join public.duwams duwam
      on duwam.school_id=class.school_id
     and duwam.branch_id=class.branch_id
     and duwam.id=class.duwam_id
     and duwam.status='active'
    cross join lateral unnest(
      case when cardinality(class.study_days)>0 then class.study_days
        else coalesce(duwam.study_days,'{}'::text[]) end
    ) as study_day(day_name)
    where target_payee_kind='teacher'
      and coalesce(class.start_time,duwam.start_time) is not null
      and coalesce(class.end_time,duwam.end_time) is not null
      and target_pay_unit in ('month','manual','session','day','hour')
      and study_day.day_name=case extract(dow from d.work_date)::integer
        when 0 then 'sunday' when 1 then 'monday' when 2 then 'tuesday'
        when 3 then 'wednesday' when 4 then 'thursday' when 5 then 'friday'
        else 'saturday' end
    group by d.work_date
  ),
  with_policy as (
    select scheduled.work_date,scheduled.units,
      leave.pay_treatment,
      coalesce(leave.paid_percentage,100)::numeric as paid_percentage
    from scheduled
    left join lateral (
      select l.pay_treatment,l.paid_percentage
      from public.staff_leave_periods l
      where l.school_id=target_school_id
        and l.payee_kind=target_payee_kind
        and l.status='approved'
        and scheduled.work_date between l.start_date and l.end_date
        and (
          (target_payee_kind='teacher' and l.teacher_id=target_teacher_id)
          or (target_payee_kind='employee' and l.employee_id=target_employee_id)
        )
      order by l.created_at desc,l.id
      limit 1
    ) leave on true
  )
  select
    coalesce(sum(units),0)::numeric,
    coalesce(sum(case
      when pay_treatment='paid' then units
      when pay_treatment='partial' then units*paid_percentage/100
      else 0 end),0)::numeric,
    coalesce(sum(case
      when pay_treatment='unpaid' then units
      when pay_treatment='partial' then units*(100-paid_percentage)/100
      else 0 end),0)::numeric
  from with_policy;
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

  month_end := (target_period_month + interval '1 month - 1 day')::date;

  if exists (
    select 1 from public.staff_leave_periods leave
    where leave.school_id=target_school_id
      and leave.branch_id is not distinct from target_branch_id
      and leave.status='approved'
      and leave.start_date<=month_end and leave.end_date>=target_period_month
      and leave.pay_treatment='unconfigured'
  ) then
    raise exception using errcode='22023', message='STAFF_LEAVE_PAY_POLICY_REQUIRED';
  end if;

  if exists (
    select 1
    from public.payroll_compensation_profiles profile
    cross join lateral public.staff_leave_payroll_adjustment(
      profile.school_id,profile.branch_id,profile.payee_kind,profile.teacher_id,
      profile.employee_id,profile.pay_unit,target_period_month,month_end
    ) adjustment
    where profile.school_id=target_school_id
      and profile.branch_id is not distinct from target_branch_id
      and profile.status='active'
      and profile.effective_from<=month_end
      and (profile.effective_to is null or profile.effective_to>=target_period_month)
      and exists (
        select 1 from public.staff_leave_periods leave
        where leave.school_id=profile.school_id
          and leave.branch_id is not distinct from profile.branch_id
          and leave.status='approved'
          and leave.start_date<=month_end and leave.end_date>=target_period_month
          and (
            (profile.payee_kind='teacher' and leave.payee_kind='teacher' and leave.teacher_id=profile.teacher_id)
            or (profile.payee_kind='employee' and leave.payee_kind='employee' and leave.employee_id=profile.employee_id)
          )
      )
      and adjustment.scheduled_units=0
  ) then
    raise exception using errcode='22023', message='STAFF_LEAVE_SCHEDULE_REQUIRED';
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

  insert into public.payroll_entries (
    school_id, branch_id, period_id, compensation_profile_id,
    payee_kind, teacher_id, membership_id, employee_id,
    payee_name_snapshot, payee_role_snapshot, base_amount,
    pay_unit_snapshot, unit_rate_snapshot, units_count_snapshot,
    scheduled_units_snapshot, paid_leave_units_snapshot, unpaid_leave_units_snapshot,
    leave_deduction_amount_snapshot, created_by
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
    profile.base_amount * calculated.units_count * calculated.amount_factor,
    profile.pay_unit, profile.base_amount, calculated.units_count,
    leave_adjustment.scheduled_units, leave_adjustment.paid_leave_units,
    leave_adjustment.unpaid_leave_units,
    case when profile.pay_unit in ('month','manual') and leave_adjustment.unpaid_leave_units>0
      then profile.base_amount * (leave_adjustment.unpaid_leave_units/nullif(leave_adjustment.scheduled_units,0))
      else 0::numeric end,
    (select auth.uid())
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
  cross join lateral public.staff_leave_payroll_adjustment(
    profile.school_id,profile.branch_id,profile.payee_kind,profile.teacher_id,
    profile.employee_id,profile.pay_unit,target_period_month,month_end
  ) as leave_adjustment
  cross join lateral (
    select
      case
        when profile.pay_unit in ('month','manual') then 1::numeric
        else coalesce((
          select sum(attendance.units)
          from public.staff_attendance_records as attendance
          where attendance.school_id = profile.school_id
            and attendance.branch_id is not distinct from profile.branch_id
            and attendance.attendance_date between target_period_month and month_end
            and attendance.status in ('present', 'late', 'partial', 'excused')
            and not exists (
              select 1 from public.staff_leave_periods leave
              where leave.school_id=attendance.school_id
                and leave.payee_kind=attendance.payee_kind
                and leave.status='approved'
                and attendance.attendance_date between leave.start_date and leave.end_date
                and (
                  (attendance.payee_kind='teacher' and leave.teacher_id=attendance.teacher_id)
                  or (attendance.payee_kind='employee' and leave.employee_id=attendance.employee_id)
                )
            )
            and (
              (profile.payee_kind = 'teacher' and attendance.payee_kind = 'teacher'
                and attendance.teacher_id = profile.teacher_id and attendance.unit_kind = profile.pay_unit)
              or (profile.payee_kind = 'employee' and attendance.payee_kind = 'employee'
                and attendance.employee_id = profile.employee_id and attendance.unit_kind = profile.pay_unit)
            )
        ), 0::numeric) + leave_adjustment.paid_leave_units
      end as units_count,
      case
        when profile.pay_unit in ('month','manual') and leave_adjustment.unpaid_leave_units>0
          then greatest(0::numeric,1-(leave_adjustment.unpaid_leave_units/nullif(leave_adjustment.scheduled_units,0)))
        else 1::numeric
      end as amount_factor
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

revoke all on function public.staff_leave_payroll_adjustment(uuid,uuid,text,uuid,uuid,text,date,date) from public,anon,authenticated;
grant execute on function public.staff_leave_payroll_adjustment(uuid,uuid,text,uuid,uuid,text,date,date) to postgres;
grant execute on function public.generate_payroll_period(uuid,uuid,date,text) to authenticated;


create or replace function public.get_staff_payroll_workspace(
  target_school_id uuid,
  target_branch_id uuid default null,
  target_period_month date default (date_trunc('month', current_date))::date
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
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
        'base_amount', profile.base_amount, 'pay_unit', profile.pay_unit,
        'expected_units_per_week', profile.expected_units_per_week, 'effective_from', profile.effective_from,
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
        'base_amount', entry.base_amount, 'pay_unit', entry.pay_unit_snapshot,
        'unit_rate', entry.unit_rate_snapshot, 'units_count', entry.units_count_snapshot,
        'scheduled_units_snapshot', entry.scheduled_units_snapshot,
        'paid_leave_units_snapshot', entry.paid_leave_units_snapshot,
        'unpaid_leave_units_snapshot', entry.unpaid_leave_units_snapshot,
        'leave_deduction_amount_snapshot', entry.leave_deduction_amount_snapshot,
        'additions', entry.additions, 'deductions', entry.deductions,
        'advances', entry.advances, 'net_amount', entry.net_amount, 'status', entry.status,
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
$function$;


commit;
