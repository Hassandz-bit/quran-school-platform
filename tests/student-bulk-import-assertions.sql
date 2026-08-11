\set ON_ERROR_STOP on

-- Private staging data must never be readable directly by browser roles.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
begin
  begin
    perform 1 from public.student_import_batches limit 1;
    raise exception 'authenticated unexpectedly read student_import_batches';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.student_import_rows limit 1;
    raise exception 'authenticated unexpectedly read student_import_rows';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Stage through the trusted service role: ready + warning + duplicate + error.
set role service_role;
select set_config(
  'test.import_batch_id',
  public.stage_student_import_batch(
    '10000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'students.xlsx',
    repeat('a', 64),
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 2, 'first_name', 'Import', 'last_name', 'Ready',
        'birth_date', '2014-02-01', 'gender', 'male',
        'national_id', 'NID-NEW-001', 'guardian_name', 'Guardian Ready',
        'guardian_relation', 'father', 'guardian_phone', '+213555000001',
        'branch_code', 'MAIN', 'class_code', 'IMPORT_A', 'start_date', '2026-08-10'
      ),
      jsonb_build_object(
        'row_number', 3, 'first_name', 'Import', 'last_name', 'Warning',
        'birth_date', '2014-02-02', 'gender', 'female',
        'national_id', 'NID-NEW-002', 'guardian_name', 'Guardian Warning',
        'guardian_relation', 'mother', 'guardian_phone', '+213555000002',
        'branch_code', 'MAIN', 'class_code', '', 'start_date', '2026-08-10'
      ),
      jsonb_build_object(
        'row_number', 4, 'first_name', 'Duplicate', 'last_name', 'Existing',
        'birth_date', '2014-02-03', 'gender', 'male',
        'national_id', 'NID-EXISTING-001', 'guardian_name', 'Guardian Duplicate',
        'guardian_relation', 'father', 'guardian_phone', '+213555000003',
        'branch_code', 'MAIN', 'class_code', 'IMPORT_A'
      ),
      jsonb_build_object(
        'row_number', 5, 'first_name', 'Broken', 'last_name', 'Branch',
        'birth_date', '2014-02-04', 'gender', 'male',
        'guardian_name', 'Guardian Broken', 'guardian_relation', 'father',
        'guardian_phone', '+213555000004', 'branch_code', 'MISSING', 'class_code', ''
      )
    )
  )::text,
  false
);
reset role;

do $$
declare
  batch_row record;
begin
  select * into batch_row from public.student_import_batches
  where id = current_setting('test.import_batch_id')::uuid;
  if batch_row.total_count <> 4 or batch_row.ready_count <> 1
     or batch_row.warning_count <> 1 or batch_row.duplicate_count <> 1
     or batch_row.error_count <> 1 or batch_row.created_count <> 0
     or batch_row.status <> 'staged' then
    raise exception 'staged batch counts are incorrect: %', row_to_json(batch_row);
  end if;
end;
$$;

-- Import-ledger PII becomes unreadable immediately if the creator loses school membership.
update public.school_memberships
set status = 'revoked'
where school_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '60000000-0000-4000-8000-000000000002';

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
begin
  if exists (
    select 1 from public.get_student_import_batch(current_setting('test.import_batch_id')::uuid)
  ) then raise exception 'revoked registrar unexpectedly read own import batch'; end if;
  if exists (
    select 1 from public.list_student_import_rows(current_setting('test.import_batch_id')::uuid)
  ) then raise exception 'revoked registrar unexpectedly read own import rows'; end if;
end;
$$;
reset role;

update public.school_memberships
set status = 'active'
where school_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '60000000-0000-4000-8000-000000000002';

-- The registrar owns the batch and may inspect and commit it while membership remains active.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
declare
  visible_rows integer;
  created_rows integer;
begin
  select count(*) into visible_rows
  from public.list_student_import_rows(current_setting('test.import_batch_id')::uuid);
  if visible_rows <> 4 then raise exception 'registrar cannot read own staged rows'; end if;

  created_rows := public.commit_student_import_batch(current_setting('test.import_batch_id')::uuid);
  if created_rows <> 2 then raise exception 'expected 2 imported students, got %', created_rows; end if;
end;
$$;
reset role;

do $$
declare
  batch_row record;
  created_rows integer;
begin
  select * into batch_row from public.student_import_batches
  where id = current_setting('test.import_batch_id')::uuid;
  select count(*) into created_rows from public.student_import_rows
  where batch_id = batch_row.id and row_status = 'created';
  if batch_row.status <> 'committed' or batch_row.created_count <> 2
     or batch_row.ready_count <> 0 or batch_row.warning_count <> 0
     or batch_row.duplicate_count <> 1 or batch_row.error_count <> 1
     or created_rows <> 2 then
    raise exception 'commit state is inconsistent: %', row_to_json(batch_row);
  end if;
  if not exists (select 1 from public.students where school_id = batch_row.school_id and national_id = 'NID-NEW-001')
     or not exists (select 1 from public.students where school_id = batch_row.school_id and national_id = 'NID-NEW-002') then
    raise exception 'eligible students were not created';
  end if;
end;
$$;

-- A second commit cannot replay the same batch.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
begin
  begin
    perform public.commit_student_import_batch(current_setting('test.import_batch_id')::uuid);
    raise exception 'committed batch unexpectedly replayed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- A teacher cannot read or roll back a registrar-owned batch.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', false);
do $$
begin
  if exists (
    select 1 from public.get_student_import_batch(current_setting('test.import_batch_id')::uuid)
  ) then raise exception 'teacher unexpectedly read registrar batch'; end if;
  begin
    perform public.rollback_student_import_batch(current_setting('test.import_batch_id')::uuid);
    raise exception 'teacher unexpectedly rolled back registrar batch';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Safe rollback removes only students created by this exact batch.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
declare
  removed_rows integer;
begin
  removed_rows := public.rollback_student_import_batch(current_setting('test.import_batch_id')::uuid);
  if removed_rows <> 2 then raise exception 'expected 2 rolled back students, got %', removed_rows; end if;
end;
$$;
reset role;

do $$
declare
  batch_row record;
begin
  select * into batch_row from public.student_import_batches
  where id = current_setting('test.import_batch_id')::uuid;
  if batch_row.status <> 'rolled_back' or batch_row.created_count <> 0
     or batch_row.ready_count <> 1 or batch_row.warning_count <> 1
     or batch_row.duplicate_count <> 1 or batch_row.error_count <> 1 then
    raise exception 'rollback counters are incorrect: %', row_to_json(batch_row);
  end if;
  if exists (select 1 from public.students where national_id in ('NID-NEW-001','NID-NEW-002')) then
    raise exception 'rollback left batch-created students behind';
  end if;
end;
$$;

-- No direct DELETE privilege is exposed to authenticated clients.
do $$
begin
  if has_table_privilege('authenticated', 'public.student_import_batches', 'DELETE')
     or has_table_privilege('authenticated', 'public.student_import_rows', 'DELETE') then
    raise exception 'authenticated unexpectedly has DELETE on import staging';
  end if;
end;
$$;
