\set ON_ERROR_STOP on

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

-- Multiple distinct "other" documents are supported while the same label is idempotent.
select public.create_document_slot(
  '10000000-0000-4000-8000-000000000001',
  'student',
  '50000000-0000-4000-8000-000000000001',
  'other',
  'Authorization Form',
  null
) as other_doc_one \gset
select public.create_document_slot(
  '10000000-0000-4000-8000-000000000001',
  'student',
  '50000000-0000-4000-8000-000000000001',
  'other',
  'Transport Consent',
  null
) as other_doc_two \gset
select public.create_document_slot(
  '10000000-0000-4000-8000-000000000001',
  'student',
  '50000000-0000-4000-8000-000000000001',
  'other',
  ' authorization form ',
  null
) as other_doc_one_repeat \gset

select set_config('test.other_doc_one', :'other_doc_one', true);
select set_config('test.other_doc_two', :'other_doc_two', true);
select set_config('test.other_doc_one_repeat', :'other_doc_one_repeat', true);

do $$
begin
  if current_setting('test.other_doc_one') = current_setting('test.other_doc_two') then
    raise exception 'distinct custom document labels collapsed into one slot';
  end if;
  if current_setting('test.other_doc_one') <> current_setting('test.other_doc_one_repeat') then
    raise exception 'same custom document label should return the existing slot';
  end if;
end;
$$;

-- Student A1 starts in Branch A1. Move the student through the same browser
-- UPDATE path used by the application and ensure document scope follows.
update public.students
set branch_id = '20000000-0000-4000-8000-000000000002'
where school_id = '10000000-0000-4000-8000-000000000001'
  and id = '50000000-0000-4000-8000-000000000001';

do $$
declare
  moved_count integer;
  wrong_branch_count integer;
begin
  select count(*) into moved_count
  from public.list_document_records(
    '10000000-0000-4000-8000-000000000001',
    'student',
    '50000000-0000-4000-8000-000000000001',
    100
  )
  where branch_id = '20000000-0000-4000-8000-000000000002';
  if moved_count <> 2 then
    raise exception 'both student document slots should follow the student to A2, saw %', moved_count;
  end if;

  select count(*) into wrong_branch_count
  from public.list_document_records(
    '10000000-0000-4000-8000-000000000001',
    'student',
    '50000000-0000-4000-8000-000000000001',
    100
  )
  where branch_id = '20000000-0000-4000-8000-000000000001';
  if wrong_branch_count <> 0 then
    raise exception 'student document scope remained on the old branch';
  end if;
end;
$$;

-- Registrar A is scoped to A1 and must immediately lose visibility after transfer.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.list_document_records(
    '10000000-0000-4000-8000-000000000001',
    'student',
    '50000000-0000-4000-8000-000000000001',
    100
  );
  if visible_count <> 0 then
    raise exception 'old-branch registrar retained document visibility after student transfer';
  end if;
end;
$$;

rollback;
