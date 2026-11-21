-- QuranOS: staff weekly schedules, leave and school closures, and safe automatic absence marking.
begin;

-- Automated records are system-generated and therefore have no interactive user actor.\nalter table public.staff_attendance_records alter column recorded_by drop not null;\nalter table public.staff_attendance_history alter column changed_by drop not null;\n\ncreate table if not exists public.employee_work_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  branch_id uuid,
  employee_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  unit_kind text not null default 'day' check (unit_kind in ('day','hour','task','session')),
  units numeric(8,2) not null default 1 check (units > 0 and units <= 100),
  schedule_label text not null,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_work_schedules_time_check check (start_time < end_time),
  constraint employee_work_schedules_label_check check (char_length(btrim(schedule_label)) between 1 and 120),
  constraint employee_work_schedules_employee_fk foreign key (school_id, employee_id)
    references public.employees(school_id, id) on delete cascade,
  constraint employee_work_schedules_branch_fk foreign key (school_id, branch_id)
    references public.branches(school_id, id)
);
create index if not exists employee_work_schedules_due_idx
  on public.employee_work_schedules (weekday, active, end_time);
create index if not exists employee_work_schedules_employee_idx
  on public.employee_work_schedules (school_id, employee_id, weekday);

create table if not exists public.staff_leave_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  branch_id uuid,
  payee_kind text not null check (payee_kind in ('teacher','employee')),
  teacher_id uuid,
  employee_id uuid,
  start_date date not null,
  end_date date not null,
  leave_type text not null default 'annual' check (leave_type in ('annual','sick','personal','unpaid','other')),
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  note text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_leave_dates_check check (end_date >= start_date and end_date - start_date <= 366),
  constraint staff_leave_payee_check check (
    (payee_kind='teacher' and teacher_id is not null and employee_id is null and branch_id is not null)
    or (payee_kind='employee' and employee_id is not null and teacher_id is null)
  ),
  constraint staff_leave_teacher_fk foreign key (school_id, branch_id, teacher_id)
    references public.teachers(school_id, branch_id, id) on delete cascade,
  constraint staff_leave_employee_fk foreign key (school_id, employee_id)
    references public.employees(school_id, id) on delete cascade
);
create index if not exists staff_leave_active_dates_idx
  on public.staff_leave_periods (school_id, start_date, end_date, status);

create table if not exists public.staff_closure_days (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  branch_id uuid,
  closure_date date not null,
  reason text not null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint staff_closure_reason_check check (char_length(btrim(reason)) between 2 and 160),
  constraint staff_closure_branch_fk foreign key (school_id, branch_id)
    references public.branches(school_id, id)
);
create unique index if not exists staff_closure_unique_scope_date
  on public.staff_closure_days (school_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), closure_date);

alter table public.employee_work_schedules enable row level security;
alter table public.staff_leave_periods enable row level security;
alter table public.staff_closure_days enable row level security;
revoke all on public.employee_work_schedules, public.staff_leave_periods, public.staff_closure_days from public, anon, authenticated;

create or replace function public.list_staff_work_schedules(target_school_id uuid, target_branch_id uuid default null)
returns table (
  schedule_id uuid, payee_kind text, teacher_id uuid, employee_id uuid, full_name text,
  schedule_label text, weekday smallint, start_time time, end_time time,
  unit_kind text, units numeric, active boolean, source_kind text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id, target_branch_id) then
    raise exception using errcode='42501', message='STAFF_SCHEDULE_VIEW_REQUIRED';
  end if;
  return query
  select schedule.id, 'employee'::text, null::uuid, employee.id, employee.full_name,
    schedule.schedule_label, schedule.weekday, schedule.start_time, schedule.end_time,
    schedule.unit_kind, schedule.units, schedule.active, 'employee'::text
  from public.employee_work_schedules schedule
  join public.employees employee on employee.school_id=schedule.school_id and employee.id=schedule.employee_id
  where schedule.school_id=target_school_id and schedule.branch_id is not distinct from target_branch_id
  union all
  select class.id, 'teacher'::text, teacher.id, null::uuid,
    btrim(concat_ws(' ',teacher.first_name,teacher.last_name)),
    class.name, weekday.weekday, coalesce(class.start_time,duwam.start_time),
    coalesce(class.end_time,duwam.end_time), 'session'::text, 1::numeric, true, 'class'::text
  from public.classes class
  join public.class_teachers assignment on assignment.school_id=class.school_id
    and assignment.branch_id=class.branch_id and assignment.class_id=class.id and assignment.status='active'
  join public.teachers teacher on teacher.school_id=assignment.school_id and teacher.id=assignment.teacher_id and teacher.status='active'
  left join public.duwams duwam on duwam.school_id=class.school_id and duwam.branch_id=class.branch_id and duwam.id=class.duwam_id and duwam.status='active'
  cross join lateral unnest(
    case when cardinality(class.study_days)>0 then class.study_days else coalesce(duwam.study_days,'{}'::text[]) end
  ) day_name
  cross join lateral (select case day_name
    when 'sunday' then 0 when 'monday' then 1 when 'tuesday' then 2
    when 'wednesday' then 3 when 'thursday' then 4 when 'friday' then 5
    when 'saturday' then 6 else null end::smallint as weekday) weekday
  where class.school_id=target_school_id and class.branch_id is not distinct from target_branch_id
    and class.status='active' and weekday.weekday is not null
    and coalesce(class.start_time,duwam.start_time) is not null
    and coalesce(class.end_time,duwam.end_time) is not null
  order by 7,8,5;
