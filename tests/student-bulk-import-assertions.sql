\set ON_ERROR_STOP on

-- Import audit tables must remain invisible to browser roles.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);

do $$
begin
  begin
    perform 1 from public.student_import_batches limit 1;
    raise exception 'authenticated unexpectedly read student_import_batches directly';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.student_import_batch_students limit 1;
    raise exception 'authenticated unexpectedly read student_import_batch_students directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Teacher can view students but must not access the management-only import path.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', false);

do $$
declare
  access_row record;
begin
  select * into access_row
  from public.get_student_management_access('10000000-0000-4000-8000-000000000001');

  if access_row.can_view is not true or access_row.can_manage is not false then
    raise exception 'teacher student access contract is wrong: %', row_to_json(access_row);
  end if;

  begin
    perform *
    from public.preview_student_import(
      '10000000-0000-4000-8000-000000000001',
      current_setting('test.student_import_rows')::jsonb
    );
    raise exception 'teacher unexpectedly previewed a management import';
  exception when insufficient_privilege then null;
  end;

  begin
    perform *
    from public.commit_student_import(
      '10000000-0000-4000-8000-000000000001',
      'teacher.xlsx',
      current_setting('test.student_import_rows')::jsonb
    );
    raise exception 'teacher unexpectedly committed a student import';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Registrar preview resolves exact row states without writing student records.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
select set_config(
  'test.student_import_preview',
  (
    select jsonb_agg(to_jsonb(preview_row) order by preview_row.row_number)::text
    from public.preview_student_import(
      '10000000-0000-4000-8000-000000000001',
      current_setting('test.student_import_rows')::jsonb
    ) as preview_row
  ),
  false
);
reset role;

do $$
declare
  preview jsonb := current_setting('test.student_import_preview')::jsonb;
begin
  if jsonb_array_length(preview) <> 5 then
    raise exception 'preview returned wrong number of rows: %', preview;
  end if;
  if preview->0->>'validation_status' <> 'ready' then
    raise exception 'row 2 should be ready: %', preview->0;
  end if;
  if preview->1->>'validation_status' <> 'warning'
     or not ((preview->1->'warning_codes') ? 'possible_duplicate_name_birthdate') then
    raise exception 'row 3 should be a possible-duplicate warning: %', preview->1;
  end if;
  if preview->2->>'validation_status' <> 'duplicate' then
    raise exception 'row 4 should be an existing duplicate: %', preview->2;
  end if;
  if preview->3->>'validation_status' <> 'error'
     or not ((preview->3->'error_codes') ? 'branch_not_found') then
    raise exception 'row 5 should have branch_not_found: %', preview->3;
  end if;
  if preview->4->>'validation_status' <> 'duplicate'
     or not ((preview->4->'error_codes') ? 'duplicate_in_file') then
    raise exception 'row 6 should be duplicate_in_file: %', preview->4;
  end if;

  if exists (
    select 1 from public.students
    where national_id in ('IMP-READY-001', 'IMP-WARN-001')
  ) then
    raise exception 'preview unexpectedly wrote students';
  end if;
end;
$$;

-- First commit imports ready + warning only, while preserving audit counts.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
select set_config(
  'test.student_import_first_commit',
  (
    select to_jsonb(result_row)::text
    from public.commit_student_import(
      '10000000-0000-4000-8000-000000000001',
      'students-first.xlsx',
      current_setting('test.student_import_rows')::jsonb
    ) as result_row
  ),
  false
);
reset role;

do $$
declare
  result jsonb := current_setting('test.student_import_first_commit')::jsonb;
  first_batch uuid := (result->>'batch_id')::uuid;
  imported_count integer;
  mapped_count integer;
