\set ON_ERROR_STOP on

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'ليان', 'اختبار', null, 'female',
  'ولي ليان', '+213555000010', null,
  'phone', now() + interval '1 day', 'Lead for branch lifecycle hardening'
) as hardening_lead_id \gset
select set_config('test.hardening_lead_id', :'hardening_lead_id', true);

reset role;
update public.branches
set status = 'inactive'
where school_id = '10000000-0000-4000-8000-000000000001'
  and id = '20000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

do $$
begin
  begin
    perform public.update_registration_lead_pipeline(
      current_setting('test.hardening_lead_id')::uuid,
      'contacted',
      now() + interval '2 days',
      'This update must not be accepted while the branch is inactive.'
    );
    raise exception 'inactive-branch CRM update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.update_registration_lead_student_details(
      current_setting('test.hardening_lead_id')::uuid,
      '2017-01-01',
      'primary',
      'لا ينبغي حفظ هذا التعديل'
    );
    raise exception 'inactive-branch student detail update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.update_registration_lead_pipeline(
      current_setting('test.hardening_lead_id')::uuid,
      null,
      null,
      null
    );
    raise exception 'null CRM status unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

do $$
declare
  stored_status text;
  event_count integer;
begin
  select status into stored_status
  from public.registration_leads
  where id = current_setting('test.hardening_lead_id')::uuid;

  if stored_status <> 'new' then
    raise exception 'inactive-branch update changed lead status to %', stored_status;
  end if;

  select count(*) into event_count
  from public.registration_lead_events
  where lead_id = current_setting('test.hardening_lead_id')::uuid;

  if event_count <> 1 then
    raise exception 'inactive-branch update should not create an audit event, saw %', event_count;
  end if;
end;
$$;

rollback;
