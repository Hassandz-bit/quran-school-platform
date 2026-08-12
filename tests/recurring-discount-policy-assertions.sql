\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);

-- Create one social percentage discount and one sibling fixed discount.
select public.create_finance_student_discount_policy(
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'needy',
  'percentage',
  25,
  'حالة اجتماعية معتمدة للاختبار',
  '2026-09-01',
  null
) as needy_policy_id \gset
select set_config('test.needy_policy_id', :'needy_policy_id', false);

select public.create_finance_student_discount_policy(
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  'sibling',
  'fixed',
  100,
  'أكثر من ابن مسجل في المدرسة',
  '2026-09-01',
  null
) as sibling_policy_id \gset
select set_config('test.sibling_policy_id', :'sibling_policy_id', false);

-- September has no existing equivalent charges: both students are generated.
select public.preview_recurring_fee_plan_generation(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-09-15'
) as discount_preview_json \gset
select set_config('test.discount_preview_json', :'discount_preview_json', false);

do $$
declare
  p jsonb := current_setting('test.discount_preview_json')::jsonb;
begin
  if (p ->> 'eligible_count')::integer <> 2 then
    raise exception 'expected 2 eligible discount students: %', p;
  end if;
  if (p ->> 'already_charged_count')::integer <> 0
     or (p ->> 'to_create_count')::integer <> 2 then
    raise exception 'unexpected September charge counts: %', p;
  end if;
  if (p ->> 'students_with_active_discounts')::integer <> 1 then
    raise exception 'legacy manual discount should remain a manual-review warning: %', p;
  end if;
  if (p ->> 'auto_discount_student_count')::integer <> 2 then
    raise exception 'expected 2 automatic social/sibling discounts: %', p;
  end if;
  if (p ->> 'auto_discount_conflict_count')::integer <> 0 then
    raise exception 'unexpected discount conflict: %', p;
  end if;
  if (p ->> 'gross_total_amount')::numeric <> 2000 then
    raise exception 'expected gross 2000: %', p;
  end if;
  if (p ->> 'auto_discount_savings')::numeric <> 350 then
    raise exception 'expected discount saving 350: %', p;
  end if;
  if (p ->> 'total_amount')::numeric <> 1650 then
    raise exception 'expected net total 1650: %', p;
  end if;
  if p ->> 'discount_policy' <> 'auto_social_sibling_after_preview' then
    raise exception 'unexpected recurring discount policy: %', p;
  end if;
end;
$$;

select public.generate_recurring_fee_plan_charges(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-09-15'
) as discounted_generation_json \gset
select set_config('test.discounted_generation_json', :'discounted_generation_json', false);

do $$
declare
  p jsonb := current_setting('test.discounted_generation_json')::jsonb;
begin
  if (p ->> 'created_count')::integer <> 2 then
    raise exception 'expected 2 discounted September charges: %', p;
  end if;
  if (p ->> 'auto_discounted_count')::integer <> 2 then
    raise exception 'expected 2 auto-discounted charges: %', p;
  end if;
  if (p ->> 'discount_savings')::numeric <> 350 then
    raise exception 'expected generation savings 350: %', p;
  end if;
  if (p ->> 'created_total')::numeric <> 1650 then
    raise exception 'expected generated net 1650: %', p;
  end if;
end;
$$;

-- Verify the exact auditable charge details as database owner.
reset role;
do $$
declare
  needy_charge public.student_charges%rowtype;
  sibling_charge public.student_charges%rowtype;
