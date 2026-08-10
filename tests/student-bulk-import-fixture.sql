\set ON_ERROR_STOP on

update public.students
set national_id = 'EXISTING-IMPORT-ID'
where id = '50000000-0000-4000-8000-000000000001';

insert into public.classes (
  id,
  school_id,
  branch_id,
  name,
  code,
  schedule_label,
  status,
  created_by
) values (
  '74000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Import Test Class',
  'IMPORT_CLASS',
  'Test schedule',
  'active',
  '60000000-0000-4000-8000-000000000002'
);

-- The fixture and assertions are intentionally executed by separate psql
-- processes. Persist the JSON in this isolated test-only table, then the
-- assertion session copies it into its own custom GUC.
create table public.student_import_test_payload (
  payload jsonb not null
);

insert into public.student_import_test_payload (payload)
values (
  $json$[
    {
      "first_name":"Bulk",
      "last_name":"Ready",
      "birth_date":"2015-05-10",
      "gender":"male",
      "national_id":"IMP-READY-001",
      "phone":"",
      "email":"",
      "address":"",
      "previous_school":"",
      "education_level":"primary",
      "education_year":"5",
      "guardian_name":"Ready Guardian",
      "guardian_relation":"father",
      "guardian_phone":"0551000001",
      "guardian_email":"",
      "guardian_job":"",
      "branch_code":"MAIN",
      "class_code":"IMPORT_CLASS",
      "start_date":"2026-08-10",
      "birth_certificate_provided":false,
      "photos_provided":false,
      "medical_report_provided":false,
      "previous_certificate_provided":false
    },
    {
      "first_name":"Student",
      "last_name":"A1",
      "birth_date":"2015-01-01",
      "gender":"male",
      "national_id":"IMP-WARN-001",
      "phone":"",
      "email":"",
      "address":"",
      "previous_school":"",
      "education_level":"primary",
      "education_year":"4",
      "guardian_name":"Warning Guardian",
      "guardian_relation":"father",
      "guardian_phone":"0551000002",
      "guardian_email":"",
      "guardian_job":"",
      "branch_code":"MAIN",
      "class_code":"",
      "start_date":"2026-08-10",
      "birth_certificate_provided":false,
      "photos_provided":false,
      "medical_report_provided":false,
      "previous_certificate_provided":false
    },
    {
      "first_name":"Existing",
      "last_name":"Duplicate",
      "birth_date":"2015-06-01",
      "gender":"female",
      "national_id":"EXISTING-IMPORT-ID",
      "phone":"",
      "email":"",
      "address":"",
      "previous_school":"",
      "education_level":"middle",
      "education_year":"1",
      "guardian_name":"Duplicate Guardian",
      "guardian_relation":"mother",
      "guardian_phone":"0551000003",
      "guardian_email":"",
      "guardian_job":"",
      "branch_code":"MAIN",
      "class_code":"",
      "start_date":"2026-08-10",
      "birth_certificate_provided":false,
      "photos_provided":false,
      "medical_report_provided":false,
      "previous_certificate_provided":false
    },
    {
      "first_name":"Wrong",
      "last_name":"Branch",
      "birth_date":"2015-07-01",
      "gender":"male",
      "national_id":"IMP-ERROR-001",
      "phone":"",
      "email":"",
      "address":"",
      "previous_school":"",
      "education_level":"primary",
      "education_year":"3",
      "guardian_name":"Error Guardian",
      "guardian_relation":"father",
      "guardian_phone":"0551000004",
      "guardian_email":"",
      "guardian_job":"",
      "branch_code":"MISSING",
      "class_code":"",
      "start_date":"2026-08-10",
      "birth_certificate_provided":false,
      "photos_provided":false,
      "medical_report_provided":false,
      "previous_certificate_provided":false
    },
    {
      "first_name":"Bulk",
      "last_name":"Ready",
      "birth_date":"2015-05-10",
      "gender":"male",
      "national_id":"IMP-READY-001",
      "phone":"",
      "email":"",
      "address":"",
      "previous_school":"",
      "education_level":"primary",
      "education_year":"5",
      "guardian_name":"Ready Guardian",
      "guardian_relation":"father",
      "guardian_phone":"0551000001",
      "guardian_email":"",
      "guardian_job":"",
      "branch_code":"MAIN",
      "class_code":"IMPORT_CLASS",
      "start_date":"2026-08-10",
      "birth_certificate_provided":false,
      "photos_provided":false,
      "medical_report_provided":false,
      "previous_certificate_provided":false
    }
  ]$json$::jsonb
);
