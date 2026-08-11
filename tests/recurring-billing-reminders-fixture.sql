\set ON_ERROR_STOP on

-- Keep Finance A branch-scoped so the runtime test proves exact branch isolation.
update public.membership_roles
set branch_id = '20000000-0000-4000-8000-000000000001'
where id = '62000000-0000-4000-8000-000000000005';

-- Keep the A1 recurring-generation population deterministic: exactly student 1 + 2.
update public.students
set status = 'inactive'
where school_id = '10000000-0000-4000-8000-000000000001'
  and branch_id = '20000000-0000-4000-8000-000000000001'
  and id not in (
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002'
  );

insert into public.fee_plans (
  id,
  school_id,
  branch_id,
  name,
  code,
  billing_cycle,
  amount,
  currency,
  due_day,
  status,
  description,
  created_by
) values
  (
    '71000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'اشتراك شهري A1',
    'MONTH_A1',
    'monthly',
    1000,
    'DZD',
    10,
    'active',
    'Recurring runtime monthly plan',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    null,
    'اشتراك ربع سنوي عام',
    'QUARTER_ALL',
    'quarterly',
    3000,
    'DZD',
    5,
    'active',
    'School-wide recurring plan',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'اشتراك شهري A2',
    'MONTH_A2',
    'monthly',
    1200,
    'DZD',
    12,
    'active',
    'Other branch recurring plan',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '71000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'خطة بلا يوم استحقاق',
    'MONTH_NO_DUE',
    'monthly',
    700,
    'DZD',
    null,
    'active',
    'Must be rejected by recurring preview',
    '60000000-0000-4000-8000-000000000001'
  );

-- Student 1 has an active discount policy. Generation must warn, not auto-apply it.
insert into public.student_discounts (
  id,
  school_id,
  branch_id,
  student_id,
  discount_type,
  value_type,
  value,
  reason,
  start_date,
  end_date,
  status,
  created_by
) values (
  '72000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'needy',
  'percentage',
  25,
  'Runtime active discount',
  '2026-01-01',
  null,
  'active',
  '60000000-0000-4000-8000-000000000001'
);

-- Student 2 already has the same plan/period manually. Recurring generation must
-- treat any equivalent charge as existing instead of creating a duplicate.
insert into public.student_charges (
  id,
  school_id,
  branch_id,
  student_id,
  fee_plan_id,
  charge_type,
  period_start,
  period_end,
  description,
  original_amount,
  discount_amount,
  due_date,
  status,
  created_by
) values (
  '73000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001',
  'fee',
  '2026-08-01',
  '2026-08-31',
  'Existing August charge',
  1000,
  0,
  '2026-08-10',
  'pending',
  '60000000-0000-4000-8000-000000000001'
);

-- Guardian One is current/active for Student 1. Guardian Two stays pending for
-- Student 2 so that charge counts and recipient counts differ in reminder previews.
insert into public.student_guardians (
  id,
  school_id,
  student_id,
  guardian_profile_id,
  relationship_type,
  is_primary,
  status,
  created_by,
  activated_at
) values
  (
    '74000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000006',
    'father',
    true,
    'active',
    '60000000-0000-4000-8000-000000000001',
    now()
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000007',
    'mother',
    false,
    'pending',
    '60000000-0000-4000-8000-000000000001',
    null
  );
