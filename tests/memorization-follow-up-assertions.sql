\set ON_ERROR_STOP on

create or replace function public.test_assert(condition boolean, message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if condition is not true then
    raise exception '%', message;
  end if;
end;
$$;

-- RPC ACLs are authenticated-only and raw tables stay browser-private.
do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.create_memorization_follow_up_note(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,integer,integer,integer,text,date)',
    'public.set_memorization_follow_up_note_status(uuid,uuid,uuid,uuid,text)',
    'public.list_memorization_focus_notes(uuid,uuid,uuid,uuid,integer)',
    'public.list_memorization_follow_up_history(uuid,uuid,uuid,uuid,integer)'
  ] loop
    if not has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'authenticated missing EXECUTE on %', function_signature;
    end if;
    if has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'anon unexpectedly has EXECUTE on %', function_signature;
    end if;
    if exists (
      select 1
      from pg_proc as procedure
      cross join lateral aclexplode(
        coalesce(procedure.proacl, acldefault('f', procedure.proowner))
      ) as privilege
      where procedure.oid = function_signature::regprocedure
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC unexpectedly has EXECUTE on %', function_signature;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.memorization_follow_up_notes', 'SELECT')
    or has_table_privilege('authenticated', 'public.memorization_follow_up_notes', 'INSERT')
    or has_table_privilege('authenticated', 'public.memorization_follow_up_notes', 'UPDATE')
    or has_table_privilege('authenticated', 'public.memorization_follow_up_note_history', 'SELECT')
  then
    raise exception 'authenticated unexpectedly has direct follow-up table privileges';
  end if;
end;
$$;

-- Assigned teacher can create only as self. Create the same signature twice to prove recurrence.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);

select public.create_memorization_follow_up_note(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'hesitation',
  1,
  2,
  10,
  12,
  'يتردد في بداية هذا الموضع',
  current_date - 1
) as note_one_id \gset

select public.create_memorization_follow_up_note(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  null,
  'hesitation',
  1,
  2,
  10,
  12,
  'تكرر التردد في الموضع نفسه',
  current_date
) as note_two_id \gset

select set_config('test.note_one_id', :'note_one_id', false);
select set_config('test.note_two_id', :'note_two_id', false);

select public.test_assert(
  (
    select count(*) = 1
      and bool_and(result.id = :'note_two_id'::uuid)
      and max(result.recurrence_count) = 2
      and bool_and(result.status = 'open')
    from public.list_memorization_focus_notes(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      20
    ) as result
  ),
  'focus list must return only the latest matching observation with recurrence_count=2'
);

select public.test_assert(
  (
    select count(*) = 2 and min(result.recurrence_count) = 2 and max(result.recurrence_count) = 2
    from public.list_memorization_follow_up_history(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      100
    ) as result
  ),
  'full history must preserve both observations and derive recurrence_count=2'
);

do $$
begin
  begin
    perform public.create_memorization_follow_up_note(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000005',
      null,
      'tajweed',
      2,
      1,
      1,
      2,
      'attempt to impersonate another assigned teacher',
      current_date
    );
    raise exception 'teacher created a note on behalf of another teacher';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'MEMORIZATION_FOLLOW_UP_TEACHER_IDENTITY_MISMATCH' then
        raise exception 'unexpected teacher identity denial: %', sqlerrm;
      end if;
  end;

  begin
    perform public.list_memorization_focus_notes(
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000002',
      20
    );
    raise exception 'teacher read another tenant';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.create_memorization_follow_up_note(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '99999999-0000-4000-8000-000000000999',
      'other',
      2,
      1,
      1,
      1,
      'invalid source record',
      current_date
    );
    raise exception 'out-of-scope source record was accepted';
  exception
    when check_violation then
      if sqlerrm <> 'MEMORIZATION_FOLLOW_UP_SOURCE_RECORD_SCOPE_INVALID' then
        raise exception 'unexpected source record denial: %', sqlerrm;
      end if;
  end;

  begin
    perform public.create_memorization_follow_up_note(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      null,
      null,
      2,
      1,
      1,
      1,
      'null category',
      current_date
    );
    raise exception 'null category was accepted';
  exception
    when invalid_parameter_value then
      if sqlerrm <> 'MEMORIZATION_FOLLOW_UP_CATEGORY_INVALID' then
        raise exception 'unexpected null category denial: %', sqlerrm;
      end if;
  end;
end;
$$;
reset role;

-- Academic supervisor can read but cannot create or update status.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', false);
select public.test_assert(
  (
    select count(*) = 1 and max(result.recurrence_count) = 2
    from public.list_memorization_focus_notes(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      20
    ) as result
  ),
  'academic supervisor should see focus notes in permitted branch'
);

