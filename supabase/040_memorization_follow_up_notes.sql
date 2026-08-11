-- Quran School SaaS - memorization follow-up notes and recurring error tracking
-- V2 review migration only. Do not apply to Production manually.
-- Keeps academic observations append-oriented, exposes browser access through scoped RPCs only,
-- and derives recurrence from repeated observations instead of a mutable counter.

begin;

create table public.memorization_follow_up_notes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  source_record_id uuid,
  category text not null,
  priority smallint not null default 2,
  status text not null default 'open',
  surah_number smallint not null,
  ayah_start smallint not null,
  ayah_end smallint not null,
  note_text text not null,
  observed_on date not null default current_date,
  created_by uuid not null,
  last_modified_by uuid not null,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memorization_follow_up_notes_class_scope_fk
    foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  constraint memorization_follow_up_notes_student_fk
    foreign key (student_id) references public.students(id),
  constraint memorization_follow_up_notes_teacher_fk
    foreign key (teacher_id) references public.teachers(id),
  constraint memorization_follow_up_notes_source_record_fk
    foreign key (source_record_id) references public.memorization_records(id),
  constraint memorization_follow_up_notes_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint memorization_follow_up_notes_last_modified_by_fk
    foreign key (last_modified_by) references public.profiles(id),
  constraint memorization_follow_up_notes_resolved_by_fk
    foreign key (resolved_by) references public.profiles(id),
  constraint memorization_follow_up_notes_category_check
    check (
      category in (
        'memorization_error',
        'revision_weakness',
        'tajweed',
        'hesitation',
        'forgetting',
        'recurring_error',
        'other'
      )
    ),
  constraint memorization_follow_up_notes_priority_check
    check (priority between 1 and 3),
  constraint memorization_follow_up_notes_status_check
    check (status in ('open', 'improved', 'resolved')),
  constraint memorization_follow_up_notes_surah_check
    check (surah_number between 1 and 114),
  constraint memorization_follow_up_notes_ayah_range_check
    check (
      ayah_start between 1 and public.quran_surah_ayah_count(surah_number)
      and ayah_end between 1 and public.quran_surah_ayah_count(surah_number)
      and ayah_start <= ayah_end
    ),
  constraint memorization_follow_up_notes_text_check
    check (char_length(btrim(note_text)) between 1 and 1000),
  constraint memorization_follow_up_notes_resolution_shape_check
    check (
      (status = 'resolved' and resolved_by is not null and resolved_at is not null)
      or (status <> 'resolved' and resolved_by is null and resolved_at is null)
    ),
  constraint memorization_follow_up_notes_scope_id_unique
    unique (school_id, branch_id, class_id, id)
);

comment on table public.memorization_follow_up_notes is
  'Immutable-content academic observations for recurring memorization weaknesses. Only status may change; recurrence is derived from repeated matching observations.';
comment on column public.memorization_follow_up_notes.priority is
  'Follow-up priority: 1 high, 2 normal, 3 low.';
comment on column public.memorization_follow_up_notes.status is
  'Current follow-up state for this observation: open, improved, or resolved.';

create table public.memorization_follow_up_note_history (
  id uuid primary key default gen_random_uuid(),
  follow_up_note_id uuid not null,
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
  constraint memorization_follow_up_history_note_scope_fk
    foreign key (school_id, branch_id, class_id, follow_up_note_id)
    references public.memorization_follow_up_notes(school_id, branch_id, class_id, id),
  constraint memorization_follow_up_history_student_fk
    foreign key (student_id) references public.students(id),
  constraint memorization_follow_up_history_teacher_fk
    foreign key (teacher_id) references public.teachers(id),
  constraint memorization_follow_up_history_changed_by_fk
    foreign key (changed_by) references public.profiles(id),
  constraint memorization_follow_up_history_operation_check
    check (operation in ('insert', 'status_update'))
);

comment on table public.memorization_follow_up_note_history is
  'Append-only audit history for memorization follow-up observations and their status transitions.';

create index memorization_follow_up_notes_student_signature_idx
  on public.memorization_follow_up_notes (
    school_id,
    student_id,
    category,
    surah_number,
    ayah_start,
    ayah_end,
    observed_on desc,
    created_at desc
  );
