\set ON_ERROR_STOP on

set role service_role;

do $$
begin
  begin
    perform public.create_app_notification_internal(
      '10000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000008', -- Admin B belongs to School Two.
      null,
      null,
      'administration',
      'cross_tenant_recipient_test',
      'Cross tenant recipient test',
      'This row must never be created.',
      '/notifications',
      'security_test',
      'a0000000-0000-4000-8000-000000000011'
    );
    raise exception 'cross-tenant staff recipient was accepted';
  exception
    when check_violation then null;
  end;

  begin
    perform public.create_app_notification_internal(
      '10000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000007', -- Active profile but no link to Student A1.
      null,
      '50000000-0000-4000-8000-000000000001',
      'students',
      'unrelated_guardian_test',
      'Unrelated guardian test',
      'This student notification must never reach an unrelated guardian.',
      '/parent/students/50000000-0000-4000-8000-000000000001',
      'security_test',
      'a0000000-0000-4000-8000-000000000012'
    );
    raise exception 'unrelated guardian recipient was accepted';
  exception
    when check_violation then null;
  end;

  begin
    perform public.create_app_notification_internal(
      '10000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000008', -- Cross-tenant sender.
      null,
      'administration',
      'cross_tenant_sender_test',
      'Cross tenant sender test',
      'This sender must never be attributed inside another tenant.',
      '/notifications',
      'security_test',
      'a0000000-0000-4000-8000-000000000013'
    );
    raise exception 'cross-tenant sender was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.app_notifications
    where source_type = 'security_test'
  ) then
    raise exception 'tenant isolation security tests created notification rows';
  end if;
end;
$$;
