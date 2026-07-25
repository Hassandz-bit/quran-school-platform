-- Quran School SaaS - attendance module
-- Adds class-scoped attendance sessions, student records, immutable history,
-- permissions, least-privilege grants, and tenant/branch/class RLS.

begin;

-- Resolve attendance access without depending on the caller being able to read
-- teachers or class_teachers directly. The built-in teacher role is always
-- restricted to active assigned classes. Other authorized roles retain their
-- school-wide or branch-scoped membership boundary.
create or replace function public.can_access_attendance_class(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.classes as target_class
      where target_class.school_id = target_school_id
        and target_class.branch_id = target_branch_id
        and target_class.id = target_class_id
    )
    and (
      exists (
        select 1
        from public.school_memberships as membership
        join public.membership_roles as membership_role
          on membership_role.school_id = membership.school_id
         and membership_role.membership_id = membership.id
        join public.roles as role
          on role.school_id = membership_role.school_id
         and role.id = membership_role.role_id
         and role.status = 'active'
        join public.role_permissions as role_permission
          on role_permission.school_id = role.school_id
         and role_permission.role_id = role.id
        join public.permissions as permission
          on permission.id = role_permission.permission_id
        where membership.school_id = target_school_id
          and membership.profile_id = (select auth.uid())
          and membership.status = 'active'
          and role.code <> 'teacher'
          and permission.code = target_permission_code
          and (
            membership_role.branch_id is null
            or membership_role.branch_id = target_branch_id
          )
      )
      or (
        exists (
          select 1
          from public.school_memberships as membership
          join public.membership_roles as membership_role
            on membership_role.school_id = membership.school_id
           and membership_role.membership_id = membership.id
          join public.roles as role
            on role.school_id = membership_role.school_id
           and role.id = membership_role.role_id
           and role.status = 'active'
          join public.role_permissions as role_permission
            on role_permission.school_id = role.school_id
           and role_permission.role_id = role.id
          join public.permissions as permission
            on permission.id = role_permission.permission_id
          where membership.school_id = target_school_id
            and membership.profile_id = (select auth.uid())
            and membership.status = 'active'
            and role.code = 'teacher'
            and permission.code = target_permission_code
            and (
              membership_role.branch_id is null
              or membership_role.branch_id = target_branch_id
            )
        )
        and exists (
          select 1
          from public.teachers as teacher
          join public.class_teachers as class_teacher
            on class_teacher.school_id = teacher.school_id
           and class_teacher.branch_id = teacher.branch_id
           and class_teacher.teacher_id = teacher.id
           and class_teacher.status = 'active'
          where teacher.school_id = target_school_id
            and teacher.branch_id = target_branch_id
            and teacher.profile_id = (select auth.uid())
            and teacher.status = 'active'
            and class_teacher.class_id = target_class_id
        )
      )
    );
$$;

revoke all on function public.can_access_attendance_class(uuid, uuid, uuid, text)
from public;
revoke execute on function public.can_access_attendance_class(uuid, uuid, uuid, text)
from anon;
grant execute on function public.can_access_attendance_class(uuid, uuid, uuid, text)
to authenticated;

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  session_date date not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sessions_class_branch_school_fk
    foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  constraint attendance_sessions_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint attendance_sessions_class_date_unique
    unique (class_id, session_date),
  constraint attendance_sessions_scope_id_unique
    unique (school_id, branch_id, class_id, id)
);

comment on table public.attendance_sessions is
  'One attendance session per Quran class and calendar date.';
comment on column public.attendance_sessions.school_id is
  'Immutable tenant boundary enforced by RLS and composite foreign keys.';
comment on column public.attendance_sessions.branch_id is
  'Immutable branch boundary shared with the selected class.';
comment on column public.attendance_sessions.class_id is
  'Class whose active enrolled students may receive attendance records.';

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status text not null,
  arrival_time time without time zone,
  note text,
  recorded_by uuid not null,
  last_modified_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_session_scope_fk
    foreign key (school_id, branch_id, class_id, session_id)
    references public.attendance_sessions(school_id, branch_id, class_id, id),
  constraint attendance_records_student_fk
    foreign key (student_id) references public.students(id),
  constraint attendance_records_recorded_by_fk
    foreign key (recorded_by) references public.profiles(id),
  constraint attendance_records_last_modified_by_fk
    foreign key (last_modified_by) references public.profiles(id),
  constraint attendance_records_status_check
    check (status in ('present', 'absent', 'late', 'excused_absence')),
  constraint attendance_records_arrival_time_check
    check (
      arrival_time is null
      or status in ('present', 'late')
    ),
  constraint attendance_records_note_length_check
    check (
      note is null
      or char_length(btrim(note)) between 1 and 500
    ),
  constraint attendance_records_session_student_unique
    unique (session_id, student_id)
);

