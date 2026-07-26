-- Quran School SaaS - memorization and revision tracking module
-- Adds class-scoped Quran follow-up records, immutable audit history,
-- permissions, least-privilege grants, and tenant/branch/class RLS.

begin;

create or replace function public.can_access_memorization_class(
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
    target_permission_code in ('memorization.view', 'memorization.manage')
    and public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.classes as target_class
      where target_class.school_id = target_school_id
        and target_class.branch_id = target_branch_id
        and target_class.id = target_class_id
        and target_class.status = 'active'
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

revoke all on function public.can_access_memorization_class(uuid, uuid, uuid, text)
from public;
revoke execute on function public.can_access_memorization_class(uuid, uuid, uuid, text)
from anon;
grant execute on function public.can_access_memorization_class(uuid, uuid, uuid, text)
to authenticated;

create table public.memorization_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  record_date date not null default current_date,
  session_type text not null,
  surah_number smallint not null,
  ayah_start smallint not null,
  ayah_end smallint not null,
  rating smallint not null,
  errors_count smallint not null default 0,
  notes text,
  next_assignment text,
  recorded_by uuid not null,
  last_modified_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memorization_records_class_scope_fk
    foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  constraint memorization_records_student_fk
    foreign key (student_id) references public.students(id),
  constraint memorization_records_teacher_fk
    foreign key (teacher_id) references public.teachers(id),
  constraint memorization_records_recorded_by_fk
    foreign key (recorded_by) references public.profiles(id),
  constraint memorization_records_last_modified_by_fk
    foreign key (last_modified_by) references public.profiles(id),
  constraint memorization_records_session_type_check
    check (
      session_type in (
        'new_memorization',
        'near_revision',
        'distant_revision',
        'assessment'
      )
    ),
  constraint memorization_records_surah_number_check
    check (surah_number between 1 and 114),
  constraint memorization_records_ayah_range_check
    check (
      ayah_start between 1 and 286
      and ayah_end between 1 and 286
      and ayah_start <= ayah_end
    ),
  constraint memorization_records_rating_check
    check (rating between 1 and 5),
  constraint memorization_records_errors_count_check
    check (errors_count between 0 and 100),
  constraint memorization_records_notes_length_check
    check (
      notes is null
      or char_length(btrim(notes)) between 1 and 1000
    ),
  constraint memorization_records_next_assignment_length_check
    check (
      next_assignment is null
      or char_length(btrim(next_assignment)) between 1 and 1000
    ),
  constraint memorization_records_scope_id_unique
    unique (school_id, branch_id, class_id, id)
);

comment on table public.memorization_records is
  'Quran memorization, revision, and assessment follow-up records scoped to one active class.';
comment on column public.memorization_records.session_type is
  'One of new_memorization, near_revision, distant_revision, or assessment.';
comment on column public.memorization_records.surah_number is
  'Quran surah number from 1 through 114; the UI maps the number to the Arabic name.';
comment on column public.memorization_records.rating is
  'Teacher rating from 1 through 5.';

create table public.memorization_record_history (
  id uuid primary key default gen_random_uuid(),
  memorization_record_id uuid not null,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  operation text not null,
  old_values jsonb,
  new_values jsonb not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  constraint memorization_history_record_scope_fk
    foreign key (school_id, branch_id, class_id, memorization_record_id)
    references public.memorization_records(school_id, branch_id, class_id, id),
  constraint memorization_history_student_fk
    foreign key (student_id) references public.students(id),
  constraint memorization_history_teacher_fk
    foreign key (teacher_id) references public.teachers(id),
  constraint memorization_history_changed_by_fk
    foreign key (changed_by) references public.profiles(id),
  constraint memorization_history_operation_check
    check (operation in ('insert', 'update'))
);

comment on table public.memorization_record_history is
  'Append-only audit history for memorization follow-up records, written only by a protected trigger.';

create index memorization_records_class_scope_idx
  on public.memorization_records (school_id, branch_id, class_id);
create index memorization_records_student_date_idx
  on public.memorization_records (student_id, record_date desc);
create index memorization_records_teacher_date_idx
  on public.memorization_records (teacher_id, record_date desc);
create index memorization_records_recorded_by_idx
  on public.memorization_records (recorded_by);
create index memorization_records_last_modified_by_idx
  on public.memorization_records (last_modified_by);
create index memorization_history_record_changed_at_idx
  on public.memorization_record_history (memorization_record_id, changed_at desc);
