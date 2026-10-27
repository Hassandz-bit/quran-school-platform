\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(ok boolean, msg text)
returns void
language plpgsql
as $$
begin
  if coalesce(ok, false) is not true then
    raise exception '%', msg;
  end if;
end
$$;

create or replace function pg_temp.assert_cleanup_blocked(expected_message text)
returns void
language plpgsql
as $$
declare
  actual_message text;
begin
  begin
    perform public.clear_school_demo_data('10000000-0000-4000-8000-000000000001');
    raise exception 'cleanup unexpectedly succeeded';
  exception
    when raise_exception then
      get stacked diagnostics actual_message = message_text;
      if actual_message <> expected_message then
        raise exception 'expected demo cleanup error %, got %', expected_message, actual_message;
      end if;
  end;
end
$$;

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.create_school_demo_data('10000000-0000-4000-8000-000000000001') as demo_batch_id \gset

select record_id as demo_student_id
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid
  and entity_type = 'student'
order by record_id
limit 1 \gset
select record_id as demo_teacher_id
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid
  and entity_type = 'teacher'
order by record_id
limit 1 \gset
select class_id as demo_class_id, branch_id as demo_branch_id
from public.students
where id = :'demo_student_id'::uuid \gset
select record_id as demo_session_id
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid
  and entity_type = 'attendance_session'
order by record_id
limit 1 \gset
select record_id as demo_attendance_record_id
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid
  and entity_type = 'attendance_record'
order by record_id
limit 1 \gset
select record_id as demo_memorization_record_id
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid
  and entity_type = 'memorization_record'
order by record_id
limit 1 \gset

-- Uploaded documents and student photos are preserved; cleanup fails closed.
insert into public.document_records (id, school_id, student_id, object_path)
values (
  '71000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  :'demo_student_id'::uuid,
  'private/demo-student-document.pdf'
);
select pg_temp.assert_cleanup_blocked('demo_cleanup_blocked_student_documents');
select pg_temp.assert_true(
  exists (select 1 from public.document_records where id = '71000000-0000-4000-8000-000000000001'),
  'demo_cleanup_preserves_uploaded_document'
);
delete from public.document_records where id = '71000000-0000-4000-8000-000000000001';

update public.students set photo_path =
  school_id::text || '/' || id::text || '/demo-photo-must-be-preserved.jpg'
where id = :'demo_student_id'::uuid;
select pg_temp.assert_cleanup_blocked('demo_cleanup_blocked_student_photo');
select pg_temp.assert_true(
  (select right(photo_path, char_length('demo-photo-must-be-preserved.jpg')) = 'demo-photo-must-be-preserved.jpg'
   from public.students where id = :'demo_student_id'::uuid),
  'demo_cleanup_preserves_student_photo'
);
update public.students set photo_path = null where id = :'demo_student_id'::uuid;

-- A result or follow-up attached to a live student must not be removed just
-- because it points at a demo class/teacher.
insert into public.school_track_results (id, school_id, branch_id, class_id, student_id)
values (
  '71000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  :'demo_branch_id'::uuid,
  :'demo_class_id'::uuid,
  '50000000-0000-4000-8000-000000000001'
);
select pg_temp.assert_cleanup_blocked('demo_cleanup_blocked_real_school_track_result');
delete from public.school_track_results where id = '71000000-0000-4000-8000-000000000002';

insert into public.memorization_follow_up_notes (
  id, school_id, class_id, student_id, teacher_id, source_record_id
) values (
  '71000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  :'demo_class_id'::uuid,
  '50000000-0000-4000-8000-000000000001',
  :'demo_teacher_id'::uuid,
  null
);
select pg_temp.assert_cleanup_blocked('demo_cleanup_blocked_real_follow_up_note');
delete from public.memorization_follow_up_notes where id = '71000000-0000-4000-8000-000000000003';

insert into public.payroll_compensation_profiles (school_id, teacher_id)
values ('10000000-0000-4000-8000-000000000001', :'demo_teacher_id'::uuid);
select pg_temp.assert_cleanup_blocked('demo_cleanup_blocked_demo_teacher_payroll');
delete from public.payroll_compensation_profiles where teacher_id = :'demo_teacher_id'::uuid;

