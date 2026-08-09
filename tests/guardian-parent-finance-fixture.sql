\set ON_ERROR_STOP on

-- School A / Guardian One / Student A1: mixed open, paid, waived, and cancelled
-- charges plus one reversed payment. Parent totals must match Student 360 rules:
-- waived/cancelled charges and reversed payments do not contribute.
insert into public.student_charges (
  id,
  school_id,
  branch_id,
  student_id,
  charge_type,
  description,
  original_amount,
  discount_amount,
  discount_value_type,
  discount_value,
  discount_reason,
  due_date,
  status,
  created_by
) values
  (
    '82000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'fee',
    'Monthly fee',
    1000,
    0,
    null,
    null,
    null,
    current_date - 30,
    'pending',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'registration',
    'Registration fee',
    600,
    100,
    'fixed',
    100,
    'Sibling discount test',
    current_date - 20,
    'pending',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '82000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'materials',
    'Waived materials',
    300,
    0,
    null,
    null,
    null,
    current_date - 15,
    'waived',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '82000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'other',
    'Cancelled fee',
    200,
    0,
    null,
    null,
    null,
    current_date - 10,
    'cancelled',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '82000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'transport',
    'Future transport',
    600,
    0,
    null,
    null,
    null,
    current_date + 30,
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
  status,
  received_by
) values
  (
    '83000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    400,
    'cash',
    current_date - 10,
    'completed',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002',
    500,
    'bank_transfer',
    current_date - 2,
    'completed',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    100,
    'cash',
    current_date - 1,
    'reversed',
    '60000000-0000-4000-8000-000000000001'
  );

-- School B child of the same global guardian account. Values intentionally
-- differ so cross-school leakage is visible in assertions.
insert into public.student_charges (
  id,
  school_id,
  branch_id,
  student_id,
  charge_type,
  description,
  original_amount,
  discount_amount,
  discount_value_type,
  discount_value,
  discount_reason,
  due_date,
  status,
  created_by
) values (
  '82000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000005',
  'fee',
  'School B fee',
  700,
  0,
  null,
  null,
  null,
  current_date + 5,
  'pending',
  '60000000-0000-4000-8000-000000000008'
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
  status,
  received_by
) values (
  '83000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000005',
  '82000000-0000-4000-8000-000000000006',
  200,
  'postal',
  current_date - 3,
  'completed',
  '60000000-0000-4000-8000-000000000008'
);

-- Financial rows for a pending guardian child and for a student with no
-- relationship to Guardian One. Both must remain inaccessible.
insert into public.student_charges (
  id,
  school_id,
  branch_id,
  student_id,
  charge_type,
  description,
  original_amount,
  discount_amount,
  discount_value_type,
  discount_value,
  discount_reason,
  due_date,
  status,
  created_by
) values
  (
    '82000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    'fee',
    'Pending guardian child fee',
    900,
    0,
    null,
    null,
    null,
    current_date,
    'pending',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '82000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003',
    'fee',
    'Unrelated student fee',
    800,
    0,
    null,
    null,
    null,
    current_date,
    'pending',
    '60000000-0000-4000-8000-000000000001'
  );