comment on table public.attendance_records is
  'Current attendance state for one student in one session; updates are copied to immutable history.';
comment on column public.attendance_records.recorded_by is
  'Profile that created the attendance row; set by a protected trigger.';
comment on column public.attendance_records.last_modified_by is
  'Profile that last changed the attendance row; set by a protected trigger.';

create table public.attendance_record_history (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  operation text not null,
  old_status text,
  new_status text not null,
  old_arrival_time time without time zone,
  new_arrival_time time without time zone,
  old_note text,
  new_note text,
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  constraint attendance_history_record_fk
    foreign key (attendance_record_id)
    references public.attendance_records(id),
  constraint attendance_history_session_scope_fk
    foreign key (school_id, branch_id, class_id, session_id)
    references public.attendance_sessions(school_id, branch_id, class_id, id),
  constraint attendance_history_student_fk
    foreign key (student_id) references public.students(id),
  constraint attendance_history_changed_by_fk
    foreign key (changed_by) references public.profiles(id),
  constraint attendance_history_operation_check
    check (operation in ('insert', 'update')),
  constraint attendance_history_old_status_check
    check (
      old_status is null
      or old_status in ('present', 'absent', 'late', 'excused_absence')
    ),
  constraint attendance_history_new_status_check
    check (
      new_status in ('present', 'absent', 'late', 'excused_absence')
    )
);

comment on table public.attendance_record_history is
  'Append-only audit history written only by the attendance audit trigger.';

create index attendance_sessions_school_branch_date_idx
  on public.attendance_sessions (school_id, branch_id, session_date);

create index attendance_sessions_school_class_date_idx
  on public.attendance_sessions (school_id, class_id, session_date);

create index attendance_records_session_status_idx
  on public.attendance_records (session_id, status);

create index attendance_records_school_class_student_idx
  on public.attendance_records (school_id, class_id, student_id);

create index attendance_records_student_idx
  on public.attendance_records (student_id);

create index attendance_history_record_changed_at_idx
  on public.attendance_record_history (attendance_record_id, changed_at desc);

create index attendance_history_school_class_changed_at_idx
  on public.attendance_record_history (school_id, class_id, changed_at desc);

create trigger attendance_sessions_set_updated_at
before update on public.attendance_sessions
for each row execute function public.set_updated_at();

create trigger attendance_records_set_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

-- Derive immutable scope and actor columns server-side. On INSERT, validate that
-- the student is currently active in the exact session class. Later transfers
-- do not destroy or block edits to the historical attendance row.
create or replace function public.prepare_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_school_id uuid;
  resolved_branch_id uuid;
  resolved_class_id uuid;
