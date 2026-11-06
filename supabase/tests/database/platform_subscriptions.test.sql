begin;
select plan(20);

select has_table('public', 'platform_owners', 'platform owner registry exists');
select has_table('public', 'subscription_plans', 'subscription plans table exists');
select has_table('public', 'school_registration_requests', 'school registration requests table exists');
select has_table('public', 'platform_settings', 'platform settings table exists');
select has_table('public', 'school_subscriptions', 'school subscriptions table exists');
select has_table('public', 'subscription_payments', 'subscription payments table exists');
select has_table('public', 'platform_audit_log', 'platform audit log table exists');
select has_table('public', 'school_subscription_reminders', 'subscription reminders table exists');
select has_table('public', 'school_subscription_renewal_requests', 'subscription renewal requests table exists');

select has_trigger('public', 'schools', 'school_subscription_write_guard', 'school writes are guarded');
select has_trigger('public', 'students', 'school_subscription_write_guard', 'student writes are guarded');
select has_trigger('public', 'branches', 'school_subscription_write_guard', 'branch writes are guarded');
select has_trigger('public', 'students', 'students_subscription_limit_guard', 'active student limit is enforced in the database');
select has_trigger('public', 'branches', 'branches_subscription_limit_guard', 'active branch limit is enforced in the database');

select ok(
  to_regprocedure('private.generate_school_subscription_reminders()') is not null,
  'private reminder generator is installed'
);
select ok(
  exists (
    select 1 from public.school_subscriptions
    where school_id = '10000000-0000-4000-8000-000000000001'
      and status = 'legacy'
      and ends_at is null
  ),
  'pre-existing seeded school is grandfathered without changing its data'
);
select ok(
  exists (
    select 1 from public.platform_settings
    where singleton and trial_default_days = 14 and grace_period_days = 7
      and default_currency_code = 'DZD'
  ),
  'platform defaults are initialized'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_owners'::regclass),
  'platform owner registry has row-level security enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.platform_owners', 'INSERT'),
  'authenticated users cannot self-register as platform owners'
);
select ok(
  not has_table_privilege('authenticated', 'public.platform_owners', 'UPDATE'),
  'authenticated users cannot modify platform owner records'
);
select ok(
  not has_table_privilege('authenticated', 'public.platform_owners', 'DELETE'),
  'authenticated users cannot delete platform owner records'
);

select * from finish();
rollback;
