\set ON_ERROR_STOP on

-- Schema, tenant-safe identity, RLS, ACLs, and absence of parent data policies.
do $$
declare
  actual_columns text[];
begin
  select array_agg(column_name order by ordinal_position)
  into actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'guardian_invitations';

  if actual_columns is distinct from array[
    'id',
    'school_id',
    'student_id',
    'student_guardian_id',
    'guardian_profile_id',
    'invited_by',
    'target_email',
    'status',
    'requires_password_setup',
    'expires_at',
    'sent_at',
    'accepted_at',
    'failed_at',
    'revoked_at',
    'failure_code',
    'idempotency_key_hash',
    'request_payload_hash',
    'created_at',
    'updated_at'
  ]::text[] then
    raise exception 'unexpected guardian_invitations columns: %', actual_columns;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guardian_invitations'::regclass
      and conname = 'guardian_invitations_relationship_scope_fk'
      and contype = 'f'
  ) then
    raise exception 'tenant-safe guardian relationship FK is missing';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.guardian_invitations'::regclass
  ) then
    raise exception 'guardian_invitations RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.guardian_invitations', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.guardian_invitations', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'browser role unexpectedly accesses guardian invitations';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'students',
        'attendance_sessions',
        'attendance_records',
        'attendance_record_history',
        'memorization_records',
        'memorization_record_history',
        'student_charges',
        'payments',
        'expenses'
      )
      and policyname ilike '%guardian%'
  ) then
    raise exception 'Migration 018 added a parent policy to protected data';
  end if;

  begin
    insert into public.guardian_invitations (
      school_id,
      student_id,
      student_guardian_id,
      guardian_profile_id,
      invited_by,
      target_email,
      requires_password_setup,
      idempotency_key_hash,
      request_payload_hash
    ) values (
      '10000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000005',
      gen_random_uuid(),
      '60000000-0000-4000-8000-000000000006',
      '60000000-0000-4000-8000-000000000001',
      'guardian-one@example.test',
      false,
      repeat('0', 64),
      repeat('1', 64)
    );
    raise exception 'mismatched tenant relationship bypassed the FK';
  exception when foreign_key_violation then null;
  end;
end;
$$;

-- SECURITY DEFINER hardening and explicit execution grants.
do $$
declare
  function_signature text;
  function_oid regprocedure;
begin
  foreach function_signature in array array[
    'public.get_guardian_invitation_retry(uuid,uuid,text,text)',
    'public.prepare_guardian_invitation(uuid,uuid,uuid,uuid,text,text,text,boolean)',
    'public.claim_guardian_invitation_delivery(uuid)',
    'public.fail_guardian_invitation_delivery(uuid,text)',
    'public.get_my_guardian_invitation(uuid)',
    'public.activate_guardian_invitation(uuid)',
    'public.revoke_live_guardian_invitations()'
  ]
  loop
    function_oid := function_signature::regprocedure;
    if not (
      select procedure.prosecdef
      from pg_proc as procedure
      where procedure.oid = function_oid
    ) then
      raise exception '% is not SECURITY DEFINER', function_signature;
    end if;

    if not (
      select coalesce(
        array_to_string(procedure.proconfig, ',') like '%search_path=%',
        false
      )
      from pg_proc as procedure
      where procedure.oid = function_oid
    ) then
      raise exception '% does not pin search_path', function_signature;
    end if;

    if has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'anon unexpectedly executes %', function_signature;
    end if;

    if exists (
      select 1
      from pg_proc as procedure
      cross join lateral aclexplode(
        coalesce(procedure.proacl, acldefault('f', procedure.proowner))
      ) as privilege
      where procedure.oid = function_oid
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC unexpectedly executes %', function_signature;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.claim_guardian_invitation_delivery(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.fail_guardian_invitation_delivery(uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.revoke_live_guardian_invitations()',
    'EXECUTE'
  ) then
    raise exception 'authenticated executes an internal invitation function';
  end if;
