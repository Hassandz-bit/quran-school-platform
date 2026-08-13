\set ON_ERROR_STOP on

insert into public.classes (
  id, school_id, branch_id, name, code, status, created_by
) values (
  '74000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Import Class',
  'IMPORT_A',
  'active',
  '60000000-0000-4000-8000-000000000001'
);

update public.students
set national_id = 'NID-EXISTING-001'
where id = '50000000-0000-4000-8000-000000000001';
