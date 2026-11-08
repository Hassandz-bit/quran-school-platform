-- Add lower and upper bounds for active students and branches per annual plan.
-- Existing plans remain compatible: student minimum defaults to zero and branch minimum to one.
begin;

alter table public.subscription_plans
  add column if not exists min_active_students integer not null default 0,
  add column if not exists min_active_branches integer not null default 1;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_student_range_check,
  drop constraint if exists subscription_plans_branch_range_check,
  add constraint subscription_plans_student_range_check
    check (min_active_students >= 0 and min_active_students <= max_active_students),
  add constraint subscription_plans_branch_range_check
    check (min_active_branches >= 1 and min_active_branches <= max_active_branches);

alter table public.school_subscriptions
  add column if not exists min_active_students integer not null default 0,
  add column if not exists min_active_branches integer not null default 1;

alter table public.school_subscriptions
  drop constraint if exists school_subscriptions_student_range_check,
  drop constraint if exists school_subscriptions_branch_range_check,
  add constraint school_subscriptions_student_range_check
    check (min_active_students >= 0 and (max_active_students is null or min_active_students <= max_active_students)),
  add constraint school_subscriptions_branch_range_check
    check (min_active_branches >= 1 and (max_active_branches is null or min_active_branches <= max_active_branches));

-- Snapshot the selected plan's full range whenever a subscription is assigned/reassigned.
create or replace function private.sync_subscription_plan_range()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if new.plan_id is null then
    new.min_active_students := coalesce(new.min_active_students, 0);
    new.min_active_branches := coalesce(new.min_active_branches, 1);
    return new;
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = new.plan_id;

  if not found then
    raise exception using errcode = '23503', message = 'SUBSCRIPTION_PLAN_NOT_FOUND';
  end if;

  new.min_active_students := v_plan.min_active_students;
  new.max_active_students := v_plan.max_active_students;
  new.min_active_branches := v_plan.min_active_branches;
  new.max_active_branches := v_plan.max_active_branches;
  return new;
end;
$$;
revoke all on function private.sync_subscription_plan_range() from public, anon, authenticated;

drop trigger if exists school_subscription_plan_range_snapshot on public.school_subscriptions;
create trigger school_subscription_plan_range_snapshot
  before insert or update of plan_id on public.school_subscriptions
  for each row execute function private.sync_subscription_plan_range();

-- Backfill existing subscription snapshots from their linked plans without changing dates/status/payment.
update public.school_subscriptions subscription
set min_active_students = plan.min_active_students,
    min_active_branches = plan.min_active_branches
from public.subscription_plans plan
where subscription.plan_id = plan.id;

commit;
