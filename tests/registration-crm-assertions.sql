\set ON_ERROR_STOP on

begin;

-- School admin A can create leads in both of School A's active branches.
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);

select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'أحمد', 'بن سالم', '2017-03-04', 'male',
  'محمد بن سالم', '+213555000001', 'guardian-a@example.test',
  'walk_in', now() + interval '2 days', 'طلب زيارة أولية'
) as lead_a1 \gset
select set_config('test.lead_a1', :'lead_a1', true);

select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'مريم', 'خالد', '2016-08-11', 'female',
  'خالد ولي', '+213555000002', null,
  'referral', null, null
) as lead_a2 \gset
select set_config('test.lead_a2', :'lead_a2', true);

-- Direct table access stays closed even to an authorized school admin.
do $$
begin
  begin
    perform count(*) from public.registration_leads;
    raise exception 'authenticated direct registration_leads read unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform count(*) from public.registration_lead_events;
    raise exception 'authenticated direct registration_lead_events read unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Registrar A is scoped to branch A1 and can manage that branch only.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);

do $$
declare
  access_row record;
  visible_count integer;
  branch_count integer;
begin
  select * into access_row
  from public.get_registration_crm_access('10000000-0000-4000-8000-000000000001');
  if access_row.can_view is distinct from true or access_row.can_manage is distinct from true then
    raise exception 'registrar CRM access flags are incorrect';
  end if;

  select count(*) into visible_count
  from public.list_registration_leads('10000000-0000-4000-8000-000000000001', null, 200);
  if visible_count <> 1 then
    raise exception 'registrar should see exactly one branch-scoped lead, saw %', visible_count;
  end if;

  select count(*) into branch_count
  from public.list_registration_crm_branches('10000000-0000-4000-8000-000000000001');
  if branch_count <> 1 then
    raise exception 'registrar should see exactly one CRM branch, saw %', branch_count;
  end if;
end;
$$;

select public.update_registration_lead_pipeline(
  current_setting('test.lead_a1')::uuid,
  'contacted',
  now() + interval '1 day',
  'تم الاتصال بولي الأمر وتحديد متابعة.'
);

-- Registrar cannot create or update a lead in branch A2.
do $$
begin
  begin
    perform public.create_registration_lead(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      'سليم', 'اختبار', null, null,
      'ولي اختبار', '+213555000099', null,
      'phone', null, null
    );
    raise exception 'registrar cross-branch create unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.update_registration_lead_pipeline(
      current_setting('test.lead_a2')::uuid, 'qualified', null, null
    );
    raise exception 'registrar cross-branch update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Teacher has no CRM visibility or management access.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', true);

do $$
declare
  access_row record;
  visible_count integer;
begin
  select * into access_row
  from public.get_registration_crm_access('10000000-0000-4000-8000-000000000001');
  if access_row.can_view is distinct from false or access_row.can_manage is distinct from false then
    raise exception 'teacher unexpectedly received CRM access';
  end if;

  select count(*) into visible_count
  from public.list_registration_leads('10000000-0000-4000-8000-000000000001', null, 200);
  if visible_count <> 0 then
    raise exception 'teacher unexpectedly saw CRM leads';
  end if;

  begin
    perform public.create_registration_lead(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'طالب', 'مرفوض', null, null,
      'ولي مرفوض', '+213555000088', null,
      'phone', null, null
    );
    raise exception 'teacher create unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- School B admin can create in B1 but cannot read School A CRM records.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000008', true);
select public.create_registration_lead(
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  'Yusuf', 'TenantB', null, 'male',
  'Guardian B', '+213555000003', 'b@example.test',
  'website', null, 'School B lead'
) as lead_b1 \gset
select set_config('test.lead_b1', :'lead_b1', true);

do $$
declare
  school_a_count integer;
  school_b_count integer;
begin
  select count(*) into school_a_count
  from public.list_registration_leads('10000000-0000-4000-8000-000000000001', null, 200);
  if school_a_count <> 0 then
    raise exception 'School B admin saw School A CRM records';
  end if;

  select count(*) into school_b_count
  from public.list_registration_leads('10000000-0000-4000-8000-000000000002', null, 200);
  if school_b_count <> 1 then
    raise exception 'School B admin should see exactly one School B lead';
  end if;
end;
$$;

reset role;

-- Audit evidence is server-private and records both creation and pipeline update.
do $$
declare
  a1_event_count integer;
  a2_event_count integer;
  b1_event_count integer;
begin
  select count(*) into a1_event_count
  from public.registration_lead_events
  where lead_id = current_setting('test.lead_a1')::uuid;

  if a1_event_count <> 2 then
    raise exception 'A1 lead should have two audit events, saw %', a1_event_count;
  end if;

  if not exists (
    select 1 from public.registration_lead_events
    where lead_id = current_setting('test.lead_a1')::uuid
      and event_type = 'pipeline_updated'
      and previous_status = 'new'
      and new_status = 'contacted'
  ) then
    raise exception 'A1 pipeline transition audit is missing';
  end if;

  select count(*) into a2_event_count
  from public.registration_lead_events
  where lead_id = current_setting('test.lead_a2')::uuid;
  if a2_event_count <> 1 then
    raise exception 'A2 lead should have one creation audit event';
  end if;

  select count(*) into b1_event_count
  from public.registration_lead_events
  where lead_id = current_setting('test.lead_b1')::uuid;
  if b1_event_count <> 1 then
    raise exception 'B1 lead should have one creation audit event';
  end if;
end;
$$;

-- Verify role grants are conservative and exact.
do $$
declare
  teacher_grants integer;
  registrar_grants integer;
  admin_grants integer;
begin
  select count(*) into teacher_grants
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where r.school_id = '10000000-0000-4000-8000-000000000001'
    and r.code = 'teacher'
    and p.code in ('registrations.view', 'registrations.manage');
  if teacher_grants <> 0 then
    raise exception 'teacher received registration CRM grants';
  end if;

  select count(*) into registrar_grants
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where r.school_id = '10000000-0000-4000-8000-000000000001'
    and r.code = 'registrar'
    and p.code in ('registrations.view', 'registrations.manage');
  if registrar_grants <> 2 then
    raise exception 'registrar should have both CRM grants';
  end if;

  select count(*) into admin_grants
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where r.school_id = '10000000-0000-4000-8000-000000000001'
    and r.code = 'school_admin'
    and p.code in ('registrations.view', 'registrations.manage');
  if admin_grants <> 2 then
    raise exception 'school admin should have both CRM grants';
  end if;
end;
$$;

rollback;