create index memorization_follow_up_notes_student_status_idx
  on public.memorization_follow_up_notes (
    school_id,
    student_id,
    status,
    priority,
    observed_on desc
  );
create index memorization_follow_up_notes_origin_scope_idx
  on public.memorization_follow_up_notes (school_id, branch_id, class_id);
create index memorization_follow_up_notes_teacher_idx
  on public.memorization_follow_up_notes (teacher_id);
create index memorization_follow_up_notes_source_record_idx
  on public.memorization_follow_up_notes (source_record_id)
  where source_record_id is not null;
create index memorization_follow_up_notes_created_by_idx
  on public.memorization_follow_up_notes (created_by);
create index memorization_follow_up_notes_last_modified_by_idx
  on public.memorization_follow_up_notes (last_modified_by);
create index memorization_follow_up_notes_resolved_by_idx
  on public.memorization_follow_up_notes (resolved_by)
  where resolved_by is not null;
create index memorization_follow_up_history_note_changed_idx
  on public.memorization_follow_up_note_history (follow_up_note_id, changed_at desc);
create index memorization_follow_up_history_scope_idx
  on public.memorization_follow_up_note_history (
    school_id,
    branch_id,
    class_id,
    follow_up_note_id
  );
create index memorization_follow_up_history_changed_by_idx
  on public.memorization_follow_up_note_history (changed_by);

create or replace function public.has_non_teacher_memorization_manage(
  target_school_id uuid,
  target_branch_id uuid
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
        and permission.code = 'memorization.manage'
        and (
          membership_role.branch_id is null
          or membership_role.branch_id = target_branch_id
        )
    );
$$;

revoke all on function public.has_non_teacher_memorization_manage(uuid, uuid)
from public;
revoke execute on function public.has_non_teacher_memorization_manage(uuid, uuid)
from anon, authenticated;

