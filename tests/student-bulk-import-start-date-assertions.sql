\set ON_ERROR_STOP on

-- An invalid optional start_date must be row-scoped during preview, while a valid row remains committable.
set role service_role;
select set_config(
  'test.import_start_date_batch_id',
  public.stage_student_import_batch(
    '10000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'students-start-date.xlsx',
    repeat('b', 64),
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 2, 'first_name', 'Invalid', 'last_name', 'StartDate',
        'birth_date', '2014-06-01', 'gender', 'male',
        'national_id', 'NID-START-BAD-001', 'guardian_name', 'Guardian Invalid',
        'guardian_relation', 'father', 'guardian_phone', '+213555000021',
        'branch_code', 'MAIN', 'class_code', 'IMPORT_A', 'start_date', '2026-13-40'
      ),
      jsonb_build_object(
        'row_number', 3, 'first_name', 'Valid', 'last_name', 'StartDate',
        'birth_date', '2014-06-02', 'gender', 'female',
        'national_id', 'NID-START-OK-001', 'guardian_name', 'Guardian Valid',
        'guardian_relation', 'mother', 'guardian_phone', '+213555000022',
        'branch_code', 'MAIN', 'class_code', 'IMPORT_A', 'start_date', '2026-08-10'
      )
    )
  )::text,
  false
);
reset role;

do $$
declare
  batch_row record;
  invalid_row record;
begin
  select * into batch_row
  from public.student_import_batches
  where id = current_setting('test.import_start_date_batch_id')::uuid;

  if batch_row.total_count <> 2 or batch_row.ready_count <> 1
     or batch_row.warning_count <> 0 or batch_row.duplicate_count <> 0
     or batch_row.error_count <> 1 or batch_row.status <> 'staged' then
    raise exception 'start-date preview counts are incorrect: %', row_to_json(batch_row);
  end if;

  select * into invalid_row
  from public.student_import_rows
  where batch_id = batch_row.id and row_number = 2;

  if invalid_row.row_status <> 'error'
     or not ('start_date_invalid' = any(invalid_row.issues)) then
    raise exception 'invalid start_date was not classified as a row error: %', row_to_json(invalid_row);
  end if;
end;
$$;

-- Commit must create only the valid row instead of aborting the whole batch.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
declare
  created_rows integer;
begin
  created_rows := public.commit_student_import_batch(current_setting('test.import_start_date_batch_id')::uuid);
  if created_rows <> 1 then
    raise exception 'expected 1 valid start-date row to commit, got %', created_rows;
  end if;
end;
$$;
reset role;

do $$
declare
  batch_row record;
begin
  select * into batch_row
  from public.student_import_batches
  where id = current_setting('test.import_start_date_batch_id')::uuid;

  if batch_row.status <> 'committed' or batch_row.created_count <> 1
     or batch_row.ready_count <> 0 or batch_row.warning_count <> 0
     or batch_row.duplicate_count <> 0 or batch_row.error_count <> 1 then
    raise exception 'start-date commit state is inconsistent: %', row_to_json(batch_row);
  end if;

  if exists (select 1 from public.students where national_id = 'NID-START-BAD-001') then
    raise exception 'invalid start-date student was unexpectedly created';
  end if;
  if not exists (select 1 from public.students where national_id = 'NID-START-OK-001') then
    raise exception 'valid start-date student was not created';
  end if;
end;
$$;

-- Existing batch-scoped rollback semantics still apply after the validation wrapper.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
declare
  removed_rows integer;
begin
  removed_rows := public.rollback_student_import_batch(current_setting('test.import_start_date_batch_id')::uuid);
  if removed_rows <> 1 then
    raise exception 'expected 1 start-date test student to roll back, got %', removed_rows;
  end if;
end;
$$;
reset role;
