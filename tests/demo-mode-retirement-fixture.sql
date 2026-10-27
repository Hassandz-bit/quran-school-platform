\set ON_ERROR_STOP on

-- Create a realistic active legacy demo batch immediately before migration 072.
-- The disposable integration database is removed by the test runner afterward.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.create_school_demo_data('10000000-0000-4000-8000-000000000001');