end;
$$;

create or replace function public.save_employee_work_schedule(
  target_school_id uuid, target_branch_id uuid, target_employee_id uuid,
  target_weekday smallint, target_start_time time, target_end_time time,
  target_unit_kind text, target_units numeric, target_schedule_label text,
  target_schedule_id uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare saved_id uuid;
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id,target_branch_id) then
    raise exception using errcode='42501', message='STAFF_SCHEDULE_MANAGE_REQUIRED';
  end if;
  if target_weekday not between 0 and 6 or target_start_time is null or target_end_time is null
    or target_start_time >= target_end_time or target_unit_kind not in ('day','hour','task','session')
    or target_units is null or target_units <= 0 or target_units > 100
    or char_length(btrim(coalesce(target_schedule_label,''))) not between 1 and 120
    or not exists(select 1 from public.employees e where e.school_id=target_school_id
      and e.id=target_employee_id and e.branch_id is not distinct from target_branch_id and e.status='active') then
    raise exception using errcode='22023', message='STAFF_SCHEDULE_INPUT_INVALID';
  end if;
  if target_schedule_id is null then
    insert into public.employee_work_schedules(school_id,branch_id,employee_id,weekday,start_time,end_time,unit_kind,units,schedule_label,created_by)
    values(target_school_id,target_branch_id,target_employee_id,target_weekday,target_start_time,target_end_time,target_unit_kind,target_units,btrim(target_schedule_label),(select auth.uid()))
    returning id into saved_id;
  else
    update public.employee_work_schedules set weekday=target_weekday,start_time=target_start_time,end_time=target_end_time,
      unit_kind=target_unit_kind,units=target_units,schedule_label=btrim(target_schedule_label),updated_at=now()
    where school_id=target_school_id and branch_id is not distinct from target_branch_id
      and employee_id=target_employee_id and id=target_schedule_id returning id into saved_id;
    if saved_id is null then raise exception using errcode='P0002', message='STAFF_SCHEDULE_NOT_FOUND'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.set_employee_work_schedule_active(
  target_school_id uuid, target_schedule_id uuid, target_active boolean
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare target_branch uuid;
begin
  select branch_id into target_branch from public.employee_work_schedules
  where school_id=target_school_id and id=target_schedule_id;
  if not found then return false; end if;
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id,target_branch) then
    raise exception using errcode='42501', message='STAFF_SCHEDULE_MANAGE_REQUIRED';
  end if;
  update public.employee_work_schedules set active=target_active,updated_at=now()
  where school_id=target_school_id and id=target_schedule_id;
  return found;
end;
$$;

create or replace function public.list_staff_leave_periods(target_school_id uuid, target_branch_id uuid default null)
returns table (
  leave_id uuid, payee_kind text, teacher_id uuid, employee_id uuid, full_name text,
  start_date date, end_date date, leave_type text, status text, note text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id,target_branch_id) then
    raise exception using errcode='42501', message='STAFF_LEAVE_VIEW_REQUIRED';
  end if;
  return query
  select l.id,l.payee_kind,l.teacher_id,l.employee_id,
    case when l.payee_kind='teacher' then btrim(concat_ws(' ',t.first_name,t.last_name)) else e.full_name end,
    l.start_date,l.end_date,l.leave_type,l.status,l.note
  from public.staff_leave_periods l
  left join public.teachers t on t.school_id=l.school_id and t.id=l.teacher_id
  left join public.employees e on e.school_id=l.school_id and e.id=l.employee_id
  where l.school_id=target_school_id and l.branch_id is not distinct from target_branch_id
  order by l.start_date desc,l.created_at desc;
end;
$$;

