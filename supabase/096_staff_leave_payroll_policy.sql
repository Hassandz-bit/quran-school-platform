-- QuranOS: explicit admin-controlled payroll treatment for staff leave.
begin;

alter table public.staff_leave_periods
  add column if not exists pay_treatment text not null default 'unconfigured',
  add column if not exists paid_percentage numeric(5,2) not null default 100,
  add column if not exists policy_set_by uuid references public.profiles(id),
  add column if not exists policy_set_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'staff_leave_pay_treatment_check'
      and conrelid = 'public.staff_leave_periods'::regclass
  ) then
    alter table public.staff_leave_periods
      add constraint staff_leave_pay_treatment_check
      check (pay_treatment in ('paid','unpaid','partial','unconfigured'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'staff_leave_paid_percentage_check'
      and conrelid = 'public.staff_leave_periods'::regclass
  ) then
    alter table public.staff_leave_periods
      add constraint staff_leave_paid_percentage_check
      check (paid_percentage between 0 and 100);
  end if;
end;
$$;

drop function if exists public.list_staff_leave_periods(uuid, uuid);
create function public.list_staff_leave_periods(
  target_school_id uuid,
  target_branch_id uuid default null
)
returns table (
  leave_id uuid, payee_kind text, teacher_id uuid, employee_id uuid, full_name text,
  start_date date, end_date date, leave_type text, status text, note text,
  pay_treatment text, paid_percentage numeric, policy_set_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id) then
    raise exception using errcode='42501', message='STAFF_LEAVE_VIEW_REQUIRED';
  end if;
  return query
  select l.id,l.payee_kind,l.teacher_id,l.employee_id,
    case when l.payee_kind='teacher' then btrim(concat_ws(' ',t.first_name,t.last_name)) else e.full_name end,
    l.start_date,l.end_date,l.leave_type,l.status,l.note,
    l.pay_treatment,l.paid_percentage,l.policy_set_at
  from public.staff_leave_periods l
  left join public.teachers t on t.school_id=l.school_id and t.id=l.teacher_id
  left join public.employees e on e.school_id=l.school_id and e.id=l.employee_id
  where l.school_id=target_school_id and l.branch_id is not distinct from target_branch_id
  order by l.start_date desc,l.created_at desc;
end;
$$;

drop function if exists public.save_staff_leave_period(uuid,uuid,text,uuid,uuid,date,date,text,text);
create function public.save_staff_leave_period(
  target_school_id uuid,
  target_branch_id uuid,
  target_payee_kind text,
  target_teacher_id uuid,
  target_employee_id uuid,
  target_start_date date,
  target_end_date date,
  target_leave_type text,
  target_pay_treatment text,
  target_paid_percentage numeric,
  target_note text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  saved_id uuid;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id,target_branch_id) then
    raise exception using errcode='42501', message='STAFF_LEAVE_MANAGE_REQUIRED';
  end if;
  if target_start_date is null or target_end_date is null or target_end_date<target_start_date
    or target_end_date-target_start_date>366
    or target_leave_type not in ('annual','sick','personal','unpaid','other')
    or target_pay_treatment not in ('paid','unpaid','partial')
    or target_paid_percentage is null or target_paid_percentage not between 0 and 100
    or (target_pay_treatment <> 'partial' and target_paid_percentage <> 100)
    or char_length(coalesce(target_note,''))>500
    or (target_payee_kind='teacher' and (target_teacher_id is null or target_employee_id is not null or target_branch_id is null
      or not exists(select 1 from public.teachers where school_id=target_school_id and branch_id=target_branch_id and id=target_teacher_id)))
    or (target_payee_kind='employee' and (target_employee_id is null or target_teacher_id is not null
      or not exists(select 1 from public.employees where school_id=target_school_id and branch_id is not distinct from target_branch_id and id=target_employee_id))) then
    raise exception using errcode='22023', message='STAFF_LEAVE_INPUT_INVALID';
  end if;

  if exists (
    select 1 from public.staff_leave_periods existing
    where existing.school_id=target_school_id
      and existing.payee_kind=target_payee_kind
      and existing.status='approved'
      and existing.start_date <= target_end_date
      and existing.end_date >= target_start_date
      and (
        (target_payee_kind='teacher' and existing.teacher_id=target_teacher_id)
        or (target_payee_kind='employee' and existing.employee_id=target_employee_id)
      )
  ) then
    raise exception using errcode='23P01', message='STAFF_LEAVE_PERIOD_OVERLAP';
  end if;

  insert into public.staff_leave_periods(
    school_id,branch_id,payee_kind,teacher_id,employee_id,start_date,end_date,
    leave_type,status,note,created_by,pay_treatment,paid_percentage,policy_set_by,policy_set_at
  )
  values(
    target_school_id,target_branch_id,target_payee_kind,target_teacher_id,target_employee_id,
    target_start_date,target_end_date,target_leave_type,'approved',nullif(btrim(target_note),''),
    actor_id,target_pay_treatment,
    case when target_pay_treatment='partial' then target_paid_percentage else 100 end,
    actor_id,now()
  )
  returning id into saved_id;

  insert into public.payroll_audit_events(
    school_id,entity_type,entity_id,operation,new_values,actor_profile_id
  )
  select target_school_id,'staff_leave',saved_id,'create',
    jsonb_build_object(
      'payee_kind',target_payee_kind,
      'teacher_id',target_teacher_id,
      'employee_id',target_employee_id,
      'start_date',target_start_date,
      'end_date',target_end_date,
      'leave_type',target_leave_type,
      'pay_treatment',target_pay_treatment,
      'paid_percentage',case when target_pay_treatment='partial' then target_paid_percentage else 100 end
    ),actor_id;
  return saved_id;
end;
$$;

revoke all on function public.list_staff_leave_periods(uuid,uuid) from public,anon;
revoke all on function public.save_staff_leave_period(uuid,uuid,text,uuid,uuid,date,date,text,text,numeric,text) from public,anon;
grant execute on function public.list_staff_leave_periods(uuid,uuid) to authenticated;
grant execute on function public.save_staff_leave_period(uuid,uuid,text,uuid,uuid,date,date,text,text,numeric,text) to authenticated;

commit;