create or replace function public.prepare_memorization_follow_up_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_AUTH_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.classes as target_class
      where target_class.school_id = new.school_id
        and target_class.branch_id = new.branch_id
        and target_class.id = new.class_id
        and target_class.status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_FOLLOW_UP_CLASS_INVALID';
    end if;

    if not exists (
      select 1
      from public.students as student
      where student.id = new.student_id
        and student.school_id = new.school_id
        and student.branch_id = new.branch_id
        and student.class_id = new.class_id
        and student.status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_FOLLOW_UP_STUDENT_NOT_IN_ACTIVE_CLASS';
    end if;

    if not exists (
      select 1
      from public.teachers as teacher
      join public.class_teachers as class_teacher
        on class_teacher.school_id = teacher.school_id
       and class_teacher.branch_id = teacher.branch_id
       and class_teacher.teacher_id = teacher.id
       and class_teacher.class_id = new.class_id
       and class_teacher.status = 'active'
      where teacher.id = new.teacher_id
        and teacher.school_id = new.school_id
        and teacher.branch_id = new.branch_id
        and teacher.status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_FOLLOW_UP_TEACHER_NOT_ASSIGNED';
    end if;

    if new.source_record_id is not null and not exists (
      select 1
      from public.memorization_records as source_record
      where source_record.id = new.source_record_id
        and source_record.school_id = new.school_id
        and source_record.branch_id = new.branch_id
        and source_record.class_id = new.class_id
        and source_record.student_id = new.student_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_FOLLOW_UP_SOURCE_RECORD_SCOPE_INVALID';
    end if;

    new.status := 'open';
    new.created_by := (select auth.uid());
    new.last_modified_by := (select auth.uid());
    new.resolved_by := null;
    new.resolved_at := null;
  else
    if new.school_id is distinct from old.school_id
      or new.branch_id is distinct from old.branch_id
      or new.class_id is distinct from old.class_id
      or new.student_id is distinct from old.student_id
      or new.teacher_id is distinct from old.teacher_id
      or new.source_record_id is distinct from old.source_record_id
      or new.category is distinct from old.category
      or new.priority is distinct from old.priority
      or new.surah_number is distinct from old.surah_number
      or new.ayah_start is distinct from old.ayah_start
      or new.ayah_end is distinct from old.ayah_end
      or new.note_text is distinct from old.note_text
      or new.observed_on is distinct from old.observed_on
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_FOLLOW_UP_CONTENT_IMMUTABLE';
    end if;

    new.last_modified_by := (select auth.uid());
    if new.status = 'resolved' then
      if old.status = 'resolved' then
        new.resolved_by := old.resolved_by;
        new.resolved_at := old.resolved_at;
      else
        new.resolved_by := (select auth.uid());
        new.resolved_at := now();
      end if;
    else
      new.resolved_by := null;
      new.resolved_at := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_memorization_follow_up_note() from public;
revoke execute on function public.prepare_memorization_follow_up_note()
from anon, authenticated;

create trigger memorization_follow_up_notes_prepare
before insert or update on public.memorization_follow_up_notes
for each row execute function public.prepare_memorization_follow_up_note();

create trigger memorization_follow_up_notes_set_updated_at
before update on public.memorization_follow_up_notes
for each row execute function public.set_updated_at();

create or replace function public.audit_memorization_follow_up_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memorization_follow_up_note_history (
    follow_up_note_id,
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
    case when tg_op = 'INSERT' then 'insert' else 'status_update' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    (select auth.uid())
  );

  return new;
end;
$$;

revoke all on function public.audit_memorization_follow_up_note() from public;
revoke execute on function public.audit_memorization_follow_up_note()
from anon, authenticated;

create trigger memorization_follow_up_notes_audit
after insert or update on public.memorization_follow_up_notes
for each row execute function public.audit_memorization_follow_up_note();

create or replace function public.create_memorization_follow_up_note(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_student_id uuid,
  target_teacher_id uuid,
  target_source_record_id uuid,
  target_category text,
  target_priority integer,
  target_surah_number integer,
  target_ayah_start integer,
  target_ayah_end integer,
  target_note_text text,
  target_observed_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_teacher_profile_id uuid;
  created_note_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_AUTH_REQUIRED';
  end if;

  if not public.can_access_memorization_class(
    target_school_id,
    target_branch_id,
    target_class_id,
    'memorization.manage'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_MANAGE_REQUIRED';
  end if;

  if target_category is null or target_category not in (
    'memorization_error',
    'revision_weakness',
    'tajweed',
    'hesitation',
    'forgetting',
    'recurring_error',
    'other'
  ) then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_CATEGORY_INVALID';
  end if;

  if target_priority is null or target_priority not between 1 and 3 then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_PRIORITY_INVALID';
  end if;

  if target_surah_number is null
    or target_surah_number < 1
    or target_surah_number > 114
  then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_SURAH_INVALID';
  end if;

  if target_ayah_start is null
    or target_ayah_end is null
    or target_ayah_start < 1
    or target_ayah_end < target_ayah_start
    or target_ayah_end > public.quran_surah_ayah_count(target_surah_number::smallint)
  then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_AYAH_RANGE_INVALID';
  end if;

  if target_note_text is null
    or char_length(btrim(target_note_text)) not between 1 and 1000
  then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_NOTE_INVALID';
  end if;

  if target_observed_on is null then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_DATE_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.students as student
    where student.id = target_student_id
      and student.school_id = target_school_id
      and student.branch_id = target_branch_id
      and student.class_id = target_class_id
      and student.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_STUDENT_SCOPE_DENIED';
  end if;

  select teacher.profile_id
    into resolved_teacher_profile_id
  from public.teachers as teacher
  join public.class_teachers as class_teacher
    on class_teacher.school_id = teacher.school_id
   and class_teacher.branch_id = teacher.branch_id
   and class_teacher.teacher_id = teacher.id
   and class_teacher.class_id = target_class_id
   and class_teacher.status = 'active'
  where teacher.id = target_teacher_id
    and teacher.school_id = target_school_id
    and teacher.branch_id = target_branch_id
    and teacher.status = 'active';

  if not found then
    raise exception using
      errcode = '23514',
      message = 'MEMORIZATION_FOLLOW_UP_TEACHER_NOT_ASSIGNED';
  end if;

  if not public.has_non_teacher_memorization_manage(
    target_school_id,
    target_branch_id
  ) and resolved_teacher_profile_id is distinct from (select auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_TEACHER_IDENTITY_MISMATCH';
  end if;

  if target_source_record_id is not null and not exists (
    select 1
    from public.memorization_records as source_record
    where source_record.id = target_source_record_id
      and source_record.school_id = target_school_id
      and source_record.branch_id = target_branch_id
      and source_record.class_id = target_class_id
      and source_record.student_id = target_student_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'MEMORIZATION_FOLLOW_UP_SOURCE_RECORD_SCOPE_INVALID';
  end if;

  insert into public.memorization_follow_up_notes (
    school_id,
    branch_id,
    class_id,
    student_id,
    teacher_id,
    source_record_id,
    category,
    priority,
    surah_number,
    ayah_start,
    ayah_end,
    note_text,
    observed_on,
    created_by,
    last_modified_by
  ) values (
    target_school_id,
    target_branch_id,
    target_class_id,
    target_student_id,
    target_teacher_id,
    target_source_record_id,
    target_category,
    target_priority::smallint,
    target_surah_number::smallint,
    target_ayah_start::smallint,
    target_ayah_end::smallint,
    btrim(target_note_text),
    target_observed_on,
    (select auth.uid()),
    (select auth.uid())
  )
  returning id into created_note_id;

  return created_note_id;
end;
$$;

revoke all on function public.create_memorization_follow_up_note(
  uuid, uuid, uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, date
) from public;
revoke execute on function public.create_memorization_follow_up_note(
  uuid, uuid, uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, date
) from anon;
grant execute on function public.create_memorization_follow_up_note(
  uuid, uuid, uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, date
) to authenticated;

create or replace function public.set_memorization_follow_up_note_status(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_note_id uuid,
  target_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_student_id uuid;
  current_status text;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_AUTH_REQUIRED';
  end if;

  if target_status is null or target_status not in ('open', 'improved', 'resolved') then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_STATUS_INVALID';
  end if;

  if not public.can_access_memorization_class(
    target_school_id,
    target_branch_id,
    target_class_id,
    'memorization.manage'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_MANAGE_REQUIRED';
  end if;

  select note.student_id, note.status
    into target_student_id, current_status
  from public.memorization_follow_up_notes as note
  where note.id = target_note_id
    and note.school_id = target_school_id
  for update;

  if not found then
    return false;
  end if;

  if not exists (
    select 1
    from public.students as student
    where student.id = target_student_id
      and student.school_id = target_school_id
      and student.branch_id = target_branch_id
      and student.class_id = target_class_id
      and student.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_STUDENT_SCOPE_DENIED';
  end if;

  if current_status = target_status then
    return true;
  end if;

  update public.memorization_follow_up_notes
  set status = target_status
  where id = target_note_id
    and school_id = target_school_id;

  return found;
end;
$$;

revoke all on function public.set_memorization_follow_up_note_status(
  uuid, uuid, uuid, uuid, text
) from public;
revoke execute on function public.set_memorization_follow_up_note_status(
  uuid, uuid, uuid, uuid, text
) from anon;
grant execute on function public.set_memorization_follow_up_note_status(
  uuid, uuid, uuid, uuid, text
) to authenticated;

create or replace function public.list_memorization_focus_notes(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_student_id uuid,
  target_limit integer default 20
)
returns table (
  id uuid,
  student_id uuid,
  teacher_id uuid,
  teacher_name text,
  source_record_id uuid,
  category text,
  priority smallint,
  status text,
  surah_number smallint,
  ayah_start smallint,
  ayah_end smallint,
  note_text text,
  observed_on date,
  recurrence_count bigint,
  created_by uuid,
  last_modified_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_AUTH_REQUIRED';
  end if;

  if target_limit is null or target_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_LIMIT_INVALID';
  end if;

  if not (
    public.can_access_memorization_class(
      target_school_id,
      target_branch_id,
      target_class_id,
      'memorization.view'
    )
    or public.can_access_memorization_class(
      target_school_id,
      target_branch_id,
      target_class_id,
      'memorization.manage'
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_VIEW_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.students as student
    where student.id = target_student_id
      and student.school_id = target_school_id
      and student.branch_id = target_branch_id
      and student.class_id = target_class_id
      and student.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_STUDENT_SCOPE_DENIED';
  end if;

  return query
  with ranked as (
    select
      note.*,
      count(*) over (
        partition by
          note.school_id,
          note.student_id,
          note.category,
          note.surah_number,
          note.ayah_start,
          note.ayah_end
      ) as recurrence_count,
      row_number() over (
        partition by
          note.school_id,
          note.student_id,
          note.category,
          note.surah_number,
          note.ayah_start,
          note.ayah_end
        order by note.observed_on desc, note.created_at desc, note.id desc
      ) as latest_rank
    from public.memorization_follow_up_notes as note
    where note.school_id = target_school_id
      and note.student_id = target_student_id
  )
  select
    note.id,
    note.student_id,
    note.teacher_id,
    btrim(concat_ws(' ', teacher.first_name, teacher.last_name))::text,
    note.source_record_id,
    note.category,
    note.priority,
    note.status,
    note.surah_number,
    note.ayah_start,
    note.ayah_end,
    note.note_text,
    note.observed_on,
    note.recurrence_count,
    note.created_by,
    note.last_modified_by,
    note.resolved_by,
    note.resolved_at,
    note.created_at,
    note.updated_at
  from ranked as note
  join public.teachers as teacher
    on teacher.id = note.teacher_id
  where note.latest_rank = 1
    and note.status in ('open', 'improved')
  order by
    case note.status when 'open' then 0 else 1 end,
    note.priority asc,
    note.recurrence_count desc,
    note.observed_on desc,
    note.created_at desc,
    note.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_memorization_focus_notes(
  uuid, uuid, uuid, uuid, integer
) from public;
revoke execute on function public.list_memorization_focus_notes(
  uuid, uuid, uuid, uuid, integer
) from anon;
grant execute on function public.list_memorization_focus_notes(
  uuid, uuid, uuid, uuid, integer
) to authenticated;

create or replace function public.list_memorization_follow_up_history(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_student_id uuid,
  target_limit integer default 100
)
returns table (
  id uuid,
  student_id uuid,
  teacher_id uuid,
  teacher_name text,
  source_record_id uuid,
  category text,
  priority smallint,
  status text,
  surah_number smallint,
  ayah_start smallint,
  ayah_end smallint,
  note_text text,
  observed_on date,
  recurrence_count bigint,
  created_by uuid,
  last_modified_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_AUTH_REQUIRED';
  end if;

  if target_limit is null or target_limit not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'MEMORIZATION_FOLLOW_UP_LIMIT_INVALID';
  end if;

  if not (
    public.can_access_memorization_class(
      target_school_id,
      target_branch_id,
      target_class_id,
      'memorization.view'
    )
    or public.can_access_memorization_class(
      target_school_id,
      target_branch_id,
      target_class_id,
      'memorization.manage'
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_VIEW_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.students as student
    where student.id = target_student_id
      and student.school_id = target_school_id
      and student.branch_id = target_branch_id
      and student.class_id = target_class_id
      and student.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_FOLLOW_UP_STUDENT_SCOPE_DENIED';
  end if;

  return query
  with history as (
    select
      note.*,
      count(*) over (
        partition by
          note.school_id,
          note.student_id,
          note.category,
          note.surah_number,
          note.ayah_start,
          note.ayah_end
      ) as recurrence_count
    from public.memorization_follow_up_notes as note
    where note.school_id = target_school_id
      and note.student_id = target_student_id
  )
  select
    note.id,
    note.student_id,
    note.teacher_id,
    btrim(concat_ws(' ', teacher.first_name, teacher.last_name))::text,
    note.source_record_id,
    note.category,
    note.priority,
    note.status,
    note.surah_number,
    note.ayah_start,
    note.ayah_end,
    note.note_text,
    note.observed_on,
    note.recurrence_count,
    note.created_by,
    note.last_modified_by,
    note.resolved_by,
    note.resolved_at,
    note.created_at,
    note.updated_at
  from history as note
  join public.teachers as teacher
    on teacher.id = note.teacher_id
  order by note.observed_on desc, note.created_at desc, note.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_memorization_follow_up_history(
  uuid, uuid, uuid, uuid, integer
) from public;
revoke execute on function public.list_memorization_follow_up_history(
  uuid, uuid, uuid, uuid, integer
) from anon;
grant execute on function public.list_memorization_follow_up_history(
  uuid, uuid, uuid, uuid, integer
) to authenticated;

alter table public.memorization_follow_up_notes enable row level security;
alter table public.memorization_follow_up_note_history enable row level security;

revoke all on public.memorization_follow_up_notes,
  public.memorization_follow_up_note_history
from public, anon, authenticated;

commit;