end;
$$;

-- Unauthorized roles, cross-school staff, and out-of-branch registrar are denied
-- before any invitation row can be discovered.
set role authenticated;
do $$
declare
  denied_profile uuid;
begin
  foreach denied_profile in array array[
    '60000000-0000-4000-8000-000000000003'::uuid,
    '60000000-0000-4000-8000-000000000004'::uuid,
    '60000000-0000-4000-8000-000000000005'::uuid,
    '60000000-0000-4000-8000-000000000006'::uuid
  ]
  loop
    perform set_config('request.jwt.claim.sub', denied_profile::text, false);
    begin
      perform public.get_guardian_invitation_retry(
        '10000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000001',
        repeat('a', 64),
        repeat('b', 64)
      );
      raise exception 'unauthorized profile % inspected invitation retry', denied_profile;
    exception when insufficient_privilege then null;
    end;
  end loop;

  perform set_config(
    'request.jwt.claim.sub',
    '60000000-0000-4000-8000-000000000002',
    false
  );
  begin
    perform public.get_guardian_invitation_retry(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      repeat('a', 64),
      repeat('b', 64)
    );
    raise exception 'registrar escaped branch scope';
  exception when insufficient_privilege then null;
  end;

  perform set_config(
    'request.jwt.claim.sub',
    '60000000-0000-4000-8000-000000000001',
    false
  );
  begin
    perform public.get_guardian_invitation_retry(
      '10000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000005',
      repeat('a', 64),
      repeat('b', 64)
    );
    raise exception 'School A admin inspected School B invitation state';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Prepare pending relationships for multiple children and multiple schools.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
select set_config(
  'test.rel_a1',
  public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000006',
    'father',
    true
  )::text,
  false
);
select set_config(
  'test.rel_a2',
  public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000006',
    'father',
    false
  )::text,
  false
);
select set_config(
  'test.rel_expired',
  public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000003',
    '60000000-0000-4000-8000-000000000007',
    'mother',
    false
  )::text,
  false
);
select set_config(
  'test.rel_revoked',
  public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000007',
    'mother',
    false
  )::text,
  false
);
select set_config(
  'test.rel_terminal',
  public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000010',
    'legal_guardian',
    false
  )::text,
  false
);
select set_config(
  'test.rel_inactive_profile',
  public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000010',
    'legal_guardian',
    false
  )::text,
  false
);
reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000008',
  false
);
select set_config(
  'test.rel_b1',
  public.prepare_student_guardian_link(
    '10000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000005',
    '60000000-0000-4000-8000-000000000006',
    'father',
    false
  )::text,
  false
);
reset role;

-- School admin prepares the first invitation; exact retries are idempotent,
-- key reuse with another payload is rejected, and live duplicates are blocked.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
do $$
declare
  first_id uuid;
  retry_id uuid;
begin
  select invitation_id into strict first_id
  from public.prepare_guardian_invitation(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.rel_a1')::uuid,
    '60000000-0000-4000-8000-000000000006',
    'guardian-one@example.test',
    repeat('a', 64),
    repeat('b', 64),
    false
  );

  select invitation_id into strict retry_id
  from public.prepare_guardian_invitation(
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.rel_a1')::uuid,
    '60000000-0000-4000-8000-000000000006',
    'guardian-one@example.test',
    repeat('a', 64),
    repeat('b', 64),
    false
  );

  if first_id is distinct from retry_id then
    raise exception 'exact idempotency retry created another invitation';
  end if;
  perform set_config('test.invite_a1', first_id::text, false);

  begin
    perform public.get_guardian_invitation_retry(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      repeat('c', 64)
    );
    raise exception 'same key with a different payload was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.prepare_guardian_invitation(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      current_setting('test.rel_a1')::uuid,
      '60000000-0000-4000-8000-000000000006',
      'guardian-one@example.test',
      repeat('d', 64),
      repeat('e', 64),
      false
    );
    raise exception 'a second live invitation was created';
  exception when unique_violation then null;
  end;
