\set ON_ERROR_STOP on

begin;

do $$
declare
  signature text;
  role_name text;
begin
  foreach signature in array array[
    'public.validate_document_subject_scope()',
    'public.validate_document_storage_object()',
    'public.sync_student_document_branch()'
  ] loop
    foreach role_name in array array['anon', 'authenticated'] loop
      if has_function_privilege(role_name, signature, 'EXECUTE') then
        raise exception '% unexpectedly has EXECUTE on %', role_name, signature;
      end if;
    end loop;
  end loop;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'document_records_validate_subject_scope'
      and not tgisinternal
  ) then
    raise exception 'document subject-scope trigger missing after execute hardening';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'document_records_validate_storage_object'
      and not tgisinternal
  ) then
    raise exception 'document storage-integrity trigger missing after execute hardening';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'students_sync_document_branch'
      and not tgisinternal
  ) then
    raise exception 'student document branch-sync trigger missing after execute hardening';
  end if;
end;
$$;

select 'documents_trigger_function_security_passed';

rollback;