do $$
begin
  begin
    perform public.create_memorization_follow_up_note(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      null,
      'tajweed',
      2,
      1,
      1,
      1,
      'supervisor should not write',
      current_date
    );
    raise exception 'academic supervisor created a follow-up note';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'MEMORIZATION_FOLLOW_UP_MANAGE_REQUIRED' then
        raise exception 'unexpected supervisor create denial: %', sqlerrm;
      end if;
  end;

  begin
    perform public.set_memorization_follow_up_note_status(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      current_setting('test.note_two_id')::uuid,
      'resolved'
    );
    raise exception 'academic supervisor changed follow-up status';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'MEMORIZATION_FOLLOW_UP_MANAGE_REQUIRED' then
        raise exception 'unexpected supervisor status denial: %', sqlerrm;
      end if;
  end;
end;
$$;
reset role;

-- Account without memorization permission cannot read.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', false);
do $$
begin
  begin
    perform public.list_memorization_follow_up_history(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      100
    );
    raise exception 'account without memorization permission read history';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Another assigned teacher may collaboratively update status for the student in the current class.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000005', false);
select public.test_assert(
  public.set_memorization_follow_up_note_status(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    :'note_two_id'::uuid,
    'improved'
  ),
  'assigned teacher should be able to record improvement'
);
select public.test_assert(
  (
    select count(*) = 1 and bool_and(result.status = 'improved')
    from public.list_memorization_focus_notes(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      20
    ) as result
  ),
  'improved latest observation should remain in focus list'
);
reset role;

select public.test_assert(
  (
    select count(*) = 2
    from public.memorization_follow_up_note_history
    where follow_up_note_id = :'note_two_id'::uuid
  ),
  'insert plus improvement should produce exactly two audit entries'
);

-- Repeating the same status is a no-op and must not add audit noise.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000005', false);
select public.test_assert(
  public.set_memorization_follow_up_note_status(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    :'note_two_id'::uuid,
    'improved'
  ),
  'same-status update should be treated as successful no-op'
);
reset role;
select public.test_assert(
  (
    select count(*) = 2
    from public.memorization_follow_up_note_history
    where follow_up_note_id = :'note_two_id'::uuid
  ),
  'same-status no-op must not create a third audit entry'
);

-- Resolution removes the latest signature from focus but keeps all history.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000005', false);
select public.test_assert(
  public.set_memorization_follow_up_note_status(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    :'note_two_id'::uuid,
    'resolved'
  ),
  'assigned teacher should be able to resolve the focus note'
);
select public.test_assert(
  (
    select count(*) = 0
    from public.list_memorization_focus_notes(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      20
    ) as result
  ),
  'resolved latest signature should disappear from focus list even though older occurrence exists'
);
select public.test_assert(
  (
    select count(*) = 2 and max(result.recurrence_count) = 2
    from public.list_memorization_follow_up_history(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      100
    ) as result
  ),
  'resolved signature must remain in full history'
);
reset role;

-- A later recurrence creates a fresh observation and re-opens focus with count 3.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);
select public.create_memorization_follow_up_note(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  null,
  'hesitation',
  1,
  2,
  10,
  12,
  'عاد التردد في نفس الموضع بعد أن كان قد عولج',
  current_date + 1
) as note_three_id \gset
select public.test_assert(
  (
    select count(*) = 1
      and bool_and(result.id = :'note_three_id'::uuid)
      and max(result.recurrence_count) = 3
      and bool_and(result.status = 'open')
    from public.list_memorization_focus_notes(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      20
    ) as result
  ),
  'new recurrence should reappear as focus with recurrence_count=3'
);
reset role;

-- Non-teacher manager may attribute an observation to any active teacher assigned to the class.
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);
select public.create_memorization_follow_up_note(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',
  null,
  'tajweed',
  2,
  1,
  1,
  2,
  'ملاحظة أضافها المدير باسم المعلم المعيّن',
  current_date
) as manager_note_id \gset
select public.test_assert(:'manager_note_id'::uuid is not null, 'manager note should be created');
reset role;

-- Original observation content is immutable even to a table owner path; only status transitions are allowed.
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', false);
do $$
begin
  begin
    update public.memorization_follow_up_notes
    set note_text = 'attempted rewrite'
    where id = current_setting('test.note_one_id')::uuid;
    raise exception 'follow-up note content was mutable';
  exception
    when check_violation then
      if sqlerrm <> 'MEMORIZATION_FOLLOW_UP_CONTENT_IMMUTABLE' then
        raise exception 'unexpected immutable-content denial: %', sqlerrm;
      end if;
  end;
end;
$$;
select set_config('request.jwt.claim.sub', '', false);

-- Audit records preserve server-controlled actors and resolution metadata.
select public.test_assert(
  (
    select count(*) = 3
      and bool_and(changed_by is not null)
    from public.memorization_follow_up_note_history
    where follow_up_note_id = :'note_two_id'::uuid
  ),
  'insert, improvement, and resolution must remain in append-only audit history'
);
select public.test_assert(
  (
    select status = 'resolved'
      and resolved_by = '30000000-0000-4000-8000-000000000005'::uuid
      and resolved_at is not null
    from public.memorization_follow_up_notes
    where id = :'note_two_id'::uuid
  ),
  'resolution actor and timestamp must be server-controlled'
);

drop function public.test_assert(boolean, text);