create index memorization_history_record_scope_idx
  on public.memorization_record_history (
    school_id,
    branch_id,
    class_id,
    memorization_record_id
  );
create index memorization_history_student_idx
  on public.memorization_record_history (student_id);
create index memorization_history_teacher_idx
  on public.memorization_record_history (teacher_id);
create index memorization_history_changed_by_idx
  on public.memorization_record_history (changed_by);

create trigger memorization_records_set_updated_at
before update on public.memorization_records
for each row execute function public.set_updated_at();

create or replace function public.prepare_memorization_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_school_id uuid;
  resolved_branch_id uuid;
  resolved_teacher_profile_id uuid;
  caller_has_non_teacher_manage boolean;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_AUTH_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    select target_class.school_id, target_class.branch_id
      into strict resolved_school_id, resolved_branch_id
    from public.classes as target_class
    where target_class.id = new.class_id
      and target_class.status = 'active';

    if not exists (
      select 1
      from public.students as student
      where student.id = new.student_id
        and student.school_id = resolved_school_id
        and student.branch_id = resolved_branch_id
        and student.class_id = new.class_id
        and student.status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_STUDENT_NOT_IN_ACTIVE_CLASS';
    end if;

    select teacher.profile_id
      into resolved_teacher_profile_id
    from public.teachers as teacher
    join public.class_teachers as class_teacher
      on class_teacher.school_id = teacher.school_id
     and class_teacher.branch_id = teacher.branch_id
     and class_teacher.teacher_id = teacher.id
     and class_teacher.class_id = new.class_id
     and class_teacher.status = 'active'
    where teacher.id = new.teacher_id
      and teacher.school_id = resolved_school_id
      and teacher.branch_id = resolved_branch_id
      and teacher.status = 'active';

    if not found then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_TEACHER_NOT_ASSIGNED_TO_CLASS';
    end if;

    select exists (
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
      where membership.school_id = resolved_school_id
        and membership.profile_id = (select auth.uid())
        and membership.status = 'active'
        and role.code <> 'teacher'
        and permission.code = 'memorization.manage'
        and (
          membership_role.branch_id is null
          or membership_role.branch_id = resolved_branch_id
        )
    ) into caller_has_non_teacher_manage;

    if not caller_has_non_teacher_manage
      and resolved_teacher_profile_id is distinct from (select auth.uid())
    then
      raise exception using
        errcode = '42501',
        message = 'MEMORIZATION_TEACHER_IDENTITY_MISMATCH';
    end if;

    new.school_id := resolved_school_id;
    new.branch_id := resolved_branch_id;
    new.recorded_by := (select auth.uid());
    new.last_modified_by := (select auth.uid());
  else
    if new.school_id is distinct from old.school_id
      or new.branch_id is distinct from old.branch_id
      or new.class_id is distinct from old.class_id
      or new.student_id is distinct from old.student_id
      or new.teacher_id is distinct from old.teacher_id
      or new.recorded_by is distinct from old.recorded_by
    then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_IDENTITY_FIELDS_IMMUTABLE';
    end if;

    new.last_modified_by := (select auth.uid());
  end if;

  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23503',
      message = 'MEMORIZATION_ACTIVE_CLASS_NOT_FOUND';
end;
$$;

revoke all on function public.prepare_memorization_record() from public;
revoke execute on function public.prepare_memorization_record() from anon, authenticated;

create trigger memorization_records_prepare
before insert or update on public.memorization_records
for each row execute function public.prepare_memorization_record();

create or replace function public.audit_memorization_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.memorization_record_history (
      memorization_record_id,
      school_id,
      branch_id,
      class_id,
      student_id,
      teacher_id,
      operation,
      old_values,
      new_values,
      changed_by
    ) values (
      new.id,
      new.school_id,
      new.branch_id,
      new.class_id,
      new.student_id,
      new.teacher_id,
      'insert',
      null,
      jsonb_build_object(
        'record_date', new.record_date,
        'session_type', new.session_type,
        'surah_number', new.surah_number,
        'ayah_start', new.ayah_start,
        'ayah_end', new.ayah_end,
        'rating', new.rating,
        'errors_count', new.errors_count,
        'notes', new.notes,
        'next_assignment', new.next_assignment
      ),
      new.recorded_by
    );
  elsif row(
      new.record_date,
      new.session_type,
      new.surah_number,
      new.ayah_start,
      new.ayah_end,
      new.rating,
      new.errors_count,
      new.notes,
      new.next_assignment
    ) is distinct from row(
      old.record_date,
      old.session_type,
      old.surah_number,
      old.ayah_start,
      old.ayah_end,
      old.rating,
      old.errors_count,
      old.notes,
      old.next_assignment
    )
  then
    insert into public.memorization_record_history (
      memorization_record_id,
      school_id,
      branch_id,
      class_id,
      student_id,
      teacher_id,
      operation,
      old_values,
      new_values,
      changed_by
    ) values (
      new.id,
      new.school_id,
      new.branch_id,
      new.class_id,
      new.student_id,
      new.teacher_id,
      'update',
      jsonb_build_object(
        'record_date', old.record_date,
        'session_type', old.session_type,
        'surah_number', old.surah_number,
        'ayah_start', old.ayah_start,
        'ayah_end', old.ayah_end,
        'rating', old.rating,
        'errors_count', old.errors_count,
        'notes', old.notes,
        'next_assignment', old.next_assignment
      ),
      jsonb_build_object(
        'record_date', new.record_date,
        'session_type', new.session_type,
        'surah_number', new.surah_number,
        'ayah_start', new.ayah_start,
        'ayah_end', new.ayah_end,
        'rating', new.rating,
        'errors_count', new.errors_count,
        'notes', new.notes,
        'next_assignment', new.next_assignment
      ),
      new.last_modified_by
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_memorization_record() from public;
revoke execute on function public.audit_memorization_record() from anon, authenticated;

create trigger memorization_records_audit
after insert or update on public.memorization_records
for each row execute function public.audit_memorization_record();

insert into public.permissions (code, module, name_ar, description)
values
  (
    'memorization.view',
    'memorization',
    'عرض متابعة الحفظ',
    'عرض سجلات الحفظ والمراجعة والاختبارات ضمن النطاق المصرح به'
  ),
  (
    'memorization.manage',
    'memorization',
    'إدارة متابعة الحفظ',
    'تسجيل متابعة الحفظ والمراجعة والاختبارات وتعديلها ضمن النطاق المصرح به'
  )
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'memorization.view'),
    ('school_admin', 'memorization.manage'),
    ('branch_manager', 'memorization.view'),
    ('branch_manager', 'memorization.manage'),
    ('academic_supervisor', 'memorization.view'),
    ('teacher', 'memorization.view'),
    ('teacher', 'memorization.manage')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

alter table public.memorization_records enable row level security;
alter table public.memorization_record_history enable row level security;

revoke all on public.memorization_records,
  public.memorization_record_history
from public, anon, authenticated;

grant select on public.memorization_records to authenticated;
grant insert (
  class_id,
  student_id,
  teacher_id,
  record_date,
  session_type,
  surah_number,
  ayah_start,
  ayah_end,
  rating,
  errors_count,
  notes,
  next_assignment
) on public.memorization_records to authenticated;
grant update (
  record_date,
  session_type,
  surah_number,
  ayah_start,
  ayah_end,
  rating,
  errors_count,
  notes,
  next_assignment
) on public.memorization_records to authenticated;

grant select on public.memorization_record_history to authenticated;

create policy memorization_records_select_authorized
on public.memorization_records
for select to authenticated
using (
  public.can_access_memorization_class(
    school_id,
    branch_id,
    class_id,
    'memorization.view'
  )
  or public.can_access_memorization_class(
    school_id,
    branch_id,
    class_id,
    'memorization.manage'
  )
);

create policy memorization_records_insert_authorized
on public.memorization_records
for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and last_modified_by = (select auth.uid())
  and public.can_access_memorization_class(
    school_id,
    branch_id,
    class_id,
    'memorization.manage'
  )
);

create policy memorization_records_update_authorized
on public.memorization_records
for update to authenticated
using (
  public.can_access_memorization_class(
    school_id,
    branch_id,
    class_id,
    'memorization.manage'
  )
)
with check (
  last_modified_by = (select auth.uid())
  and public.can_access_memorization_class(
    school_id,
    branch_id,
    class_id,
    'memorization.manage'
  )
);

create policy memorization_history_select_authorized
on public.memorization_record_history
for select to authenticated
using (
  public.can_access_memorization_class(
    school_id,
    branch_id,
    class_id,
    'memorization.view'
  )
  or public.can_access_memorization_class(
    school_id,
    branch_id,
    class_id,
    'memorization.manage'
  )
);

-- Records are corrected through audited UPDATE operations. No browser DELETE
-- grants or DELETE policies exist. Audit history is append-only and has no
-- browser INSERT, UPDATE, or DELETE privileges.

commit;
