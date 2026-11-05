\set ON_ERROR_STOP on

do $$
declare
  category_check text;
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.guardian_notification_events'::regclass
      and tgname = 'guardian_notification_events_app_center'
      and not tgisinternal
  ) then
    raise exception 'attendance still generates in-app notification rows';
  end if;

  if exists (
    select 1 from public.app_notifications
    where category in ('students', 'learning', 'attendance')
  ) then
    raise exception 'retired notification categories remain in the inbox';
  end if;

  if exists (
    select 1 from public.notification_campaigns
    where category in ('students', 'learning', 'attendance')
  ) then
    raise exception 'retired notification categories remain in campaign history';
  end if;

  select pg_get_constraintdef(oid)
  into category_check
  from pg_constraint
  where conrelid = 'public.app_notifications'::regclass
    and conname = 'app_notifications_category_check';

  if category_check is null
    or category_check not like '%administration%'
    or category_check not like '%teachers%'
    or category_check not like '%finance%'
    or category_check not like '%guardians%'
    or category_check not like '%system%'
    or category_check like '%attendance%'
    or category_check like '%learning%'
    or category_check like '%students%'
  then
    raise exception 'app notification category constraint does not match the reduced category set';
  end if;

  select pg_get_constraintdef(oid)
  into category_check
  from pg_constraint
  where conrelid = 'public.notification_campaigns'::regclass
    and conname = 'notification_campaigns_category_check';

  if category_check is null
    or category_check like '%attendance%'
    or category_check like '%learning%'
    or category_check like '%students%'
  then
    raise exception 'notification campaign category constraint was not tightened';
  end if;
end;
$$;
