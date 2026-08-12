\set ON_ERROR_STOP on

-- Finance A is branch A1 only; Admin A remains school-wide.
update public.membership_roles
set branch_id = '20000000-0000-4000-8000-000000000001'
where id = '62000000-0000-4000-8000-000000000005';

insert into public.teachers (
  id, school_id, branch_id, profile_id, first_name, last_name, gender,
  hire_date, status, created_by
) values (
  '75000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000003',
  'Teacher', 'Treasury', 'male', '2026-01-01', 'active',
  '60000000-0000-4000-8000-000000000001'
);

insert into public.student_charges (
  id, school_id, branch_id, student_id, charge_type, description,
  original_amount, discount_amount, due_date, status, created_by
) values (
  '76000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'fee', 'Treasury runtime charge', 1000, 0, '2026-08-10', 'pending',
  '60000000-0000-4000-8000-000000000001'
);