insert into public.student_import_rows (created_student_id)
values (:'demo_student_id'::uuid);
select pg_temp.assert_cleanup_blocked('demo_cleanup_blocked_student_import_history');
delete from public.student_import_rows where created_student_id = :'demo_student_id'::uuid;

-- Create demo-only dependent records across modules introduced after 021.
insert into public.school_track_results (id, school_id, branch_id, class_id, student_id)
values (
  '72000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  :'demo_branch_id'::uuid,
  :'demo_class_id'::uuid,
  :'demo_student_id'::uuid
);
insert into public.school_track_result_history (id, school_id, result_id)
values (
  '72000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001'
);

insert into public.memorization_follow_up_notes (
  id, school_id, class_id, student_id, teacher_id, source_record_id
) values (
  '72000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  :'demo_class_id'::uuid,
  :'demo_student_id'::uuid,
  :'demo_teacher_id'::uuid,
  :'demo_memorization_record_id'::uuid
);
insert into public.memorization_follow_up_note_history (
  id, school_id, follow_up_note_id, student_id, teacher_id
) values (
  '72000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000003',
  :'demo_student_id'::uuid,
  :'demo_teacher_id'::uuid
);

insert into public.guardian_notification_events (
  id, school_id, student_id, attendance_session_id, attendance_record_id
) values (
  '72000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  :'demo_student_id'::uuid,
  :'demo_session_id'::uuid,
  :'demo_attendance_record_id'::uuid
);
insert into public.guardian_notification_deliveries (id, event_id)
values ('72000000-0000-4000-8000-000000000006', '72000000-0000-4000-8000-000000000005');

insert into public.official_receipts (id, school_id, student_id, payment_id, charge_id)
select
  '72000000-0000-4000-8000-000000000007',
  payment.school_id,
  payment.student_id,
  payment.id,
  payment.charge_id
from public.payments as payment
join public.demo_seed_records as demo_payment
  on demo_payment.batch_id = :'demo_batch_id'::uuid
 and demo_payment.school_id = payment.school_id
 and demo_payment.entity_type = 'payment'
 and demo_payment.record_id = payment.id
order by payment.id
limit 1;

insert into public.student_import_rows (duplicate_student_id)
values (:'demo_student_id'::uuid);
insert into public.demo_cleanup_unknown_refs (student_id)
values (:'demo_student_id'::uuid);

-- Unrecognized FKs are translated into a specific failure, and the failed RPC
-- rolls back all child deletions performed before the core student deletion.
select pg_temp.assert_cleanup_blocked('demo_cleanup_blocked_related_record');
select pg_temp.assert_true(
  (select status = 'active' from public.demo_seed_batches where id = :'demo_batch_id'::uuid)
  and exists (select 1 from public.school_track_results where id = '72000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.official_receipts where id = '72000000-0000-4000-8000-000000000007')
  and exists (select 1 from public.demo_cleanup_unknown_refs where student_id = :'demo_student_id'::uuid),
  'demo_cleanup_unexpected_fk_failure_rolls_back_atomically'
);
delete from public.demo_cleanup_unknown_refs where student_id = :'demo_student_id'::uuid;

select pg_temp.assert_true(
  public.clear_school_demo_data('10000000-0000-4000-8000-000000000001') = 20,
  'demo_cleanup_extended_student_count'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.school_track_results),
  'demo_cleanup_removes_demo_school_track_results'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.school_track_result_history),
  'demo_cleanup_removes_demo_school_track_history'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.memorization_follow_up_notes),
  'demo_cleanup_removes_demo_follow_up_notes'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.memorization_follow_up_note_history),
  'demo_cleanup_removes_demo_follow_up_history'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.guardian_notification_events)
  and (select count(*) = 0 from public.guardian_notification_deliveries),
  'demo_cleanup_removes_demo_notification_events'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.official_receipts),
  'demo_cleanup_removes_legacy_demo_receipts'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.student_import_rows where duplicate_student_id is null),
  'demo_cleanup_preserves_import_row_without_stale_student_link'
);
select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.clear_school_demo_data(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.clear_school_demo_data_before_071(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.prepare_school_demo_cleanup(uuid)', 'EXECUTE'),
  'demo_cleanup_only_wrapper_is_authenticated_callable'
);