end;
$$;
reset role;

-- Claiming delivery does not activate the relationship and cannot be claimed twice.
set role service_role;
do $$
declare
  first_claim boolean;
  second_claim boolean;
begin
  select delivery_claimed into strict first_claim
  from public.claim_guardian_invitation_delivery(
    current_setting('test.invite_a1')::uuid
  );
  select delivery_claimed into strict second_claim
  from public.claim_guardian_invitation_delivery(
    current_setting('test.invite_a1')::uuid
  );
  if not first_claim or second_claim then
    raise exception 'delivery claim was not exactly-once';
  end if;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1
    from public.student_guardians
    where id = current_setting('test.rel_a1')::uuid
      and status = 'pending'
      and activated_at is null
  ) then
    raise exception 'sending an invitation activated the relationship';
  end if;
end;
$$;

-- Wrong user is denied; correct recipient activates atomically; accepted retry
-- succeeds without a duplicate relationship_activated event.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);
do $$
begin
  begin
    perform public.activate_guardian_invitation(
      current_setting('test.invite_a1')::uuid
    );
    raise exception 'wrong guardian activated an invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
do $$
begin
  if not public.activate_guardian_invitation(
    current_setting('test.invite_a1')::uuid
  ) then
    raise exception 'correct guardian activation returned false';
  end if;
  if not public.activate_guardian_invitation(
    current_setting('test.invite_a1')::uuid
  ) then
    raise exception 'accepted retry returned false';
  end if;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1
    from public.student_guardians
    where id = current_setting('test.rel_a1')::uuid
      and status = 'active'
      and activated_at is not null
  ) or not exists (
    select 1
    from public.guardian_invitations
    where id = current_setting('test.invite_a1')::uuid
      and status = 'accepted'
      and accepted_at is not null
  ) then
    raise exception 'activation state is incomplete';
  end if;

  if (
    select count(*)
    from public.guardian_access_events
    where student_guardian_id = current_setting('test.rel_a1')::uuid
      and event_type = 'relationship_activated'
  ) <> 1 then
    raise exception 'activation audit is missing or duplicated';
  end if;
end;
$$;

-- Atomic rollback: force the final audit insert to fail, then prove both state
-- changes rolled back before retrying successfully.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
select set_config(
  'test.invite_a2',
  (
    select invitation_id::text
    from public.prepare_guardian_invitation(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      current_setting('test.rel_a2')::uuid,
      '60000000-0000-4000-8000-000000000006',
      'guardian-one@example.test',
      repeat('f', 64),
      repeat('1', 64),
      false
    )
  ),
  false
);
reset role;
set role service_role;
select * from public.claim_guardian_invitation_delivery(
  current_setting('test.invite_a2')::uuid
);
reset role;

insert into public.guardian_access_events (
  school_id,
  student_id,
  student_guardian_id,
  guardian_profile_id,
  event_type,
  actor_profile_id,
  reason_code
) values (
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  current_setting('test.rel_a2')::uuid,
  '60000000-0000-4000-8000-000000000006',
  'relationship_activated',
  '60000000-0000-4000-8000-000000000006',
  'forced_test_conflict'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
do $$
begin
  begin
    perform public.activate_guardian_invitation(
      current_setting('test.invite_a2')::uuid
    );
    raise exception 'activation unexpectedly ignored duplicate audit';
  exception when unique_violation then null;
  end;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.student_guardians
    where id = current_setting('test.rel_a2')::uuid and status = 'pending'
  ) or not exists (
    select 1 from public.guardian_invitations
    where id = current_setting('test.invite_a2')::uuid and status = 'sent'
  ) then
    raise exception 'failed activation did not roll back atomically';
  end if;
end;
$$;

