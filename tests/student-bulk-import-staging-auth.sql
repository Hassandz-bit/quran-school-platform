\set ON_ERROR_STOP on

begin;

-- Revocation between Edge authorization and the service-role staging RPC must
-- prevent persistence entirely, not merely mark every row unauthorized later.
update public.school_memberships
set status = 'revoked'
where school_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '60000000-0000-4000-8000-000000000002';

set role service_role;
do $$
begin
  begin
    perform public.stage_student_import_batch(
      '10000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      'revoked-race.xlsx',
      repeat('e', 64),
      jsonb_build_array(
        jsonb_build_object(
          'row_number', 2, 'first_name', 'Revoked', 'last_name', 'Race',
          'birth_date', '2014-06-01', 'gender', 'male',
          'guardian_name', 'Guardian Race', 'guardian_relation', 'father',
          'guardian_phone', '+213555001040', 'branch_code', 'MAIN', 'class_code', 'IMPORT_A'
        )
      )
    );
    raise exception 'revoked actor unexpectedly staged import data';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  if exists (
    select 1 from public.student_import_batches
    where file_sha256 = repeat('e', 64)
  ) then
    raise exception 'revoked staging attempt persisted an import batch';
  end if;
end;
$$;

rollback;
