\set ON_ERROR_STOP on

begin;

-- An earlier invalid row must not reserve a national ID and suppress a later valid row.
set role service_role;
select set_config(
  'test.same_file_recovery_batch_id',
  public.stage_student_import_batch(
    '10000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'same-file-recovery.xlsx',
    repeat('c', 64),
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 20, 'first_name', 'Recover', 'last_name', 'Broken',
        'birth_date', '2014-04-01', 'gender', 'male',
        'national_id', 'NID-FILE-RECOVER-001', 'guardian_name', 'Guardian Recover',
        'guardian_relation', 'father', 'guardian_phone', '+213555001020',
        'branch_code', 'MISSING', 'class_code', ''
      ),
      jsonb_build_object(
        'row_number', 21, 'first_name', 'Recover', 'last_name', 'Valid',
        'birth_date', '2014-04-02', 'gender', 'male',
        'national_id', 'NID-FILE-RECOVER-001', 'guardian_name', 'Guardian Recover Valid',
        'guardian_relation', 'father', 'guardian_phone', '+213555001021',
        'branch_code', 'MAIN', 'class_code', 'IMPORT_A'
      )
    )
  )::text,
  false
);
reset role;

do $$
declare
  broken_status text;
  valid_status text;
begin
  select row_status into broken_status
  from public.student_import_rows
  where batch_id = current_setting('test.same_file_recovery_batch_id')::uuid and row_number = 20;

  select row_status into valid_status
  from public.student_import_rows
  where batch_id = current_setting('test.same_file_recovery_batch_id')::uuid and row_number = 21;

  if broken_status <> 'error' or valid_status <> 'ready' then
    raise exception 'invalid prior row suppressed later valid national ID: broken %, valid %', broken_status, valid_status;
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
declare
  created_rows integer;
begin
  created_rows := public.commit_student_import_batch(current_setting('test.same_file_recovery_batch_id')::uuid);
  if created_rows <> 1 then
    raise exception 'expected later valid national-ID row to commit, got %', created_rows;
  end if;
end;
$$;
reset role;

-- Identity-tuple duplicates are visible in preview, but remain recoverable if the
-- earlier canonical row becomes invalid before commit.
set role service_role;
select set_config(
  'test.same_file_identity_batch_id',
  public.stage_student_import_batch(
    '10000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'same-file-identity.xlsx',
    repeat('d', 64),
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 30, 'first_name', 'Same', 'last_name', 'Identity',
        'birth_date', '2014-05-01', 'gender', 'female',
        'guardian_name', 'Guardian Same', 'guardian_relation', 'mother',
        'guardian_phone', '+213555001030', 'branch_code', 'MAIN', 'class_code', 'IMPORT_A'
      ),
      jsonb_build_object(
        'row_number', 31, 'first_name', 'Same', 'last_name', 'Identity',
        'birth_date', '2014-05-01', 'gender', 'female',
        'guardian_name', 'Guardian Same Later', 'guardian_relation', 'mother',
        'guardian_phone', '+213555001030', 'branch_code', 'MAIN', 'class_code', ''
      )
    )
  )::text,
  false
);
reset role;

do $$
declare
  first_status text;
  later_status text;
  later_target uuid;
begin
  select row_status into first_status
  from public.student_import_rows
  where batch_id = current_setting('test.same_file_identity_batch_id')::uuid and row_number = 30;

  select row_status, duplicate_student_id into later_status, later_target
  from public.student_import_rows
  where batch_id = current_setting('test.same_file_identity_batch_id')::uuid and row_number = 31;

  if first_status <> 'ready' or later_status <> 'duplicate' or later_target is not null then
    raise exception 'same-file identity preview is incorrect: first %, later %, target %', first_status, later_status, later_target;
  end if;
end;
$$;

update public.classes
set status = 'inactive'
where id = '74000000-0000-4000-8000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', false);
do $$
declare
  created_rows integer;
begin
  created_rows := public.commit_student_import_batch(current_setting('test.same_file_identity_batch_id')::uuid);
  if created_rows <> 1 then
    raise exception 'expected fallback same-file identity row to commit, got %', created_rows;
  end if;
end;
$$;
reset role;

do $$
declare
  first_status text;
  later_status text;
begin
  select row_status into first_status
  from public.student_import_rows
  where batch_id = current_setting('test.same_file_identity_batch_id')::uuid and row_number = 30;

  select row_status into later_status
  from public.student_import_rows
  where batch_id = current_setting('test.same_file_identity_batch_id')::uuid and row_number = 31;

  if first_status <> 'error' or later_status <> 'created' then
    raise exception 'same-file duplicate was not safely re-evaluated: first %, later %', first_status, later_status;
  end if;
end;
$$;

rollback;