create or replace function public.save_staff_leave_period(
  target_school_id uuid,target_branch_id uuid,target_payee_kind text,
  target_teacher_id uuid,target_employee_id uuid,target_start_date date,target_end_date date,
  target_leave_type text,target_note text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare saved_id uuid;
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id,target_branch_id) then
    raise exception using errcode='42501', message='STAFF_LEAVE_MANAGE_REQUIRED';
  end if;
  if target_start_date is null or target_end_date is null or target_end_date<target_start_date
    or target_end_date-target_start_date>366 or target_leave_type not in ('annual','sick','personal','unpaid','other')
    or char_length(coalesce(target_note,''))>500
    or (target_payee_kind='teacher' and (target_teacher_id is null or target_employee_id is not null or target_branch_id is null
      or not exists(select 1 from public.teachers where school_id=target_school_id and branch_id=target_branch_id and id=target_teacher_id)))
    or (target_payee_kind='employee' and (target_employee_id is null or target_teacher_id is not null
      or not exists(select 1 from public.employees where school_id=target_school_id and branch_id is not distinct from target_branch_id and id=target_employee_id))) then
    raise exception using errcode='22023', message='STAFF_LEAVE_INPUT_INVALID';
  end if;
  insert into public.staff_leave_periods(school_id,branch_id,payee_kind,teacher_id,employee_id,start_date,end_date,leave_type,status,note,created_by)
  values(target_school_id,target_branch_id,target_payee_kind,target_teacher_id,target_employee_id,target_start_date,target_end_date,target_leave_type,'approved',nullif(btrim(target_note),''),(select auth.uid()))
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.save_staff_closure_day(
  target_school_id uuid,target_branch_id uuid,target_closure_date date,target_reason text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare saved_id uuid;
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_manage_scope(target_school_id,target_branch_id) then
    raise exception using errcode='42501', message='STAFF_CLOSURE_MANAGE_REQUIRED';
  end if;
  if target_closure_date is null or char_length(btrim(coalesce(target_reason,''))) not between 2 and 160 then
    raise exception using errcode='22023', message='STAFF_CLOSURE_INPUT_INVALID';
  end if;
  insert into public.staff_closure_days(school_id,branch_id,closure_date,reason,created_by)
  values(target_school_id,target_branch_id,target_closure_date,btrim(target_reason),(select auth.uid()))
  on conflict do nothing returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.list_staff_closure_days(target_school_id uuid,target_branch_id uuid default null)
returns table(closure_id uuid,closure_date date,reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.current_profile_is_active()
    or not public.payroll_can_view_scope(target_school_id,target_branch_id) then
    raise exception using errcode='42501', message='STAFF_CLOSURE_VIEW_REQUIRED';
  end if;
  return query select c.id,c.closure_date,c.reason from public.staff_closure_days c
  where c.school_id=target_school_id and (c.branch_id is null or c.branch_id is not distinct from target_branch_id)
  order by c.closure_date desc;
end;
$$;

create or replace function public.generate_due_staff_absences()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
  v_local timestamp;
  v_day smallint;
  v_day_name text;
begin
  for r in
    select e.school_id,e.branch_id,e.id employee_id,s.id schedule_id,s.weekday,s.start_time,s.end_time,
      s.unit_kind,s.units,s.schedule_label,coalesce(nullif(sc.timezone,''),'Africa/Algiers') timezone_name
    from public.employee_work_schedules s
    join public.employees e on e.school_id=s.school_id and e.id=s.employee_id and e.status='active'
    join public.schools sc on sc.id=s.school_id and sc.status='active'
    where s.active
  loop
    v_local := timezone(case when exists(select 1 from pg_timezone_names z where z.name=r.timezone_name)
      then r.timezone_name else 'Africa/Algiers' end, now());
    v_day := extract(dow from v_local)::smallint;
    if v_day<>r.weekday or v_local::date + r.end_time + interval '30 minutes' > v_local then continue; end if;
    if exists(select 1 from public.staff_closure_days c where c.school_id=r.school_id
      and c.closure_date=v_local::date and (c.branch_id is null or c.branch_id is not distinct from r.branch_id)) then continue; end if;
    if exists(select 1 from public.staff_leave_periods l where l.school_id=r.school_id
      and l.payee_kind='employee' and l.employee_id=r.employee_id and l.status='approved'
      and v_local::date between l.start_date and l.end_date) then continue; end if;
    if exists(select 1 from public.staff_attendance_records a where a.school_id=r.school_id
      and a.employee_id=r.employee_id and a.attendance_date=v_local::date
      and (r.unit_kind<>'day' or a.unit_kind='day')) then continue; end if;
    insert into public.staff_attendance_records(school_id,branch_id,payee_kind,employee_id,attendance_date,
      unit_kind,units,status,session_label,note,recorded_by)
    values(r.school_id,r.branch_id,'employee',r.employee_id,v_local::date,r.unit_kind,0,'absent',
      r.schedule_label,'غياب آلي بعد انتهاء الدوام المجدول',null)
    on conflict do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;

  for r in
    select c.school_id,c.branch_id,c.id class_id,c.name class_name,t.id teacher_id,
      coalesce(c.start_time,d.start_time) start_time,coalesce(c.end_time,d.end_time) end_time,
      case when cardinality(c.study_days)>0 then c.study_days else coalesce(d.study_days,'{}'::text[]) end study_days,
      coalesce(nullif(sc.timezone,''),'Africa/Algiers') timezone_name
    from public.classes c
    join public.class_teachers ct on ct.school_id=c.school_id and ct.branch_id=c.branch_id
      and ct.class_id=c.id and ct.status='active'
    join public.teachers t on t.school_id=ct.school_id and t.id=ct.teacher_id and t.status='active'
    left join public.duwams d on d.school_id=c.school_id and d.branch_id=c.branch_id and d.id=c.duwam_id and d.status='active'
    join public.schools sc on sc.id=c.school_id and sc.status='active'
    where c.status='active' and coalesce(c.start_time,d.start_time) is not null
      and coalesce(c.end_time,d.end_time) is not null
  loop
    v_local := timezone(case when exists(select 1 from pg_timezone_names z where z.name=r.timezone_name)
      then r.timezone_name else 'Africa/Algiers' end, now());
    v_day := extract(dow from v_local)::smallint;
    v_day_name := case v_day when 0 then 'sunday' when 1 then 'monday' when 2 then 'tuesday'
      when 3 then 'wednesday' when 4 then 'thursday' when 5 then 'friday' else 'saturday' end;
    if not (v_day_name=any(r.study_days)) or v_local::date + r.end_time + interval '30 minutes' > v_local then continue; end if;
    if exists(select 1 from public.staff_closure_days c where c.school_id=r.school_id
      and c.closure_date=v_local::date and (c.branch_id is null or c.branch_id is not distinct from r.branch_id)) then continue; end if;
    if exists(select 1 from public.staff_leave_periods l where l.school_id=r.school_id
      and l.payee_kind='teacher' and l.teacher_id=r.teacher_id and l.status='approved'
      and v_local::date between l.start_date and l.end_date) then continue; end if;
    if exists(select 1 from public.staff_attendance_records a where a.school_id=r.school_id
      and a.teacher_id=r.teacher_id and a.attendance_date=v_local::date
      and a.unit_kind='session' and a.session_label=r.class_name) then continue; end if;
    insert into public.staff_attendance_records(school_id,branch_id,payee_kind,teacher_id,attendance_date,
      unit_kind,units,status,session_label,note,recorded_by)
    values(r.school_id,r.branch_id,'teacher',r.teacher_id,v_local::date,'session',0,'absent',
      r.class_name,'غياب آلي بعد انتهاء الحصة المجدولة',null)
    on conflict do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.list_staff_work_schedules(uuid,uuid) from public,anon;
revoke all on function public.save_employee_work_schedule(uuid,uuid,uuid,smallint,time,time,text,numeric,text,uuid) from public,anon;
revoke all on function public.set_employee_work_schedule_active(uuid,uuid,boolean) from public,anon;
revoke all on function public.list_staff_leave_periods(uuid,uuid) from public,anon;
revoke all on function public.save_staff_leave_period(uuid,uuid,text,uuid,uuid,date,date,text,text) from public,anon;
revoke all on function public.save_staff_closure_day(uuid,uuid,date,text) from public,anon;
revoke all on function public.list_staff_closure_days(uuid,uuid) from public,anon;
revoke all on function public.generate_due_staff_absences() from public,anon,authenticated;
grant execute on function public.list_staff_work_schedules(uuid,uuid) to authenticated;
grant execute on function public.save_employee_work_schedule(uuid,uuid,uuid,smallint,time,time,text,numeric,text,uuid) to authenticated;
grant execute on function public.set_employee_work_schedule_active(uuid,uuid,boolean) to authenticated;
grant execute on function public.list_staff_leave_periods(uuid,uuid) to authenticated;
grant execute on function public.save_staff_leave_period(uuid,uuid,text,uuid,uuid,date,date,text,text) to authenticated;
grant execute on function public.save_staff_closure_day(uuid,uuid,date,text) to authenticated;
grant execute on function public.list_staff_closure_days(uuid,uuid) to authenticated;
grant execute on function public.generate_due_staff_absences() to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='quranos_staff_absence_auto';
    perform cron.schedule('quranos_staff_absence_auto','*/15 * * * *',
      'select public.generate_due_staff_absences();');
  end if;
end;
$$;

comment on table public.employee_work_schedules is 'Weekly work schedules for non-teaching employees; teacher schedules derive from assigned class and duwam schedules.';
comment on table public.staff_leave_periods is 'Approved staff leave periods excluded from automatic absence marking.';
comment on table public.staff_closure_days is 'School or branch closure dates excluded from automatic absence marking.';

commit;
