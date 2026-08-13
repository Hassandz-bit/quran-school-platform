\set ON_ERROR_STOP on

insert into public.student_charges (
  id,
  school_id,
  branch_id,
  student_id,
  fee_plan_id,
  charge_type,
  description,
  original_amount,
  discount_amount,
  due_date,
  status,
  created_by
) values (
  '71000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  null,
  'registration',
  'Registration fee 2026',
  1200.00,
  0,
  current_date,
  'pending',
  '60000000-0000-4000-8000-000000000001'
);

insert into public.payments (
  id,
  school_id,
  branch_id,
  student_id,
  charge_id,
  amount,
  payment_method,
  payment_date,
  reference_number,
  notes,
  status,
  received_by
) values (
  '72000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  1200.00,
  'cash',
  current_date,
  'PAY-TEST-001',
  'Official receipt migration test payment',
  'completed',
  '60000000-0000-4000-8000-000000000005'
);