delete from public.guardian_access_events
where student_guardian_id = current_setting('test.rel_a2')::uuid
  and event_type = 'relationship_activated';

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
select public.activate_guardian_invitation(
  current_setting('test.invite_a2')::uuid
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.student_guardians
    where id = current_setting('test.rel_a2')::uuid and status = 'active'
  ) or (
    select count(*) from public.guardian_access_events
    where student_guardian_id = current_setting('test.rel_a2')::uuid
      and event_type = 'relationship_activated'
  ) <> 1 then
    raise exception 'atomic activation retry did not complete exactly once';
  end if;
end;
$$;

-- Registrar in branch may prepare an invitation, then revocation invalidates it.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  false
);
select set_config(
  'test.invite_revoked',
  (
    select invitation_id::text
    from public.prepare_guardian_invitation(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      current_setting('test.rel_revoked')::uuid,
      '60000000-0000-4000-8000-000000000007',
      'guardian-two@example.test',
      repeat('2', 64),
      repeat('3', 64),
      false
    )
  ),
  false
);
reset role;
set role service_role;
select * from public.claim_guardian_invitation_delivery(
  current_setting('test.invite_revoked')::uuid
);
reset role;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  false
);
select public.revoke_student_guardian_link(
  '10000000-0000-4000-8000-000000000001',
  current_setting('test.rel_revoked')::uuid,
  'manual_review'
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.guardian_invitations
    where id = current_setting('test.invite_revoked')::uuid
      and status = 'revoked'
      and revoked_at is not null
  ) then
    raise exception 'relationship revoke did not invalidate live invitation';
  end if;
end;
$$;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);
do $$
begin
  begin
    perform public.activate_guardian_invitation(
      current_setting('test.invite_revoked')::uuid
    );
    raise exception 'revoked relationship was reactivated';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

-- Expired invitation remains pending and cannot activate.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
select set_config(
  'test.invite_expired',
  (
    select invitation_id::text
    from public.prepare_guardian_invitation(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      current_setting('test.rel_expired')::uuid,
      '60000000-0000-4000-8000-000000000007',
      'guardian-two@example.test',
      repeat('4', 64),
      repeat('5', 64),
      false
    )
  ),
  false
);
reset role;
set role service_role;
select * from public.claim_guardian_invitation_delivery(
  current_setting('test.invite_expired')::uuid
);
reset role;

alter table public.guardian_invitations
  disable trigger guardian_invitations_validate_write;
update public.guardian_invitations
set created_at = now() - interval '8 days',
    expires_at = now() - interval '1 day'
where id = current_setting('test.invite_expired')::uuid;
alter table public.guardian_invitations
  enable trigger guardian_invitations_validate_write;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000007',
  false
);
do $$
begin
  begin
    perform public.activate_guardian_invitation(
      current_setting('test.invite_expired')::uuid
    );
    raise exception 'expired invitation activated';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

-- Terminal student status invalidates the linked live invitation.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
select set_config(
  'test.invite_terminal',
  (
    select invitation_id::text
    from public.prepare_guardian_invitation(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000004',
      current_setting('test.rel_terminal')::uuid,
      '60000000-0000-4000-8000-000000000010',
      'guardian-three@example.test',
      repeat('6', 64),
      repeat('7', 64),
      false
    )
  ),
  false
);
reset role;
set role service_role;
select * from public.claim_guardian_invitation_delivery(
  current_setting('test.invite_terminal')::uuid
);
reset role;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
update public.students
set status = 'withdrawn'
where school_id = '10000000-0000-4000-8000-000000000001'
  and id = '50000000-0000-4000-8000-000000000004';
reset role;

do $$
begin
  if not exists (
    select 1 from public.guardian_invitations
    where id = current_setting('test.invite_terminal')::uuid
      and status = 'revoked'
  ) then
    raise exception 'terminal student did not revoke invitation';
  end if;
end;
$$;

