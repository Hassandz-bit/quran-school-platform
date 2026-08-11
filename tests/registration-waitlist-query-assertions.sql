\set ON_ERROR_STOP on

-- Cover the exact unfiltered listing shape used by the CRM UI, then verify
-- that leaving and re-entering the waitlist in a later transaction receives
-- a fresh server-recorded waitlisted_at timestamp.

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'UI', 'High', '2016-01-01', 'male',
  'Guardian UI High', '+213555000211', null,
  'walk_in', null, 'Unfiltered waitlist rank coverage'
) as ui_high_id \gset

select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'UI', 'Low', '2017-01-01', 'female',
  'Guardian UI Low', '+213555000212', null,
  'phone', null, 'Unfiltered waitlist rank coverage'
) as ui_low_id \gset

-- Session-level test settings survive the transaction boundary below and are
-- readable inside PL/pgSQL DO blocks without relying on psql interpolation.
select set_config('test.ui_high_id', :'ui_high_id', false);
select set_config('test.ui_low_id', :'ui_low_id', false);

select public.set_registration_lead_waitlist(
  current_setting('test.ui_high_id')::uuid,
  1,
  'assessment_pending',
  'حلقة متقدمة',
  null,
  'High priority'
);

select public.set_registration_lead_waitlist(
  current_setting('test.ui_low_id')::uuid,
  3,
  'capacity_full',
  'حلقة مبتدئة',
  null,
  'Low priority'
);

do $$
declare
  high_filtered bigint;
  low_filtered bigint;
  high_unfiltered bigint;
  low_unfiltered bigint;
begin
  select waitlist_rank into high_filtered
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    500
  )
  where lead_id = current_setting('test.ui_high_id')::uuid;

  select waitlist_rank into low_filtered
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    500
  )
  where lead_id = current_setting('test.ui_low_id')::uuid;

  select waitlist_rank into high_unfiltered
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    null,
    500
  )
  where lead_id = current_setting('test.ui_high_id')::uuid;

  select waitlist_rank into low_unfiltered
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    null,
    500
  )
  where lead_id = current_setting('test.ui_low_id')::uuid;

  if high_filtered <> 1 or low_filtered <> 2 then
    raise exception 'filtered waitlist ranks are incorrect: high %, low %', high_filtered, low_filtered;
  end if;

  if high_unfiltered is distinct from high_filtered
     or low_unfiltered is distinct from low_filtered then
    raise exception 'unfiltered CRM listing changed waitlist ranks: filtered high % low %, unfiltered high % low %',
      high_filtered, low_filtered, high_unfiltered, low_unfiltered;
  end if;
end;
$$;

select set_config('test.first_waitlisted_at', waitlisted_at::text, false)
from public.list_registration_leads(
  '10000000-0000-4000-8000-000000000001',
  'waitlisted',
  500
)
where lead_id = current_setting('test.ui_high_id')::uuid;

commit;

-- Separate transactions mirror separate browser RPC calls and make now()
-- advance between the original entry and the later re-entry.
select pg_sleep(0.02);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

select public.update_registration_lead_pipeline(
  current_setting('test.ui_high_id')::uuid,
  'contacted',
  null,
  'Temporarily left the waitlist'
);

-- Historical waitlist metadata remains present while the lead is outside the list.
do $$
declare
  historical_time timestamptz;
  outside_rank bigint;
begin
  select waitlisted_at, waitlist_rank
  into historical_time, outside_rank
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    null,
    500
  )
  where lead_id = current_setting('test.ui_high_id')::uuid;

  if historical_time is distinct from current_setting('test.first_waitlisted_at')::timestamptz then
    raise exception 'leaving the waitlist erased historical waitlisted_at';
  end if;
  if outside_rank is not null then
    raise exception 'non-waitlisted lead unexpectedly retained a live waitlist rank';
  end if;
end;
$$;

select public.set_registration_lead_waitlist(
  current_setting('test.ui_high_id')::uuid,
  2,
  'class_full',
  'حلقة مسائية',
  null,
  'Re-entered waitlist'
);

do $$
declare
  second_waitlisted_at timestamptz;
begin
  select waitlisted_at into second_waitlisted_at
  from public.list_registration_leads(
    '10000000-0000-4000-8000-000000000001',
    'waitlisted',
    500
  )
  where lead_id = current_setting('test.ui_high_id')::uuid;

  if second_waitlisted_at is null
     or second_waitlisted_at <= current_setting('test.first_waitlisted_at')::timestamptz then
    raise exception 'waitlist re-entry did not receive a fresh timestamp: first %, second %',
      current_setting('test.first_waitlisted_at')::timestamptz, second_waitlisted_at;
  end if;
end;
$$;

rollback;