begin
  if (result->>'total_rows')::integer <> 5
     or (result->>'imported_rows')::integer <> 2
     or (result->>'warning_rows')::integer <> 1
     or (result->>'duplicate_rows')::integer <> 2
     or (result->>'error_rows')::integer <> 1 then
    raise exception 'first import counts are wrong: %', result;
  end if;

  select count(*) into imported_count
  from public.students
  where national_id in ('IMP-READY-001', 'IMP-WARN-001');
  if imported_count <> 2 then
    raise exception 'expected exactly two imported students, got %', imported_count;
  end if;

  select count(*) into mapped_count
  from public.student_import_batch_students
  where batch_id = first_batch and rolled_back_at is null;
  if mapped_count <> 2 then
    raise exception 'expected exactly two import mappings, got %', mapped_count;
  end if;

  if not exists (
    select 1
    from public.students
    where national_id = 'IMP-READY-001'
      and branch_id = '20000000-0000-4000-8000-000000000001'
      and class_id = '74000000-0000-4000-8000-000000000001'
      and education_level = 'primary'
      and education_year = 5
      and created_by = '60000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'ready student normalization or scope is wrong';
  end if;
end;
$$;

-- Repeating the same file does not create a second copy of either imported student.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
select set_config(
  'test.student_import_second_commit',
  (
    select to_jsonb(result_row)::text
    from public.commit_student_import(
      '10000000-0000-4000-8000-000000000001',
      'students-repeat.xlsx',
      current_setting('test.student_import_rows')::jsonb
    ) as result_row
  ),
  false
);
reset role;

do $$
declare
  result jsonb := current_setting('test.student_import_second_commit')::jsonb;
  imported_count integer;
begin
  if (result->>'imported_rows')::integer <> 0
     or (result->>'duplicate_rows')::integer <> 4
     or (result->>'error_rows')::integer <> 1 then
    raise exception 'repeated import was not idempotently skipped: %', result;
  end if;

  select count(*) into imported_count
  from public.students
  where national_id in ('IMP-READY-001', 'IMP-WARN-001');
  if imported_count <> 2 then
    raise exception 'repeat import created extra student rows';
  end if;
end;
$$;

-- Registrar can inspect batch history through the narrow RPC.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
declare
  history_count integer;
  first_batch uuid := (current_setting('test.student_import_first_commit')::jsonb->>'batch_id')::uuid;
  rollback_allowed boolean;
begin
  select count(*) into history_count
  from public.list_student_import_batches(
    '10000000-0000-4000-8000-000000000001', 20
  );
  if history_count < 2 then
    raise exception 'import history did not return both batches';
  end if;

  select item.can_rollback into rollback_allowed
  from public.list_student_import_batches(
    '10000000-0000-4000-8000-000000000001', 20
  ) as item
  where item.batch_id = first_batch;

  if rollback_allowed is not true then
    raise exception 'fresh first batch should allow safe rollback';
  end if;
end;
$$;
reset role;

-- Safe rollback removes only rows created by the selected batch and preserves audit history.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
select set_config(
  'test.student_import_rollback',
  (
    select to_jsonb(result_row)::text
    from public.rollback_student_import(
      (current_setting('test.student_import_first_commit')::jsonb->>'batch_id')::uuid
    ) as result_row
  ),
  false
);
reset role;

do $$
declare
  result jsonb := current_setting('test.student_import_rollback')::jsonb;
  first_batch uuid := (current_setting('test.student_import_first_commit')::jsonb->>'batch_id')::uuid;
  remaining_students integer;
begin
  if (result->>'rolled_back_students')::integer <> 2
     or (result->>'blocked_students')::integer <> 0
     or result->>'batch_status' <> 'rolled_back' then
    raise exception 'safe rollback result is wrong: %', result;
  end if;

  select count(*) into remaining_students
  from public.students
  where national_id in ('IMP-READY-001', 'IMP-WARN-001');
  if remaining_students <> 0 then
    raise exception 'safe rollback left imported students behind';
  end if;

  if not exists (
    select 1 from public.student_import_batches
    where id = first_batch
      and status = 'rolled_back'
      and rolled_back_at is not null
      and rolled_back_by = '60000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'batch rollback audit state was not preserved';
  end if;

  if (select count(*) from public.student_import_batch_students where batch_id = first_batch) <> 2 then
    raise exception 'rollback unexpectedly deleted import audit mappings';
  end if;
end;
$$;

-- No browser DELETE path exists for the private audit tables.
do $$
begin
  if has_table_privilege('authenticated', 'public.student_import_batches', 'DELETE') then
    raise exception 'authenticated unexpectedly has DELETE on student_import_batches';
  end if;
  if has_table_privilege('authenticated', 'public.student_import_batch_students', 'DELETE') then
    raise exception 'authenticated unexpectedly has DELETE on student_import_batch_students';
  end if;
end;
$$;
