\set ON_ERROR_STOP on

-- Three browser-facing finance RPCs must be hardened and callable only by
-- authenticated users. They authorize by guardian relationship, not finance role.
do $$
declare
  hardened_count integer;
begin
  select count(*)
  into hardened_count
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'get_my_guardian_student_finance_summary',
      'list_my_guardian_student_charges',
      'list_my_guardian_student_payments'
    )
    and procedure.prosecdef
    and procedure.proconfig @> array['search_path=""']::text[];

  if hardened_count <> 3 then
    raise exception 'expected 3 hardened parent finance functions, got %', hardened_count;
  end if;
end;
$$;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.get_my_guardian_student_finance_summary(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute guardian finance summary';
  end if;
  if has_function_privilege(
    'anon',
    'public.list_my_guardian_student_charges(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute guardian charge list';
  end if;
  if has_function_privilege(
    'anon',
    'public.list_my_guardian_student_payments(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute guardian payment list';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_my_guardian_student_finance_summary(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute guardian finance summary';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.list_my_guardian_student_charges(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute guardian charge list';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.list_my_guardian_student_payments(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute guardian payment list';
  end if;
end;
$$;

-- Parent-facing contracts intentionally omit accounting notes, receiver identity,
-- reference numbers, and other internal actor metadata.
do $$
declare
  charge_result text;
  payment_result text;
begin
  select pg_get_function_result(
    'public.list_my_guardian_student_charges(uuid,uuid,integer)'::regprocedure
  ) into charge_result;
  select pg_get_function_result(
    'public.list_my_guardian_student_payments(uuid,uuid,integer)'::regprocedure
  ) into payment_result;

  if charge_result ~* '(created_by|fee_plan_id|guardian_)' then
    raise exception 'charge contract exposes internal finance metadata';
  end if;
  if payment_result ~* '(notes|received_by|reference_number|created_by|guardian_)' then
    raise exception 'payment contract exposes internal accounting metadata';
  end if;
end;
$$;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);

-- Parent still has no direct finance table visibility. Dedicated RPCs are the
-- only read path.
do $$
begin
  if (
    select count(*)
    from public.student_charges
    where student_id = '50000000-0000-4000-8000-000000000001'
  ) <> 0 then
    raise exception 'parent must not gain direct student_charges SELECT';
  end if;

  if (
    select count(*)
    from public.payments
    where student_id = '50000000-0000-4000-8000-000000000001'
  ) <> 0 then
    raise exception 'parent must not gain direct payments SELECT';
  end if;
end;
$$;

-- School A summary excludes waived/cancelled charges and reversed payments.
do $$
declare
  charged_value numeric;
  paid_value numeric;
  remaining_value numeric;
  overdue_value numeric;
  open_count bigint;
  latest_payment date;
begin
  select
    total_charged,
    total_paid,
    remaining_amount,
    overdue_amount,
    open_charges_count,
    last_payment_date
  into
    charged_value,
    paid_value,
    remaining_value,
    overdue_value,
    open_count,
    latest_payment
  from public.get_my_guardian_student_finance_summary(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  );

  if row(charged_value, paid_value, remaining_value, overdue_value, open_count)
    is distinct from row(2100::numeric, 900::numeric, 1200::numeric, 600::numeric, 2::bigint)
  then
    raise exception 'unexpected guardian school A finance summary: %, %, %, %, %',
      charged_value, paid_value, remaining_value, overdue_value, open_count;
  end if;

  if latest_payment is distinct from current_date - 2 then
    raise exception 'reversed payment must not become last completed payment date';
  end if;
end;
$$;

-- Charge balances are computed server-side and administrative closed states have
-- no remaining balance.
do $$
declare
  charge_count integer;
  first_paid numeric;
  first_remaining numeric;
  first_overdue boolean;
  discounted_net numeric;
  waived_remaining numeric;
begin
  select count(*) into charge_count
  from public.list_my_guardian_student_charges(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    30
  );

  select paid_amount, remaining_amount, is_overdue
  into first_paid, first_remaining, first_overdue
  from public.list_my_guardian_student_charges(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    30
  )
  where charge_id = '82000000-0000-4000-8000-000000000001';

  select net_amount
  into discounted_net
  from public.list_my_guardian_student_charges(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    30
  )
  where charge_id = '82000000-0000-4000-8000-000000000002';

  select remaining_amount
  into waived_remaining
  from public.list_my_guardian_student_charges(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    30
  )
  where charge_id = '82000000-0000-4000-8000-000000000003';

  if charge_count <> 5 then
    raise exception 'expected 5 school A charges, got %', charge_count;
  end if;
  if row(first_paid, first_remaining, first_overdue)
    is distinct from row(400::numeric, 600::numeric, true)
  then
    raise exception 'unexpected first charge balance';
  end if;
  if discounted_net is distinct from 500::numeric then
    raise exception 'discounted charge net amount must be 500';
  end if;
  if waived_remaining is distinct from 0::numeric then
    raise exception 'waived charge must have zero parent-facing remaining balance';
  end if;
end;
$$;

-- Payment history contains the student's own accounting events, including a
-- reversed event, while totals above count only completed payments.
do $$
declare
  payment_count integer;
  reversed_count integer;
begin
  select count(*), count(*) filter (where payment_status = 'reversed')
  into payment_count, reversed_count
  from public.list_my_guardian_student_payments(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    30
  );

  if payment_count <> 3 or reversed_count <> 1 then
    raise exception 'unexpected guardian payment history: %, reversed %', payment_count, reversed_count;
  end if;
end;
$$;

-- The same global guardian may read a second linked child in another school,
-- but values stay isolated to that exact school/student pair.
do $$
declare
  charged_value numeric;
  paid_value numeric;
  remaining_value numeric;
  overdue_value numeric;
begin
  select total_charged, total_paid, remaining_amount, overdue_amount
  into charged_value, paid_value, remaining_value, overdue_value
  from public.get_my_guardian_student_finance_summary(
    '10000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000005'
  );

  if row(charged_value, paid_value, remaining_value, overdue_value)
    is distinct from row(700::numeric, 200::numeric, 500::numeric, 0::numeric)
  then
    raise exception 'unexpected guardian school B finance summary';
  end if;

  begin
    perform *
    from public.get_my_guardian_student_finance_summary(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000005'
    );
    raise exception 'cross-school student id unexpectedly returned finance data';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- A pending guardian relation never authorizes finance reads.
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);

do $$
begin
  begin
    perform *
    from public.get_my_guardian_student_finance_summary(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002'
    );
    raise exception 'pending guardian unexpectedly received finance data';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Staff finance permissions do not authorize parent RPCs without a guardian
-- relationship. This prevents the parent API from becoming a second staff API.
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);

do $$
begin
  begin
    perform *
    from public.get_my_guardian_student_finance_summary(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003'
    );
    raise exception 'staff finance permission unexpectedly authorized parent finance RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);

-- Revoke one relation and prove finance access disappears on the very next RPC.
update public.student_guardians
set status = 'revoked',
    is_primary = false,
    revoked_by = '60000000-0000-4000-8000-000000000001',
    revoked_at = now(),
    revocation_reason = 'parent_finance_test_revoke'
where id = '74000000-0000-4000-8000-000000000001';

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);

do $$
begin
  begin
    perform *
    from public.get_my_guardian_student_finance_summary(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001'
    );
    raise exception 'revoked guardian unexpectedly retained finance access';
  exception
    when insufficient_privilege then null;
  end;

  if (
    select remaining_amount
    from public.get_my_guardian_student_finance_summary(
      '10000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000005'
    )
  ) is distinct from 500::numeric then
    raise exception 'revoking school A relation must not revoke school B relation';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

select 'guardian parent finance migration acceptance passed' as result;
