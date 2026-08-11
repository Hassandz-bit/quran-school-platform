\set ON_ERROR_STOP on

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

-- Create two School A / branch A1 leads. The lower-priority lead enters first;
-- ranking must still put the high-priority lead first.
select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'سارة', 'انتظار', '2017-01-12', 'female',
  'ولي سارة', '+213555000201', null,
  'walk_in', now() + interval '7 days', 'Waitlist low-priority lead'
) as waitlist_low_id \gset
select set_config('test.waitlist_low_id', :'waitlist_low_id', true);

select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'ياسين', 'انتظار', '2016-09-20', 'male',
  'ولي ياسين', '+213555000202', null,
  'phone', now() + interval '3 days', 'Waitlist high-priority lead'
) as waitlist_high_id \gset
select set_config('test.waitlist_high_id', :'waitlist_high_id', true);

select public.set_registration_lead_waitlist(
  current_setting('test.waitlist_low_id')::uuid,
  3,
  'capacity_full',
  'حلقة المبتدئين',
  now() + interval '7 days',
  'لا يوجد مقعد حاليًا.'
);

select public.set_registration_lead_waitlist(
  current_setting('test.waitlist_high_id')::uuid,
  1,
  'assessment_pending',
  'حلقة المتقدمين',
  now() + interval '3 days',
  'أولوية عالية بعد التقييم.'
);

do $$
declare
  waitlist_count integer;
  limited_count integer;
  high_rank bigint;
  low_rank bigint;
begin
  select count(*) into waitlist_count
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    200
  );
  if waitlist_count <> 2 then
    raise exception 'expected two waitlisted leads, saw %', waitlist_count;
  end if;

  select count(*) into limited_count
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    1
  );
  if limited_count <> 1 then
    raise exception 'waitlist target_limit was not enforced, saw % rows', limited_count;
  end if;

  select waitlist_rank into high_rank
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    200
  )
  where lead_id = current_setting('test.waitlist_high_id')::uuid;

  select waitlist_rank into low_rank
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    200
  )
  where lead_id = current_setting('test.waitlist_low_id')::uuid;

  if high_rank <> 1 or low_rank <> 2 then
    raise exception 'priority ranking is incorrect: high %, low %', high_rank, low_rank;
  end if;
end;
$$;

-- The generic pipeline RPC must not create incomplete waitlist rows.
do $$
begin
  begin
    perform public.update_registration_lead_pipeline(
      current_setting('test.waitlist_high_id')::uuid,
      'waitlisted',
      null,
      null
    );
    raise exception 'generic pipeline unexpectedly accepted waitlisted status';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform public.set_registration_lead_waitlist(
      current_setting('test.waitlist_high_id')::uuid,
      4,
      'capacity_full',
      null,
      null,
      null
    );
    raise exception 'invalid waitlist priority unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform public.set_registration_lead_waitlist(
      current_setting('test.waitlist_high_id')::uuid,
      2,
      'invented_reason',
      null,
      null,
      null
    );
    raise exception 'invalid waitlist reason unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

-- Updating a waitlisted record keeps it in the list and records a dedicated
-- waitlist_updated event without resetting the original entry timestamp.
do $$
declare
  before_time timestamptz;
  after_time timestamptz;
begin
  select waitlisted_at into before_time
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    200
  )
  where lead_id = current_setting('test.waitlist_high_id')::uuid;

  perform public.set_registration_lead_waitlist(
    current_setting('test.waitlist_high_id')::uuid,
    2,
    'class_full',
    'حلقة العصر',
    now() + interval '4 days',
    'تم تغيير الفوج المطلوب.'
  );

  select waitlisted_at into after_time
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    200
  )
  where lead_id = current_setting('test.waitlist_high_id')::uuid;

  if after_time is distinct from before_time then
    raise exception 'waitlist metadata update reset waitlisted_at';
  end if;
end;
$$;

-- Registrar A remains branch-scoped and can manage A1 waitlist records.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
select public.set_registration_lead_waitlist(
  current_setting('test.waitlist_low_id')::uuid,
  2,
  'class_full',
  'حلقة المبتدئين',
  now() + interval '5 days',
  'تحديث من المسجل.'
);

-- Teacher receives no waitlist management access.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.set_registration_lead_waitlist(
      current_setting('test.waitlist_low_id')::uuid,
      1,
      'other',
      null,
      null,
      null
    );
    raise exception 'teacher waitlist update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- A different tenant cannot see School A's waitlist.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000008', true);
do $$
declare
  leaked_count integer;
begin
  select count(*) into leaked_count
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    200
  );
  if leaked_count <> 0 then
    raise exception 'School B admin saw School A waitlist';
  end if;
end;
$$;

reset role;

-- Database shape itself rejects a waitlisted row without required metadata.
do $$
begin
  begin
    update public.registration_leads
    set status = 'waitlisted',
        waitlisted_at = null,
        waitlist_priority = null,
        waitlist_reason = null
    where id = current_setting('test.waitlist_low_id')::uuid;
    raise exception 'invalid waitlist shape unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$$;

-- Audit evidence covers initial entry and later waitlist-specific edits.
do $$
declare
  high_pipeline_entries integer;
  high_waitlist_updates integer;
  low_waitlist_updates integer;
begin
  select count(*) into high_pipeline_entries
  from public.registration_lead_events
  where lead_id = current_setting('test.waitlist_high_id')::uuid
    and event_type = 'pipeline_updated'
    and new_status = 'waitlisted';
  if high_pipeline_entries <> 1 then
    raise exception 'expected one high-priority waitlist entry event, saw %', high_pipeline_entries;
  end if;

  select count(*) into high_waitlist_updates
  from public.registration_lead_events
  where lead_id = current_setting('test.waitlist_high_id')::uuid
    and event_type = 'waitlist_updated';
  if high_waitlist_updates <> 1 then
    raise exception 'expected one high-priority waitlist update event, saw %', high_waitlist_updates;
  end if;

  select count(*) into low_waitlist_updates
  from public.registration_lead_events
  where lead_id = current_setting('test.waitlist_low_id')::uuid
    and event_type = 'waitlist_updated';
  if low_waitlist_updates <> 1 then
    raise exception 'expected one registrar waitlist update event, saw %', low_waitlist_updates;
  end if;
end;
$$;

rollback;
