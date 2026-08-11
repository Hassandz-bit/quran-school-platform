\set ON_ERROR_STOP on

-- Calendar period semantics are deterministic and independent of session role.
reset role;
do $$
declare
  s date;
  e date;
begin
  select period_start, period_end into s, e
  from public.finance_recurring_period('monthly', '2026-08-19');
  if s <> '2026-08-01' or e <> '2026-08-31' then
    raise exception 'monthly period mismatch: % -> %', s, e;
  end if;

  select period_start, period_end into s, e
  from public.finance_recurring_period('quarterly', '2026-08-19');
  if s <> '2026-07-01' or e <> '2026-09-30' then
    raise exception 'quarterly period mismatch: % -> %', s, e;
  end if;

  select period_start, period_end into s, e
  from public.finance_recurring_period('yearly', '2026-08-19');
  if s <> '2026-01-01' or e <> '2026-12-31' then
    raise exception 'yearly period mismatch: % -> %', s, e;
  end if;
end;
$$;

-- Finance A is scoped only to Branch A1.
set role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000005', false);

select public.preview_recurring_fee_plan_generation(
  '10000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-19'
) as preview_json \gset

do $$
declare
  p jsonb := current_setting('test.preview_json', true)::jsonb;
begin
  -- psql variable is copied below before this block; fail if it was not set.
  if p is null then raise exception 'preview json missing'; end if;
end;
$$;
