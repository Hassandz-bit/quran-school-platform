-- Transactional, idempotent attendance batches.
-- This is the server-side foundation for safe offline retries; it does not
-- enable offline storage or synchronization by itself.

begin;

create table public.attendance_sync_operations (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id),
  school_id uuid not null references public.schools(id),
  operation_id uuid not null,
  request_payload jsonb not null,
  session_id uuid references public.attendance_sessions(id),
  saved_count integer,
  created_at timestamptz not null default now(),
  constraint attendance_sync_operations_actor_operation_unique
    unique (actor_profile_id, operation_id),
  constraint attendance_sync_operations_result_check
    check (
      (session_id is null and saved_count is null)
      or (session_id is not null and saved_count is not null and saved_count > 0)
    )
);

alter table public.attendance_sync_operations enable row level security;
revoke all on public.attendance_sync_operations from public, anon, authenticated, service_role;

create or replace function public.save_attendance_batch(
  target_operation_id uuid,
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_session_date date,
  target_rows jsonb
)
returns table (
  session_id uuid,
  saved_count integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prior_operation public.attendance_sync_operations%rowtype;
  resolved_session_id uuid;
  row_item jsonb;
  student_id_value uuid;
  status_value text;
  arrival_value time;
  note_value text;
  row_count integer;
  distinct_student_count integer;
begin
  if actor_id is null then
    raise exception using errcode = '28000', message = 'ATTENDANCE_AUTH_REQUIRED';
  end if;

  if target_operation_id is null
    or target_school_id is null
    or target_branch_id is null
    or target_class_id is null
    or target_session_date is null
    or jsonb_typeof(target_rows) <> 'array'
  then
    raise exception using errcode = '22023', message = 'ATTENDANCE_INVALID_BATCH';
  end if;

  row_count := jsonb_array_length(target_rows);
  if row_count < 1 or row_count > 200 then
    raise exception using errcode = '22023', message = 'ATTENDANCE_INVALID_BATCH_SIZE';
  end if;

  if not public.can_access_attendance_class(
    target_school_id, target_branch_id, target_class_id, 'attendance.manage'
  ) then
    raise exception using errcode = '42501', message = 'ATTENDANCE_PERMISSION_REQUIRED';
  end if;

  select count(distinct parsed.student_id)
  into distinct_student_count
  from jsonb_to_recordset(target_rows) as parsed(student_id uuid, status text);

  if distinct_student_count <> row_count then
    raise exception using errcode = '22023', message = 'ATTENDANCE_DUPLICATE_OR_INVALID_STUDENT';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_rows)
      as parsed(student_id uuid, status text, arrival_time text, note text)
    where parsed.student_id is null
      or parsed.status not in ('present', 'absent', 'late', 'excused_absence')
      or (parsed.note is not null and char_length(btrim(parsed.note)) > 500)
      or (parsed.arrival_time is not null and parsed.status not in ('present', 'late'))
  ) then
    raise exception using errcode = '22023', message = 'ATTENDANCE_INVALID_ROW';
  end if;

  if (
    select count(*)
    from public.students as student
    where student.school_id = target_school_id
      and student.branch_id = target_branch_id
      and student.class_id = target_class_id
      and student.status = 'active'
      and student.id in (
        select parsed.student_id
        from jsonb_to_recordset(target_rows) as parsed(student_id uuid)
      )
  ) <> row_count then
    raise exception using errcode = '23514', message = 'ATTENDANCE_ROSTER_CHANGED';
  end if;

  insert into public.attendance_sync_operations (
    actor_profile_id, school_id, operation_id, request_payload
  ) values (
    actor_id, target_school_id, target_operation_id,
    jsonb_build_object(
      'school_id', target_school_id,
      'branch_id', target_branch_id,
      'class_id', target_class_id,
      'session_date', target_session_date,
      'rows', target_rows
    )
  )
  on conflict (actor_profile_id, operation_id) do nothing;

  select operation.*
  into prior_operation
  from public.attendance_sync_operations as operation
  where operation.actor_profile_id = actor_id
    and operation.operation_id = target_operation_id
  for update;

  if prior_operation.request_payload is distinct from jsonb_build_object(
    'school_id', target_school_id,
    'branch_id', target_branch_id,
    'class_id', target_class_id,
    'session_date', target_session_date,
    'rows', target_rows
  ) then
    raise exception using errcode = '22023', message = 'ATTENDANCE_OPERATION_ID_REUSED';
  end if;

  if prior_operation.session_id is not null then
    return query select prior_operation.session_id, prior_operation.saved_count, true;
    return;
  end if;

  insert into public.attendance_sessions (
    school_id, branch_id, class_id, session_date, created_by
  ) values (
    target_school_id, target_branch_id, target_class_id, target_session_date, actor_id
  )
  on conflict (class_id, session_date) do nothing;

  select session.id
  into strict resolved_session_id
  from public.attendance_sessions as session
  where session.school_id = target_school_id
    and session.branch_id = target_branch_id
    and session.class_id = target_class_id
    and session.session_date = target_session_date
  for update;

  for row_item in select value from jsonb_array_elements(target_rows)
  loop
    student_id_value := (row_item ->> 'student_id')::uuid;
    status_value := row_item ->> 'status';
    arrival_value := nullif(row_item ->> 'arrival_time', '')::time;
    note_value := nullif(btrim(coalesce(row_item ->> 'note', '')), '');

    insert into public.attendance_records (
      session_id, student_id, status, arrival_time, note
    ) values (
      resolved_session_id, student_id_value, status_value, arrival_value, note_value
    )
    on conflict (session_id, student_id) do update
    set status = excluded.status,
        arrival_time = excluded.arrival_time,
        note = excluded.note;
  end loop;

  update public.attendance_sync_operations as operation
  set session_id = resolved_session_id,
      saved_count = row_count
  where operation.id = prior_operation.id;

  return query select resolved_session_id, row_count, false;
end;
$$;

revoke all on function public.save_attendance_batch(uuid, uuid, uuid, uuid, date, jsonb)
from public, anon;
grant execute on function public.save_attendance_batch(uuid, uuid, uuid, uuid, date, jsonb)
to authenticated;

commit;
