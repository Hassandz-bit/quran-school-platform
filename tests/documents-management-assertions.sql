\set ON_ERROR_STOP on

begin;

grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Prospect', 'A1', '2017-04-03', 'male',
  'Prospect Guardian', '+213555000700', 'guardian-docs@example.test',
  'walk_in', null, null
) as lead_a1 \gset
select set_config('test.lead_a1', :'lead_a1', true);

select public.create_document_slot(
  '10000000-0000-4000-8000-000000000001',
  'student',
  '50000000-0000-4000-8000-000000000001',
  'birth_certificate',
  null,
  'Original slot'
) as student_doc \gset
select set_config('test.student_doc', :'student_doc', true);

select set_config(
  'test.student_path_1',
  '10000000-0000-4000-8000-000000000001/student/50000000-0000-4000-8000-000000000001/' || :'student_doc' || '/birth-certificate-1.pdf',
  true
);
select set_config(
  'test.student_path_2',
  '10000000-0000-4000-8000-000000000001/student/50000000-0000-4000-8000-000000000001/' || :'student_doc' || '/birth-certificate-2.pdf',
  true
);

do $$
begin
  begin
    perform public.finalize_document_upload(
      current_setting('test.student_doc')::uuid,
      current_setting('test.student_path_1'),
      'birth-certificate.pdf',
      'application/pdf',
      1024,
      current_date - 10,
      null,
      'Should fail before Storage insert'
    );
    raise exception 'phantom document finalization unexpectedly succeeded';
  exception
    when foreign_key_violation then
      if sqlerrm <> 'document_storage_object_missing' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values (
      'school-documents',
      '10000000-0000-4000-8000-000000000001/student/50000000-0000-4000-8000-000000000003/' || current_setting('test.student_doc') || '/wrong.pdf'
    );
    raise exception 'wrong-subject storage insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

insert into storage.objects (bucket_id, name)
values ('school-documents', current_setting('test.student_path_1'));

select public.finalize_document_upload(
  current_setting('test.student_doc')::uuid,
  current_setting('test.student_path_1'),
  'birth-certificate.pdf',
  'application/pdf',
  1024,
  current_date - 10,
  null,
  'Received from guardian'
);

do $$
begin
  if not exists (
    select 1 from public.students
    where id = '50000000-0000-4000-8000-000000000001'
      and birth_certificate_provided = true
  ) then
    raise exception 'birth certificate provided flag was not synchronized';
  end if;
end;
$$;

select public.update_document_status(
  current_setting('test.student_doc')::uuid,
  'verified',
  null,
  'Verified against original'
);

do $$
begin
  delete from storage.objects
  where bucket_id = 'school-documents'
    and name = current_setting('test.student_path_1');
  if found then
    raise exception 'current document storage delete unexpectedly succeeded';
  end if;
end;
$$;

insert into storage.objects (bucket_id, name)
values ('school-documents', current_setting('test.student_path_2'));

select public.finalize_document_upload(
  current_setting('test.student_doc')::uuid,
  current_setting('test.student_path_2'),
  'birth-certificate-new.pdf',
  'application/pdf',
  2048,
  current_date - 5,
  null,
  'Replacement copy'
) as previous_path \gset
select set_config('test.previous_path', :'previous_path', true);

do $$
begin
  if current_setting('test.previous_path') <> current_setting('test.student_path_1') then
    raise exception 'unexpected previous path from replacement';
  end if;
end;
$$;

delete from storage.objects
where bucket_id = 'school-documents'
  and name = current_setting('test.student_path_1');

select public.create_document_slot(
  '10000000-0000-4000-8000-000000000001',
  'registration_lead',
  current_setting('test.lead_a1')::uuid,
  'guardian_identity',
  null,
  null
) as lead_doc \gset
select set_config('test.lead_doc', :'lead_doc', true);
select set_config(
  'test.lead_path',
  '10000000-0000-4000-8000-000000000001/registration_lead/' || current_setting('test.lead_a1') || '/' || :'lead_doc' || '/guardian-id.jpg',
  true
);
insert into storage.objects (bucket_id, name)
values ('school-documents', current_setting('test.lead_path'));
select public.finalize_document_upload(
  current_setting('test.lead_doc')::uuid,
  current_setting('test.lead_path'),
  'guardian-id.jpg',
  'image/jpeg',
  4096,
  null,
  current_date + 365,
  null
);

do $$
begin
  begin
    perform count(*) from public.document_records;
    raise exception 'direct document_records read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.document_events;
    raise exception 'direct document_events read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
do $$
declare
  access_row record;
  leaked_count integer;
  visible_docs integer;
begin
  select * into access_row
  from public.get_documents_access('10000000-0000-4000-8000-000000000001');
  if access_row.can_view is distinct from true or access_row.can_manage is distinct from true then
    raise exception 'registrar document access flags are incorrect';
  end if;

  select count(*) into leaked_count
  from public.list_document_subjects('10000000-0000-4000-8000-000000000001', null, 1000)
  where branch_id = '20000000-0000-4000-8000-000000000002';
  if leaked_count <> 0 then
    raise exception 'registrar saw branch A2 document subjects';
  end if;

  select count(*) into visible_docs
  from public.list_document_records('10000000-0000-4000-8000-000000000001', null, null, 500);
  if visible_docs <> 2 then
    raise exception 'registrar should see two A1 documents, saw %', visible_docs;
  end if;

  begin
    perform public.create_document_slot(
      '10000000-0000-4000-8000-000000000001',
      'student',
      '50000000-0000-4000-8000-000000000003',
      'medical_report', null, null
    );
    raise exception 'registrar cross-branch document create unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', true);
do $$
declare
  access_row record;
  subject_count integer;
begin
  select * into access_row
  from public.get_documents_access('10000000-0000-4000-8000-000000000001');
  if access_row.can_view is distinct from false or access_row.can_manage is distinct from false then
    raise exception 'teacher unexpectedly received document access';
  end if;

  select count(*) into subject_count
  from public.list_document_subjects('10000000-0000-4000-8000-000000000001', null, 1000);
  if subject_count <> 0 then
    raise exception 'teacher unexpectedly saw document subjects';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000008', true);
do $$
declare
  school_a_count integer;
begin
  select count(*) into school_a_count
  from public.list_document_records('10000000-0000-4000-8000-000000000001', null, null, 500);
  if school_a_count <> 0 then
    raise exception 'School B admin saw School A document metadata';
  end if;
end;
$$;

reset role;

do $$
declare
  student_event_count integer;
  bucket_public boolean;
  bucket_limit bigint;
  update_policy_count integer;
begin
  select count(*) into student_event_count
  from public.document_events
  where document_id = current_setting('test.student_doc')::uuid;
  if student_event_count <> 4 then
    raise exception 'student document should have four audit events, saw %', student_event_count;
  end if;

  if not exists (
    select 1 from public.document_events
    where document_id = current_setting('test.student_doc')::uuid
      and event_type = 'file_replaced'
      and previous_status = 'verified'
      and new_status = 'uploaded'
  ) then
    raise exception 'document replacement audit event is missing';
  end if;

  select public, file_size_limit into bucket_public, bucket_limit
  from storage.buckets where id = 'school-documents';
  if bucket_public is distinct from false or bucket_limit <> 10485760 then
    raise exception 'school-documents bucket privacy/size configuration is incorrect';
  end if;

  select count(*) into update_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'school documents scoped update';
  if update_policy_count <> 0 then
    raise exception 'in-place document storage update policy should not exist';
  end if;
end;
$$;

rollback;