begin
  select * into strict needy_charge
  from public.student_charges
  where school_id = '10000000-0000-4000-8000-000000000001'
    and student_id = '50000000-0000-4000-8000-000000000001'
    and fee_plan_id = '71000000-0000-4000-8000-000000000001'
    and period_start = '2026-09-01';

  if needy_charge.original_amount <> 1000
    or needy_charge.discount_amount <> 250
    or needy_charge.net_amount <> 750
    or needy_charge.discount_value_type <> 'percentage'
    or needy_charge.discount_value <> 25
    or needy_charge.discount_reason not like 'خصم اجتماعي — %'
  then
    raise exception 'needy recurring discount mismatch: %', row_to_json(needy_charge);
  end if;

  select * into strict sibling_charge
  from public.student_charges
  where school_id = '10000000-0000-4000-8000-000000000001'
    and student_id = '50000000-0000-4000-8000-000000000002'
    and fee_plan_id = '71000000-0000-4000-8000-000000000001'
    and period_start = '2026-09-01';

  if sibling_charge.original_amount <> 1000
    or sibling_charge.discount_amount <> 100
    or sibling_charge.net_amount <> 900
    or sibling_charge.discount_value_type <> 'fixed'
    or sibling_charge.discount_value <> 100
    or sibling_charge.discount_reason not like 'خصم إخوة — %'
  then
    raise exception 'sibling recurring discount mismatch: %', row_to_json(sibling_charge);
  end if;
end;
$$;

-- The RPC itself refuses a second overlapping automatic policy.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
do $$
begin
  begin
    perform public.create_finance_student_discount_policy(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      'sibling',
      'fixed',
      50,
      'سياسة متعارضة يجب رفضها',
      '2026-10-01',
      null
    );
    raise exception 'expected overlapping automatic discount rejection';
  exception when unique_violation then
    if sqlerrm <> 'FINANCE_DISCOUNT_POLICY_OVERLAP' then raise; end if;
  end;
end;
$$;

-- Simulate legacy/corrupt data containing two opted-in policies so preview must
-- surface a conflict and generation must refuse rather than stacking them.
reset role;
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
  auto_apply_recurring,
  created_by
) values (
  '72000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'sibling',
  'fixed',
  50,
  'Injected conflict for runtime test',
  '2026-10-01',
  null,
  'active',
  true,
  '60000000-0000-4000-8000-000000000001'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);
select public.preview_recurring_fee_plan_generation(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-10-15'
) as conflict_preview_json \gset
select set_config('test.conflict_preview_json', :'conflict_preview_json', false);

do $$
declare
  p jsonb := current_setting('test.conflict_preview_json')::jsonb;
begin
  if (p ->> 'auto_discount_conflict_count')::integer <> 1 then
    raise exception 'expected one conflicting student: %', p;
  end if;
  if (p ->> 'auto_discount_student_count')::integer <> 1 then
    raise exception 'only Student 2 should have a resolvable auto discount: %', p;
  end if;
end;
$$;

do $$
begin
  begin
    perform public.generate_recurring_fee_plan_charges(
      '10000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '2026-10-15'
    );
    raise exception 'expected recurring generation to stop on discount conflict';
  exception when invalid_parameter_value then
    if sqlerrm <> 'FINANCE_DISCOUNT_POLICY_CONFLICT' then raise; end if;
  end;
end;
$$;

-- Finance A cannot manage discount policies in Branch A2.
do $$
begin
  begin
    perform public.create_finance_student_discount_policy(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      'needy',
      'percentage',
      10,
      'Cross-branch denial test',
      '2026-10-01',
      null
    );
    raise exception 'expected A2 discount scope denial';
  exception when insufficient_privilege then
    if sqlerrm <> 'FINANCE_MANAGE_REQUIRED' then raise; end if;
  end;
end;
$$;

-- Deactivation is a retained status change, not a delete.
select public.deactivate_finance_student_discount_policy(
  '10000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000099'
) as deactivated \gset
select set_config('test.deactivated', :'deactivated', false);

do $$
begin
  if current_setting('test.deactivated') <> 't' then
    raise exception 'expected conflict policy deactivation';
  end if;
end;
$$;

reset role;
do $$
begin
  if not exists (
    select 1
    from public.student_discounts
    where id = '72000000-0000-4000-8000-000000000099'
      and status = 'inactive'
  ) then
    raise exception 'discount policy history was deleted instead of deactivated';
  end if;
end;
$$;

select 'recurring_discount_policy_runtime_passed' as result;
