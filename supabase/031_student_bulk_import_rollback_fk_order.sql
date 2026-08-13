-- QuranOS V2 - detach the import audit row before deleting a rolled-back student.
-- Also revoke import-ledger read access immediately when school membership is no longer active.
begin;

create or replace function public.rollback_student_import_batch(target_batch_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  batch_row public.student_import_batches%rowtype;
  student_record record;
  removed_total integer := 0;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'student_import_auth_required';
  end if;

  select * into batch_row
  from public.student_import_batches
  where id = target_batch_id
  for update;

  if not found or batch_row.created_by <> actor_id or batch_row.status <> 'committed' then
    raise exception using errcode = '42501', message = 'student_import_rollback_denied';
  end if;

  for student_record in
    select row.id as row_id, row.created_student_id as student_id,
           student.school_id, student.branch_id
    from public.student_import_rows row
    join public.students student on student.id = row.created_student_id
    where row.batch_id = target_batch_id and row.row_status = 'created'
    order by row.row_number
    for update of student
  loop
    if not public.has_branch_permission(
      student_record.school_id, student_record.branch_id, 'students.manage'
    ) then
      raise exception using errcode = '42501', message = 'student_import_rollback_permission_changed';
    end if;

    if exists (select 1 from public.student_guardians sg where sg.student_id = student_record.student_id)
       or exists (select 1 from public.attendance_records ar where ar.student_id = student_record.student_id)
       or exists (select 1 from public.memorization_records mr where mr.student_id = student_record.student_id)
       or exists (select 1 from public.student_charges sc where sc.student_id = student_record.student_id)
       or exists (select 1 from public.payments p where p.student_id = student_record.student_id)
       or exists (select 1 from public.official_receipts receipt where receipt.student_id = student_record.student_id) then
      raise exception using errcode = '23503', message = 'student_import_rollback_blocked_by_activity';
    end if;

    update public.student_import_rows
    set row_status = case when 'class_unassigned' = any(issues) then 'warning' else 'ready' end,
        created_student_id = null
    where id = student_record.row_id;

    delete from public.students where id = student_record.student_id;
    removed_total := removed_total + 1;
  end loop;

  update public.student_import_batches batch
  set status = 'rolled_back',
      rolled_back_at = now(),
      created_count = 0,
      ready_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'ready'),
      warning_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'warning'),
      duplicate_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'duplicate'),
      error_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'error')
  where batch.id = target_batch_id;

  return removed_total;
end;
$$;

revoke all on function public.rollback_student_import_batch(uuid) from public, anon;
grant execute on function public.rollback_student_import_batch(uuid) to authenticated;

create or replace function public.get_student_import_batch(target_batch_id uuid)
returns table (
  batch_id uuid,
  school_id uuid,
  file_name text,
  status text,
  total_count integer,
  ready_count integer,
  warning_count integer,
  duplicate_count integer,
  error_count integer,
  created_count integer,
  created_at timestamptz,
  committed_at timestamptz,
  rolled_back_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select batch.id, batch.school_id, batch.file_name, batch.status,
    batch.total_count, batch.ready_count, batch.warning_count,
    batch.duplicate_count, batch.error_count, batch.created_count,
    batch.created_at, batch.committed_at, batch.rolled_back_at
  from public.student_import_batches batch
  where batch.id = target_batch_id
    and batch.created_by = (select auth.uid())
    and public.is_active_school_member(batch.school_id);
$$;

create or replace function public.list_student_import_rows(target_batch_id uuid)
returns table (
  row_number integer,
  payload jsonb,
  row_status text,
  issues text[],
  duplicate_student_id uuid,
  created_student_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select row.row_number, row.payload, row.row_status, row.issues,
    row.duplicate_student_id, row.created_student_id
  from public.student_import_rows row
  join public.student_import_batches batch on batch.id = row.batch_id
  where row.batch_id = target_batch_id
    and batch.created_by = (select auth.uid())
    and public.is_active_school_member(batch.school_id)
  order by row.row_number;
$$;

revoke all on function public.get_student_import_batch(uuid) from public, anon;
revoke all on function public.list_student_import_rows(uuid) from public, anon;
grant execute on function public.get_student_import_batch(uuid) to authenticated;
grant execute on function public.list_student_import_rows(uuid) to authenticated;

commit;