begin
  if tg_op = 'INSERT' then
    select
      session.school_id,
      session.branch_id,
      session.class_id
      into strict
        resolved_school_id,
        resolved_branch_id,
        resolved_class_id
    from public.attendance_sessions as session
    where session.id = new.session_id;

    if not exists (
      select 1
      from public.students as student
      where student.id = new.student_id
        and student.school_id = resolved_school_id
        and student.branch_id = resolved_branch_id
        and student.class_id = resolved_class_id
        and student.status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'ATTENDANCE_STUDENT_NOT_IN_ACTIVE_CLASS';
    end if;

    new.school_id := resolved_school_id;
    new.branch_id := resolved_branch_id;
    new.class_id := resolved_class_id;
    new.recorded_by := (select auth.uid());
    new.last_modified_by := (select auth.uid());
  else
    if new.school_id is distinct from old.school_id
      or new.branch_id is distinct from old.branch_id
      or new.class_id is distinct from old.class_id
      or new.session_id is distinct from old.session_id
      or new.student_id is distinct from old.student_id
      or new.recorded_by is distinct from old.recorded_by
    then
      raise exception using
        errcode = '23514',
        message = 'ATTENDANCE_IDENTITY_FIELDS_IMMUTABLE';
    end if;

    new.last_modified_by := (select auth.uid());
  end if;

  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23503',
      message = 'ATTENDANCE_SESSION_NOT_FOUND';
end;
$$;

revoke all on function public.prepare_attendance_record() from public;
revoke execute on function public.prepare_attendance_record() from anon, authenticated;

create trigger attendance_records_prepare
before insert or update on public.attendance_records
for each row execute function public.prepare_attendance_record();

create or replace function public.audit_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.attendance_record_history (
      attendance_record_id,
      school_id,
      branch_id,
      class_id,
      session_id,
      student_id,
      operation,
      old_status,
      new_status,
      old_arrival_time,
      new_arrival_time,
      old_note,
      new_note,
      changed_by
    )
    values (
      new.id,
      new.school_id,
      new.branch_id,
      new.class_id,
      new.session_id,
      new.student_id,
      'insert',
      null,
      new.status,
      null,
      new.arrival_time,
      null,
      new.note,
      new.recorded_by
    );
  elsif row(new.status, new.arrival_time, new.note)
    is distinct from row(old.status, old.arrival_time, old.note)
  then
    insert into public.attendance_record_history (
      attendance_record_id,
      school_id,
      branch_id,
      class_id,
      session_id,
      student_id,
      operation,
      old_status,
      new_status,
      old_arrival_time,
      new_arrival_time,
      old_note,
      new_note,
      changed_by
    )
    values (
      new.id,
      new.school_id,
      new.branch_id,
      new.class_id,
      new.session_id,
      new.student_id,
      'update',
      old.status,
      new.status,
      old.arrival_time,
      new.arrival_time,
      old.note,
      new.note,
      new.last_modified_by
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_attendance_record() from public;
revoke execute on function public.audit_attendance_record() from anon, authenticated;

create trigger attendance_records_audit
after insert or update on public.attendance_records
for each row execute function public.audit_attendance_record();

insert into public.permissions (code, module, name_ar, description)
values
  (
    'attendance.view',
    'attendance',
    'عرض الحضور',
    'عرض جلسات وسجلات الحضور ضمن المدرسة والفروع والحلقات المصرح بها'
  ),
  (
    'attendance.manage',
    'attendance',
    'إدارة الحضور',
    'إنشاء جلسات الحضور وتسجيل الحالات وتعديلها ضمن النطاق المصرح به'
  )
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'attendance.view'),
    ('school_admin', 'attendance.manage'),
    ('branch_manager', 'attendance.view'),
    ('branch_manager', 'attendance.manage'),
    ('academic_supervisor', 'attendance.view'),
    ('academic_supervisor', 'attendance.manage'),
    ('teacher', 'attendance.view'),
    ('teacher', 'attendance.manage')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_record_history enable row level security;

revoke all on public.attendance_sessions,
  public.attendance_records,
  public.attendance_record_history
from public, anon, authenticated;

grant select on public.attendance_sessions to authenticated;
grant insert (school_id, branch_id, class_id, session_date)
  on public.attendance_sessions to authenticated;
grant update (session_date)
  on public.attendance_sessions to authenticated;

grant select on public.attendance_records to authenticated;
grant insert (session_id, student_id, status, arrival_time, note)
  on public.attendance_records to authenticated;
grant update (status, arrival_time, note)
  on public.attendance_records to authenticated;

grant select on public.attendance_record_history to authenticated;

create policy attendance_sessions_select_authorized
on public.attendance_sessions
for select to authenticated
using (
  public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.view'
  )
  or public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
);

create policy attendance_sessions_insert_authorized
on public.attendance_sessions
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
);

create policy attendance_sessions_update_authorized
on public.attendance_sessions
for update to authenticated
using (
  public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
)
with check (
  public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
);

create policy attendance_records_select_authorized
on public.attendance_records
for select to authenticated
using (
  public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.view'
  )
  or public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
);

create policy attendance_records_insert_authorized
on public.attendance_records
for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and last_modified_by = (select auth.uid())
  and public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
);

create policy attendance_records_update_authorized
on public.attendance_records
for update to authenticated
using (
  public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
)
with check (
  last_modified_by = (select auth.uid())
  and public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
);

create policy attendance_history_select_authorized
on public.attendance_record_history
for select to authenticated
using (
  public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.view'
  )
  or public.can_access_attendance_class(
    school_id,
    branch_id,
    class_id,
    'attendance.manage'
  )
);

-- No browser DELETE grants or DELETE policies exist. Audit history is
-- append-only and has no browser INSERT or UPDATE privileges.

commit;
