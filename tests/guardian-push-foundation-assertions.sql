\set ON_ERROR_STOP on

-- Schema and ACL invariants.
do $$
begin
  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.guardian_push_subscriptions'::regclass
  ) then
    raise exception 'guardian_push_subscriptions RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.guardian_push_subscriptions', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.guardian_push_subscriptions', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'browser roles unexpectedly have direct guardian push table access';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guardian_push_subscriptions'::regclass
      and conname = 'guardian_push_subscriptions_endpoint_unique'
      and contype = 'u'
  ) then
    raise exception 'push endpoint unique constraint is missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.register_my_guardian_push_subscription(text,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.delete_my_guardian_push_subscription(text)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly executes guardian push RPCs';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.register_my_guardian_push_subscription(text,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.delete_my_guardian_push_subscription(text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated is missing guardian push RPC execution';
  end if;
end;
$$;

-- Prepare two active guardians using existing guardian-foundation fixture data.
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
    '70000000-0000-4000-8000-000000000001',
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
    '70000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000007',
    'mother',
    true,
    'active',
    '60000000-0000-4000-8000-000000000001',
    now()
  );

-- Guardian One registers a browser endpoint.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
select public.register_my_guardian_push_subscription(
  'https://push.example.test/subscription/device-one',
  repeat('A', 64),
  repeat('B', 24),
  'Guardian Test Browser'
);
reset role;

DO $$
begin
  if not exists (
    select 1
    from public.guardian_push_subscriptions
    where endpoint = 'https://push.example.test/subscription/device-one'
      and guardian_profile_id = '60000000-0000-4000-8000-000000000006'
      and p256dh = repeat('A', 64)
      and auth_key = repeat('B', 24)
  ) then
    raise exception 'guardian one subscription was not registered';
  end if;
end;
$$;

-- Guardian Two registering the same browser atomically transfers ownership.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);
select public.register_my_guardian_push_subscription(
  'https://push.example.test/subscription/device-one',
  repeat('C', 64),
  repeat('D', 24),
  'Shared Guardian Test Browser'
);
reset role;

DO $$
begin
  if (
    select count(*)
    from public.guardian_push_subscriptions
    where endpoint = 'https://push.example.test/subscription/device-one'
  ) <> 1 then
    raise exception 'shared endpoint produced duplicate subscriptions';
  end if;

  if not exists (
    select 1
    from public.guardian_push_subscriptions
    where endpoint = 'https://push.example.test/subscription/device-one'
      and guardian_profile_id = '60000000-0000-4000-8000-000000000007'
      and p256dh = repeat('C', 64)
      and auth_key = repeat('D', 24)
  ) then
    raise exception 'shared endpoint ownership was not transferred';
  end if;
end;
$$;

-- A staff-only account must not be able to register as a guardian push target.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000003',
  false
);
do $$
begin
  begin
    perform public.register_my_guardian_push_subscription(
      'https://push.example.test/subscription/teacher',
      repeat('E', 64),
      repeat('F', 24),
      'Teacher Browser'
    );
    raise exception 'teacher unexpectedly registered a guardian push subscription';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;
reset role;

-- Guardian Two may remove only the endpoint currently owned by Guardian Two.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);
select public.delete_my_guardian_push_subscription(
  'https://push.example.test/subscription/device-one'
);
reset role;

DO $$
begin
  if exists (
    select 1
    from public.guardian_push_subscriptions
    where endpoint = 'https://push.example.test/subscription/device-one'
  ) then
    raise exception 'guardian push subscription was not deleted';
  end if;
end;
$$;