-- Same guardian may be linked in another school, while an inactive school
-- still blocks activation and reveals nothing to School A.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000008',
  false
);
select set_config(
  'test.invite_b1',
  (
    select invitation_id::text
    from public.prepare_guardian_invitation(
      '10000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000005',
      current_setting('test.rel_b1')::uuid,
      '60000000-0000-4000-8000-000000000006',
      'guardian-one@example.test',
      repeat('8', 64),
      repeat('9', 64),
      false
    )
  ),
  false
);
reset role;
set role service_role;
select * from public.claim_guardian_invitation_delivery(
  current_setting('test.invite_b1')::uuid
);
reset role;

update public.schools
set status = 'inactive'
where id = '10000000-0000-4000-8000-000000000002';
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
do $$
begin
  begin
    perform public.activate_guardian_invitation(
      current_setting('test.invite_b1')::uuid
    );
    raise exception 'inactive school invitation activated';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
update public.schools
set status = 'active'
where id = '10000000-0000-4000-8000-000000000002';

-- Inactive guardian profile blocks activation.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  false
);
select set_config(
  'test.invite_inactive_profile',
  (
    select invitation_id::text
    from public.prepare_guardian_invitation(
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      current_setting('test.rel_inactive_profile')::uuid,
      '60000000-0000-4000-8000-000000000010',
      'guardian-three@example.test',
      repeat('a1', 32),
      repeat('b1', 32),
      false
    )
  ),
  false
);
reset role;
set role service_role;
select * from public.claim_guardian_invitation_delivery(
  current_setting('test.invite_inactive_profile')::uuid
);
reset role;
update public.profiles
set status = 'disabled'
where id = '60000000-0000-4000-8000-000000000010';
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000010',
  false
);
do $$
begin
  begin
    perform public.activate_guardian_invitation(
      current_setting('test.invite_inactive_profile')::uuid
    );
    raise exception 'inactive guardian profile activated';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
update public.profiles
set status = 'active'
where id = '60000000-0000-4000-8000-000000000010';

-- Guardians receive no membership, membership role, permissions, or broad data access.
do $$
begin
  if exists (
    select 1
    from public.school_memberships
    where profile_id in (
      '60000000-0000-4000-8000-000000000006',
      '60000000-0000-4000-8000-000000000007',
      '60000000-0000-4000-8000-000000000010'
    )
  ) then
    raise exception 'guardian received a school membership';
  end if;

  if exists (
    select 1
    from public.membership_roles as membership_role
    join public.school_memberships as membership
      on membership.id = membership_role.membership_id
     and membership.school_id = membership_role.school_id
    where membership.profile_id in (
      '60000000-0000-4000-8000-000000000006',
      '60000000-0000-4000-8000-000000000007',
      '60000000-0000-4000-8000-000000000010'
    )
  ) then
    raise exception 'guardian received a membership role';
  end if;
end;
$$;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  false
);
do $$
declare
  student_count integer;
begin
  select count(*) into student_count from public.students;
  if student_count <> 0 then
    raise exception 'guardian received direct students access';
  end if;

  begin
    perform 1 from public.guardian_invitations;
    raise exception 'guardian directly selected invitation PII';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.guardian_invitations (
      school_id,
      student_id,
      student_guardian_id,
      guardian_profile_id,
      invited_by,
      target_email,
      requires_password_setup,
      idempotency_key_hash,
      request_payload_hash
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      current_setting('test.rel_a1')::uuid,
      '60000000-0000-4000-8000-000000000006',
      '60000000-0000-4000-8000-000000000001',
      'guardian-one@example.test',
      false,
      repeat('c', 64),
      repeat('d', 64)
    );
    raise exception 'authenticated browser inserted an invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.guardian_invitations;
    raise exception 'anon selected guardian invitations';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.activate_guardian_invitation(
      current_setting('test.invite_a1')::uuid
    );
    raise exception 'anon executed guardian activation';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select 'guardian invitation migration acceptance passed' as result;
