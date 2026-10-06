-- Keep demo cleanup compatible with dependent records introduced by later modules.
-- Optional relations are checked dynamically so this migration also applies safely
-- to installations whose database is still at the Demo Mode baseline (021/022).
begin;

do $$
begin
  if to_regprocedure('public.clear_school_demo_data_before_071(uuid)') is null then
    if to_regprocedure('public.clear_school_demo_data(uuid)') is null then
      raise exception 'clear_school_demo_data(uuid) is missing; apply migration 021 before 071';
    end if;
    alter function public.clear_school_demo_data(uuid)
      rename to clear_school_demo_data_before_071;
  end if;
end;
$$;

-- Keep the original function as a private core routine so its existing permission
-- checks, mixed-data guards, and deletion order remain intact.
revoke all on function public.clear_school_demo_data_before_071(uuid)
  from public, anon, authenticated;

create or replace function public.prepare_school_demo_cleanup(target_school_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_batch_id uuid;
  has_blocker boolean := false;
  payroll_link_found boolean := false;
begin
  if auth.uid() is null
     or target_school_id is null
     or not public.has_school_permission(target_school_id, 'school.update') then
    raise exception using errcode = '42501', message = 'demo_access_denied';
  end if;

  select batch.id into target_batch_id
  from public.demo_seed_batches as batch
  where batch.school_id = target_school_id
    and batch.status = 'active'
  order by batch.created_at desc
  limit 1;

  if target_batch_id is null then
    return;
  end if;

  -- Never orphan or discard a child photo or uploaded student document.
  if exists (
    select 1
    from public.students as student
    join public.demo_seed_records as demo_student
      on demo_student.batch_id = target_batch_id
     and demo_student.school_id = target_school_id
     and demo_student.entity_type = 'student'
     and demo_student.record_id = student.id
    where student.school_id = target_school_id
      and student.photo_path is not null
  ) then
    raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_student_photo';
  end if;

  if to_regclass('public.document_records') is not null then
    execute $query$
      select exists (
        select 1
        from public.document_records as document
        join public.demo_seed_records as demo_student
          on demo_student.batch_id = $1
         and demo_student.school_id = $2
         and demo_student.entity_type = 'student'
         and demo_student.record_id = document.student_id
        where document.school_id = $2
      )
    $query$ into has_blocker using target_batch_id, target_school_id;
    if has_blocker then
      raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_student_documents';
    end if;
  end if;

  -- Keep import batches auditable. Duplicate references can be detached safely;
  -- a row claiming it created the student must be resolved by its owner first.
  if to_regclass('public.student_import_rows') is not null then
    execute $query$
      select exists (
        select 1
        from public.student_import_rows as import_row
        join public.demo_seed_records as demo_student
          on demo_student.batch_id = $1
         and demo_student.school_id = $2
         and demo_student.entity_type = 'student'
         and demo_student.record_id = import_row.created_student_id
      )
    $query$ into has_blocker using target_batch_id, target_school_id;
    if has_blocker then
      raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_student_import_history';
    end if;
  end if;

  -- Preserve observations for live students even if someone linked one to a
  -- demo class or teacher by mistake.
  if to_regclass('public.school_track_results') is not null then
    execute $query$
      select exists (
        select 1
        from public.school_track_results as result
        join public.demo_seed_records as demo_class
          on demo_class.batch_id = $1
         and demo_class.school_id = $2
         and demo_class.entity_type = 'class'
         and demo_class.record_id = result.class_id
        where result.school_id = $2
          and not exists (
            select 1
            from public.demo_seed_records as demo_student
            where demo_student.batch_id = $1
              and demo_student.school_id = $2
              and demo_student.entity_type = 'student'
              and demo_student.record_id = result.student_id
          )
      )
    $query$ into has_blocker using target_batch_id, target_school_id;
    if has_blocker then
      raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_real_school_track_result';
    end if;
  end if;

  if to_regclass('public.memorization_follow_up_notes') is not null then
    execute $query$
      select exists (
        select 1
        from public.memorization_follow_up_notes as note
        where note.school_id = $2
          and (
            note.class_id in (
              select record_id from public.demo_seed_records
              where batch_id = $1
                and school_id = $2
                and entity_type = 'class'
            )
            or note.teacher_id in (
              select record_id from public.demo_seed_records
              where batch_id = $1
                and school_id = $2
                and entity_type = 'teacher'
            )
          )
          and not exists (
            select 1
            from public.demo_seed_records as demo_student
            where demo_student.batch_id = $1
              and demo_student.school_id = $2
              and demo_student.entity_type = 'student'
              and demo_student.record_id = note.student_id
          )
      )
    $query$ into has_blocker using target_batch_id, target_school_id;
    if has_blocker then
      raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_real_follow_up_note';
    end if;
  end if;

  -- Do not erase real payroll or staff records linked to a demo teacher.
  if to_regclass('public.payroll_compensation_profiles') is not null then
    execute $query$
      select exists (
        select 1
        from public.payroll_compensation_profiles as compensation
        where compensation.school_id = $1
          and compensation.teacher_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'teacher'
          )
      )
    $query$ into has_blocker using target_school_id, target_batch_id;
    payroll_link_found := payroll_link_found or has_blocker;
  end if;

  if to_regclass('public.payroll_entries') is not null then
    execute $query$
      select exists (
        select 1
        from public.payroll_entries as payroll_entry
        where payroll_entry.school_id = $1
          and payroll_entry.teacher_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'teacher'
          )
      )
    $query$ into has_blocker using target_school_id, target_batch_id;
    payroll_link_found := payroll_link_found or has_blocker;
  end if;

  if to_regclass('public.employees') is not null then
    execute $query$
      select exists (
        select 1
        from public.employees as employee
        where employee.school_id = $1
          and employee.linked_teacher_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'teacher'
          )
      )
    $query$ into has_blocker using target_school_id, target_batch_id;
    payroll_link_found := payroll_link_found or has_blocker;
  end if;

  if payroll_link_found then
    raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_demo_teacher_payroll';
  end if;

  -- Remove only activity attached to demo students/classes. Related history is
  -- removed before its parent because those tables intentionally use RESTRICT.
  if to_regclass('public.guardian_notification_events') is not null then
    execute $query$
      delete from public.guardian_notification_events as event
      where event.school_id = $1
        and (
          event.student_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'student'
          )
          or event.attendance_session_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'attendance_session'
          )
          or event.attendance_record_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'attendance_record'
          )
        )
    $query$ using target_school_id, target_batch_id;
  end if;

  if to_regclass('public.school_track_result_history') is not null
     and to_regclass('public.school_track_results') is not null then
    execute $query$
      delete from public.school_track_result_history as history
      where history.school_id = $1
        and history.result_id in (
          select result.id
          from public.school_track_results as result
          where result.school_id = $1
            and result.student_id in (
              select record_id from public.demo_seed_records
              where batch_id = $2
                and school_id = $1
                and entity_type = 'student'
            )
        )
    $query$ using target_school_id, target_batch_id;
  end if;

  if to_regclass('public.school_track_results') is not null then
    execute $query$
      delete from public.school_track_results as result
      where result.school_id = $1
        and result.student_id in (
          select record_id from public.demo_seed_records
          where batch_id = $2
            and school_id = $1
            and entity_type = 'student'
        )
    $query$ using target_school_id, target_batch_id;
  end if;

  if to_regclass('public.memorization_follow_up_note_history') is not null
     and to_regclass('public.memorization_follow_up_notes') is not null then
    execute $query$
      delete from public.memorization_follow_up_note_history as history
      where history.school_id = $1
        and history.follow_up_note_id in (
          select note.id
          from public.memorization_follow_up_notes as note
          where note.school_id = $1
            and note.student_id in (
              select record_id from public.demo_seed_records
              where batch_id = $2
                and school_id = $1
                and entity_type = 'student'
            )
        )
    $query$ using target_school_id, target_batch_id;
  end if;

  if to_regclass('public.memorization_follow_up_notes') is not null then
    execute $query$
      delete from public.memorization_follow_up_notes as note
      where note.school_id = $1
        and note.student_id in (
          select record_id from public.demo_seed_records
          where batch_id = $2
            and school_id = $1
            and entity_type = 'student'
        )
    $query$ using target_school_id, target_batch_id;
  end if;

  -- The UI prevents official receipts for active demo records. Remove any legacy
  -- receipts only when their student, payment, or charge belongs to this batch.
  if to_regclass('public.official_receipts') is not null then
    execute $query$
      delete from public.official_receipts as receipt
      where receipt.school_id = $1
        and (
          receipt.student_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'student'
          )
          or receipt.payment_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'payment'
          )
          or receipt.charge_id in (
            select record_id from public.demo_seed_records
            where batch_id = $2
              and school_id = $1
              and entity_type = 'student_charge'
          )
        )
    $query$ using target_school_id, target_batch_id;
  end if;

  if to_regclass('public.student_import_rows') is not null then
    execute $query$
      update public.student_import_rows as import_row
      set duplicate_student_id = null
      where import_row.duplicate_student_id in (
        select record_id from public.demo_seed_records
        where batch_id = $2
          and school_id = $1
          and entity_type = 'student'
      )
    $query$ using target_school_id, target_batch_id;
  end if;
end;
$$;

revoke all on function public.prepare_school_demo_cleanup(uuid)
  from public, anon, authenticated;

create or replace function public.clear_school_demo_data(target_school_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  blocked_constraint text;
  blocked_table text;
begin
  perform public.prepare_school_demo_cleanup(target_school_id);
  return public.clear_school_demo_data_before_071(target_school_id);
exception
  when foreign_key_violation then
    get stacked diagnostics
      blocked_constraint = constraint_name,
      blocked_table = table_name;
    raise exception using
      errcode = 'P0001',
      message = 'demo_cleanup_blocked_related_record',
      detail = 'constraint=' || coalesce(blocked_constraint, 'unknown')
        || '; table=' || coalesce(blocked_table, 'unknown');
end;
$$;

revoke all on function public.clear_school_demo_data(uuid) from public, anon;
grant execute on function public.clear_school_demo_data(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
