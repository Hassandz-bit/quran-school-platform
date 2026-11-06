-- QuranOS central school subscriptions: secure foundation and legacy-safe rollout.
-- Existing schools are grandfathered as legacy before write enforcement is enabled.
-- platform_owners rows are provisioned only by a trusted database administrator.

begin;

-- Keep privileged implementation functions outside the exposed Data API schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
alter table public.platform_owners enable row level security;
revoke all on public.platform_owners from public, anon, authenticated;
grant select on public.platform_owners to authenticated;
create policy platform_owners_select_self on public.platform_owners
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_owners po
    where po.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(code) and code ~ '^[a-z][a-z0-9_-]*$'),
  name_ar text not null check (char_length(btrim(name_ar)) between 2 and 100),
  description text,
  max_active_students integer not null check (max_active_students > 0),
  max_active_branches integer not null check (max_active_branches > 0),
  annual_price numeric(12,2) not null check (annual_price >= 0),
  currency_code text not null default 'DZD' check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

create table public.school_registration_requests (
  id uuid primary key default gen_random_uuid(),
  applicant_profile_id uuid not null references public.profiles(id) on delete restrict,
  school_name text not null check (char_length(btrim(school_name)) between 2 and 150),
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  contact_phone text,
  contact_email text,
  address text,
  applicant_note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  approved_school_id uuid references public.schools(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_registration_review_consistency check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);
create unique index school_registration_pending_slug_uidx
  on public.school_registration_requests (slug) where status = 'pending';
create unique index school_registration_one_pending_per_applicant_uidx
  on public.school_registration_requests (applicant_profile_id) where status = 'pending';
create trigger school_registration_requests_set_updated_at
  before update on public.school_registration_requests
  for each row execute function public.set_updated_at();

create table public.platform_settings (
  singleton boolean primary key default true check (singleton),
  trial_default_days integer not null default 14 check (trial_default_days between 0 and 365),
  grace_period_days integer not null default 7 check (grace_period_days between 0 and 90),
  reminder_days integer[] not null default array[30, 7]::integer[],
  default_currency_code text not null default 'DZD'
    check (default_currency_code ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (singleton) values (true)
on conflict (singleton) do nothing;
create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

create table public.school_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  plan_id uuid references public.subscription_plans(id) on delete restrict,
  plan_name_snapshot text not null,
  status text not null check (
    status in ('legacy', 'trial', 'active', 'grace', 'expired', 'suspended', 'cancelled')
  ),
  starts_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  max_active_students integer check (max_active_students is null or max_active_students > 0),
  max_active_branches integer check (max_active_branches is null or max_active_branches > 0),
  agreed_annual_price numeric(12,2) check (agreed_annual_price is null or agreed_annual_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  currency_code text not null default 'DZD' check (currency_code ~ '^[A-Z]{3}$'),
  admin_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_subscriptions_school_id_id_unique unique (school_id, id),
  constraint school_subscription_dates_check check (
    (status = 'legacy' and ends_at is null and trial_ends_at is null)
    or (status = 'trial' and trial_ends_at is not null and ends_at is null)
    or (status in ('active', 'grace', 'expired') and starts_at is not null and ends_at is not null)
    or status in ('suspended', 'cancelled')
  )
);
create unique index school_subscriptions_one_current_per_school_uidx
  on public.school_subscriptions (school_id)
  where status in ('legacy', 'trial', 'active', 'grace', 'suspended');
create index school_subscriptions_status_end_idx
  on public.school_subscriptions (status, ends_at);
create trigger school_subscriptions_set_updated_at
  before update on public.school_subscriptions
  for each row execute function public.set_updated_at();

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  subscription_id uuid not null references public.school_subscriptions(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  paid_at timestamptz not null default now(),
  payment_method text not null check (
    payment_method in ('cash', 'bank_transfer', 'ccp', 'cheque', 'other')
  ),
  reference text,
  receipt_path text,
  note text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint subscription_payments_school_subscription_fk
    foreign key (school_id, subscription_id)
    references public.school_subscriptions(school_id, id) on delete restrict
);
create index subscription_payments_school_paid_idx
  on public.subscription_payments (school_id, paid_at desc);

create table public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);
create index platform_audit_log_entity_idx
  on public.platform_audit_log (entity_type, entity_id, created_at desc);

-- Grandfather current tenants without changing their school or membership records.
insert into public.school_subscriptions (
  school_id, plan_name_snapshot, status, currency_code, admin_note
)
select school.id, 'اشتراك سابق - دون قيود', 'legacy', coalesce(school.currency_code, 'DZD'),
       'تم ترحيل المدرسة القائمة عند تفعيل نظام الاشتراكات المركزي.'
from public.schools as school
where not exists (
  select 1 from public.school_subscriptions subscription
  where subscription.school_id = school.id
);

create or replace function private.school_subscription_can_operate(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_subscriptions subscription
    where subscription.school_id = target_school_id
      and (
        subscription.status = 'legacy'
        or (
          subscription.status = 'trial'
          and subscription.trial_ends_at >= now()
        )
        or (
          subscription.status in ('active', 'grace', 'expired')
          and coalesce(
            subscription.grace_ends_at,
            subscription.ends_at
          ) >= now()
        )
      )
  );
$$;
revoke all on function private.school_subscription_can_operate(uuid) from public, anon, authenticated;

-- All tenant-owned writes are blocked after trial/grace expiry; reads remain available.
create or replace function private.resolve_school_id_from_tenant_row(
  target_table_name text,
  target_row jsonb
)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_parent_id uuid;
begin
  v_school_id := nullif(target_row ->> 'school_id', '')::uuid;
  if v_school_id is not null then return v_school_id; end if;

  case target_table_name
    when 'schools' then
      v_school_id := nullif(target_row ->> 'id', '')::uuid;
    when 'guardian_import_rows' then
      v_parent_id := nullif(target_row ->> 'batch_id', '')::uuid;
      select batch.school_id into v_school_id
      from public.guardian_import_batches as batch
      where batch.id = v_parent_id;
    when 'student_import_rows' then
      v_parent_id := nullif(target_row ->> 'batch_id', '')::uuid;
      select batch.school_id into v_school_id
      from public.student_import_batches as batch
      where batch.id = v_parent_id;
    when 'guardian_notification_deliveries' then
      v_parent_id := nullif(target_row ->> 'event_id', '')::uuid;
      select event.school_id into v_school_id
      from public.guardian_notification_events as event
      where event.id = v_parent_id;
    else
      v_school_id := null;
  end case;

  return v_school_id;
end;
$$;
revoke all on function private.resolve_school_id_from_tenant_row(text, jsonb) from public, anon, authenticated;

create or replace function private.enforce_school_subscription_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_school_id uuid;
  v_new_school_id uuid;
begin
  -- Expired schools must still be able to request renewal; RLS limits this insert to school admins.
  if tg_table_name = 'school_subscription_renewal_requests' and tg_op = 'INSERT' then
    return new;
  end if;

  if public.is_platform_owner() or session_user = 'postgres' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old_school_id := private.resolve_school_id_from_tenant_row(tg_table_name, to_jsonb(old));
  end if;
  if tg_op <> 'DELETE' then
    v_new_school_id := private.resolve_school_id_from_tenant_row(tg_table_name, to_jsonb(new));
  end if;

  if (v_old_school_id is not null and not private.school_subscription_can_operate(v_old_school_id))
     or (v_new_school_id is not null and not private.school_subscription_can_operate(v_new_school_id)) then
    raise exception using
      errcode = 'P0001',
      message = 'SCHOOL_SUBSCRIPTION_READ_ONLY',
      detail = 'انتهت صلاحية الاشتراك وفترة السماح. البيانات محفوظة، ويلزم التجديد لاستئناف التعديلات.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_school_subscription_write() from public, anon, authenticated;

-- Install the subscription write guard on every existing tenant-owned table.
do $install_subscription_write_guards$
declare
  v_table record;
begin
  for v_table in
    select distinct tables.table_name
    from information_schema.tables as tables
    join information_schema.columns as columns
      on columns.table_schema = tables.table_schema
     and columns.table_name = tables.table_name
    where tables.table_schema = 'public'
      and tables.table_type = 'BASE TABLE'
      and columns.column_name = 'school_id'
      and tables.table_name <> 'platform_audit_log'
  loop
    execute format(
      'drop trigger if exists school_subscription_write_guard on public.%I',
      v_table.table_name
    );
    execute format(
      'create trigger school_subscription_write_guard
       before insert or update or delete on public.%I
       for each row execute function private.enforce_school_subscription_write()',
      v_table.table_name
    );
  end loop;

  -- These root/child tables inherit their tenant from their own id or a parent FK.
  if to_regclass('public.schools') is not null then
    execute 'drop trigger if exists school_subscription_write_guard on public.schools';
    execute 'create trigger school_subscription_write_guard
      before insert or update or delete on public.schools
      for each row execute function private.enforce_school_subscription_write()';
  end if;
  if to_regclass('public.guardian_import_rows') is not null then
    execute 'drop trigger if exists school_subscription_write_guard on public.guardian_import_rows';
    execute 'create trigger school_subscription_write_guard
      before insert or update or delete on public.guardian_import_rows
      for each row execute function private.enforce_school_subscription_write()';
  end if;
  if to_regclass('public.student_import_rows') is not null then
    execute 'drop trigger if exists school_subscription_write_guard on public.student_import_rows';
    execute 'create trigger school_subscription_write_guard
      before insert or update or delete on public.student_import_rows
      for each row execute function private.enforce_school_subscription_write()';
  end if;
  if to_regclass('public.guardian_notification_deliveries') is not null then
    execute 'drop trigger if exists school_subscription_write_guard on public.guardian_notification_deliveries';
    execute 'create trigger school_subscription_write_guard
      before insert or update or delete on public.guardian_notification_deliveries
      for each row execute function private.enforce_school_subscription_write()';
  end if;
end;
$install_subscription_write_guards$;

-- Serialize limit checks per school to prevent concurrent inserts exceeding a plan.
create or replace function private.enforce_school_subscription_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_old_school_id uuid;
  v_max integer;
  v_count bigint;
  v_new_active boolean;
  v_old_active boolean := false;
begin
  v_school_id := new.school_id;

  if public.is_platform_owner() or session_user = 'postgres' then
    return new;
  end if;

  if tg_table_name = 'students' then
    v_new_active := new.status = 'active';
    if tg_op = 'UPDATE' then
      v_old_active := old.status = 'active';
      v_old_school_id := old.school_id;
    end if;
    if not v_new_active or (v_old_active and v_old_school_id is not distinct from v_school_id) then return new; end if;

    perform pg_advisory_xact_lock(hashtextextended(v_school_id::text || ':active-students', 0));
    select subscription.max_active_students into v_max
    from public.school_subscriptions as subscription
    where subscription.school_id = v_school_id
      and subscription.status in ('legacy', 'trial', 'active', 'grace', 'expired')
    order by subscription.created_at desc
    limit 1;

    if v_max is null then return new; end if;
    select count(*) into v_count
    from public.students as student
    where student.school_id = v_school_id and student.status = 'active';

    if v_count >= v_max then
      raise exception using errcode = 'P0001',
        message = 'SUBSCRIPTION_STUDENT_LIMIT_REACHED',
        detail = 'تم بلوغ الحد الأقصى للتلاميذ النشطين في الباقة.';
    end if;
  elsif tg_table_name = 'branches' then
    v_new_active := new.status = 'active';
    if tg_op = 'UPDATE' then v_old_active := old.status = 'active'; end if;
    if not v_new_active or v_old_active then return new; end if;

    perform pg_advisory_xact_lock(hashtextextended(v_school_id::text || ':active-branches', 0));
    select subscription.max_active_branches into v_max
    from public.school_subscriptions as subscription
    where subscription.school_id = v_school_id
      and subscription.status in ('legacy', 'trial', 'active', 'grace', 'expired')
    order by subscription.created_at desc
    limit 1;

    if v_max is null then return new; end if;
    select count(*) into v_count
    from public.branches as branch
    where branch.school_id = v_school_id and branch.status = 'active';

    if v_count >= v_max then
      raise exception using errcode = 'P0001',
        message = 'SUBSCRIPTION_BRANCH_LIMIT_REACHED',
        detail = 'تم بلوغ الحد الأقصى للفروع النشطة في الباقة.';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_school_subscription_limits() from public, anon, authenticated;

create trigger students_subscription_limit_guard
  before insert or update of status, school_id on public.students
  for each row execute function private.enforce_school_subscription_limits();
create trigger branches_subscription_limit_guard
  before insert or update of status, school_id on public.branches
  for each row execute function private.enforce_school_subscription_limits();

-- Append-only audit trail for owner-managed billing and onboarding records.
create or replace function private.write_platform_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_entity_id uuid;
begin
  if tg_op <> 'INSERT' then v_before := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_after := to_jsonb(new); end if;
  v_entity_id := coalesce(
    nullif(v_after ->> 'id', '')::uuid,
    nullif(v_before ->> 'id', '')::uuid
  );
  insert into public.platform_audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    (select auth.uid()), lower(tg_op), tg_table_name, v_entity_id, v_before, v_after
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.write_platform_audit_log() from public, anon, authenticated;

create trigger subscription_plans_audit
  after insert or update or delete on public.subscription_plans
  for each row execute function private.write_platform_audit_log();
create trigger school_registration_requests_audit
  after insert or update or delete on public.school_registration_requests
  for each row execute function private.write_platform_audit_log();
create trigger school_subscriptions_audit
  after insert or update or delete on public.school_subscriptions
  for each row execute function private.write_platform_audit_log();
create trigger subscription_payments_audit
  after insert on public.subscription_payments
  for each row execute function private.write_platform_audit_log();
create trigger platform_settings_audit
  after update on public.platform_settings
  for each row execute function private.write_platform_audit_log();

create trigger school_subscription_renewal_requests_audit
  after insert or update or delete on public.school_subscription_renewal_requests
  for each row execute function private.write_platform_audit_log();

-- Secure school approval: the owner provisions the tenant, initial branch and school admin atomically.
create or replace function private.approve_school_registration(
  target_request_id uuid,
  target_plan_id uuid,
  target_trial_days integer default null,
  target_discount_amount numeric default 0,
  target_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.school_registration_requests%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_school_id uuid;
  v_role_id uuid;
  v_membership_id uuid;
  v_now timestamptz := now();
  v_grace_days integer := 7;
  v_trial_days integer;
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'PLATFORM_OWNER_REQUIRED';
  end if;
  select trial_default_days, grace_period_days
    into v_trial_days, v_grace_days
  from public.platform_settings where singleton = true;
  if target_trial_days is not null then v_trial_days := target_trial_days; end if;
  if v_trial_days is null or v_trial_days < 0 or v_trial_days > 365 then
    raise exception using errcode = '22023', message = 'INVALID_TRIAL_DAYS';
  end if;
  if target_discount_amount is null or target_discount_amount < 0 then
    raise exception using errcode = '22023', message = 'INVALID_DISCOUNT';
  end if;

  select * into v_request
  from public.school_registration_requests
  where id = target_request_id and status = 'pending'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PENDING_REGISTRATION_NOT_FOUND';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = target_plan_id and is_active = true;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACTIVE_PLAN_NOT_FOUND';
  end if;
  if target_discount_amount > v_plan.annual_price then
    raise exception using errcode = '22023', message = 'DISCOUNT_EXCEEDS_PLAN_PRICE';
  end if;
  if exists (select 1 from public.schools where slug = v_request.slug) then
    raise exception using errcode = '23505', message = 'SCHOOL_SLUG_ALREADY_EXISTS';
  end if;

  select grace_period_days into v_grace_days
  from public.platform_settings where singleton = true;

  insert into public.schools (
    name, slug, status, default_locale, timezone, currency_code,
    contact_phone, contact_email, address
  ) values (
    v_request.school_name, v_request.slug, 'active', 'ar', 'Africa/Algiers',
    v_plan.currency_code, v_request.contact_phone, v_request.contact_email, v_request.address
  ) returning id into v_school_id;

  insert into public.branches (school_id, name, code, status, is_main)
  values (v_school_id, 'الفرع الرئيسي', 'MAIN', 'active', true);

  insert into public.roles (school_id, code, name_ar, description, is_system, status)
  values (v_school_id, 'school_admin', 'مدير المدرسة',
          'إدارة المدرسة وجميع فروعها', true, 'active')
  returning id into v_role_id;

  insert into public.school_memberships (school_id, profile_id, status, joined_at)
  values (v_school_id, v_request.applicant_profile_id, 'active', v_now)
  returning id into v_membership_id;

  insert into public.membership_roles (school_id, membership_id, role_id, branch_id)
  values (v_school_id, v_membership_id, v_role_id, null);

  -- Notification audience resolution requires this explicit grant for the staff context.
  insert into public.role_permissions (school_id, role_id, permission_id)
  select v_school_id, v_role_id, permission.id
  from public.permissions permission
  where permission.code = 'notifications.send'
  on conflict (role_id, permission_id) do nothing;

  insert into public.school_subscriptions (
    school_id, plan_id, plan_name_snapshot, status, starts_at, ends_at,
    trial_ends_at, grace_ends_at, max_active_students, max_active_branches,
    agreed_annual_price, discount_amount, currency_code, created_by, admin_note
  ) values (
    v_school_id, v_plan.id, v_plan.name_ar,
    case when v_trial_days > 0 then 'trial' else 'active' end,
    v_now,
    case when v_trial_days > 0 then null else v_now + interval '1 year' end,
    case when v_trial_days > 0 then v_now + make_interval(days => v_trial_days) else null end,
    case when v_trial_days > 0 then null
         else v_now + interval '1 year' + make_interval(days => v_grace_days) end,
    v_plan.max_active_students, v_plan.max_active_branches,
    greatest(v_plan.annual_price - target_discount_amount, 0),
    target_discount_amount, v_plan.currency_code, auth.uid(), target_review_note
  );

  update public.school_registration_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = v_now,
      review_note = target_review_note, approved_school_id = v_school_id
  where id = target_request_id;

  return v_school_id;
end;
$$;
revoke all on function private.approve_school_registration(uuid, uuid, integer, numeric, text)
  from public, anon, authenticated;
grant execute on function private.approve_school_registration(uuid, uuid, integer, numeric, text)
  to authenticated;

create or replace function public.approve_school_registration(
  target_request_id uuid,
  target_plan_id uuid,
  target_trial_days integer default null,
  target_discount_amount numeric default 0,
  target_review_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.approve_school_registration(
    target_request_id, target_plan_id, target_trial_days, target_discount_amount, target_review_note
  );
$$;
revoke all on function public.approve_school_registration(uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.approve_school_registration(uuid, uuid, integer, numeric, text) to authenticated;

-- Manual payment registration and one-year renewal; no payment gateway is introduced.
create or replace function private.record_subscription_payment_and_renew(
  target_school_id uuid,
  target_amount numeric,
  target_payment_method text,
  target_paid_at timestamptz default now(),
  target_reference text default null,
  target_receipt_path text default null,
  target_note text default null,
  target_plan_id uuid default null,
  target_discount_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.school_subscriptions%rowtype;
  v_payment_id uuid;
  v_start timestamptz;
  v_grace_days integer := 7;
  v_plan public.subscription_plans%rowtype;
  v_discount numeric := coalesce(target_discount_amount, 0);
  v_expected_amount numeric;
begin
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'PLATFORM_OWNER_REQUIRED';
  end if;
  if target_amount <= 0 then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_AMOUNT';
  end if;
  if target_payment_method not in ('cash', 'bank_transfer', 'ccp', 'cheque', 'other') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;

  select * into v_subscription
  from public.school_subscriptions
  where school_id = target_school_id
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SCHOOL_SUBSCRIPTION_NOT_FOUND';
  end if;
  if v_subscription.status = 'suspended' or v_subscription.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'SUBSCRIPTION_NOT_RENEWABLE';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = coalesce(target_plan_id, v_subscription.plan_id)
    and is_active = true;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACTIVE_PLAN_REQUIRED_FOR_RENEWAL';
  end if;
  if v_discount < 0 or v_discount > v_plan.annual_price then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_DISCOUNT';
  end if;
  v_expected_amount := greatest(v_plan.annual_price - v_discount, 0);
  if abs(target_amount - v_expected_amount) > 0.01 then
    raise exception using errcode = '22023', message = 'RENEWAL_PAYMENT_AMOUNT_MISMATCH',
      detail = 'مبلغ الدفع يجب أن يساوي السعر السنوي بعد الخصم.';
  end if;

  select grace_period_days into v_grace_days
  from public.platform_settings where singleton = true;

  v_start := case
    when v_subscription.ends_at is not null and v_subscription.ends_at > now()
      then v_subscription.ends_at
    else now()
  end;

  update public.school_subscriptions
  set plan_id = v_plan.id,
      plan_name_snapshot = v_plan.name_ar,
      max_active_students = v_plan.max_active_students,
      max_active_branches = v_plan.max_active_branches,
      agreed_annual_price = greatest(v_plan.annual_price - v_discount, 0),
      discount_amount = v_discount,
      currency_code = v_plan.currency_code,
      status = 'active',
      starts_at = v_start,
      ends_at = v_start + interval '1 year',
      trial_ends_at = null,
      grace_ends_at = v_start + interval '1 year' + make_interval(days => v_grace_days),
      updated_at = now()
  where id = v_subscription.id;

  insert into public.subscription_payments (
    school_id, subscription_id, amount, currency_code, paid_at,
    payment_method, reference, receipt_path, note, recorded_by
  ) values (
    target_school_id, v_subscription.id, target_amount, v_plan.currency_code,
    coalesce(target_paid_at, now()), target_payment_method,
    target_reference, target_receipt_path, target_note, auth.uid()
  ) returning id into v_payment_id;

  update public.school_subscription_renewal_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = 'تم تسجيل الدفع وتجديد الاشتراك.'
  where school_id = target_school_id and status = 'pending';

  return v_payment_id;
end;
$$;
revoke all on function private.record_subscription_payment_and_renew(uuid, numeric, text, timestamptz, text, text, text, uuid, numeric)
  from public, anon, authenticated;
grant execute on function private.record_subscription_payment_and_renew(uuid, numeric, text, timestamptz, text, text, text, uuid, numeric)
  to authenticated;

create or replace function public.record_subscription_payment_and_renew(
  target_school_id uuid,
  target_amount numeric,
  target_payment_method text,
  target_paid_at timestamptz default now(),
  target_reference text default null,
  target_receipt_path text default null,
  target_note text default null,
  target_plan_id uuid default null,
  target_discount_amount numeric default 0
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_subscription_payment_and_renew(
    target_school_id, target_amount, target_payment_method, target_paid_at,
    target_reference, target_receipt_path, target_note, target_plan_id, target_discount_amount
  );
$$;
revoke all on function public.record_subscription_payment_and_renew(uuid, numeric, text, timestamptz, text, text, text, uuid, numeric)
  from public, anon;
grant execute on function public.record_subscription_payment_and_renew(uuid, numeric, text, timestamptz, text, text, text, uuid, numeric)
  to authenticated;

-- Daily 30-day and 7-day subscription/trial reminders use Supabase's built-in pg_cron.
-- Enable pg_cron in Supabase Database > Extensions after migration review.

create table public.school_subscription_reminders (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  subscription_id uuid not null references public.school_subscriptions(id) on delete restrict,
  reminder_type text not null check (reminder_type in ('trial', 'subscription')),
  reminder_days smallint not null check (reminder_days in (7, 30)),
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint school_subscription_reminder_once unique
    (subscription_id, reminder_type, reminder_days, due_at)
);

create or replace function private.notify_school_subscription_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $reminder$
declare
  v_title text;
  v_body text;
  v_event_type text;
begin
  if new.reminder_type = 'trial' then
    v_title := case when new.reminder_days = 30
      then 'تنتهي الفترة التجريبية خلال 30 يومًا'
      else 'تنتهي الفترة التجريبية خلال 7 أيام' end;
    v_event_type := 'school_trial_expiring_' || new.reminder_days || 'd';
    v_body := 'تنتهي الفترة التجريبية لمدرستكم في '
      || to_char(new.due_at at time zone 'Africa/Algiers', 'DD/MM/YYYY')
      || '. يرجى التواصل مع إدارة المنصة لاختيار الاشتراك السنوي.';
  else
    v_title := case when new.reminder_days = 30
      then 'ينتهي اشتراك المدرسة خلال 30 يومًا'
      else 'ينتهي اشتراك المدرسة خلال 7 أيام' end;
    v_event_type := 'school_subscription_expiring_' || new.reminder_days || 'd';
    v_body := 'ينتهي اشتراك مدرستكم في '
      || to_char(new.due_at at time zone 'Africa/Algiers', 'DD/MM/YYYY')
      || '. يرجى طلب التجديد قبل انتهاء فترة السماح.';
  end if;

  insert into public.app_notifications (
    school_id, recipient_profile_id, category, event_type, title, body,
    target_path, source_type, source_id, recipient_audiences, sender_audiences
  )
  select distinct new.school_id, membership.profile_id, 'system', v_event_type,
         v_title, v_body, '/subscription', 'school_subscription_reminder', new.id,
         array['staff']::text[], array[]::text[]
  from public.school_memberships membership
  join public.membership_roles membership_role
    on membership_role.school_id = membership.school_id
   and membership_role.membership_id = membership.id
   and membership_role.branch_id is null
  join public.roles role
    on role.school_id = membership_role.school_id
   and role.id = membership_role.role_id
   and role.code = 'school_admin'
   and role.status = 'active'
  where membership.school_id = new.school_id
    and membership.status = 'active'
  on conflict do nothing;

  return new;
end;
$reminder$;
revoke all on function private.notify_school_subscription_reminder() from public, anon, authenticated;

create trigger school_subscription_reminder_notify
  after insert on public.school_subscription_reminders
  for each row execute function private.notify_school_subscription_reminder();

create or replace function private.generate_school_subscription_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $reminder$
declare
  v_inserted integer;
begin
  insert into public.school_subscription_reminders (
    school_id, subscription_id, reminder_type, reminder_days, due_at
  )
  select subscription.school_id,
         subscription.id,
         case when subscription.status = 'trial' then 'trial' else 'subscription' end,
         reminder.reminder_days,
         case when subscription.status = 'trial' then subscription.trial_ends_at else subscription.ends_at end
  from public.school_subscriptions subscription
  cross join (values (30::smallint), (7::smallint)) as reminder(reminder_days)
  where subscription.status in ('trial', 'active', 'grace')
    and (case when subscription.status = 'trial' then subscription.trial_ends_at else subscription.ends_at end) is not null
    and (
      (case when subscription.status = 'trial' then subscription.trial_ends_at else subscription.ends_at end)
      at time zone 'Africa/Algiers'
    )::date = (now() at time zone 'Africa/Algiers')::date + reminder.reminder_days
  on conflict on constraint school_subscription_reminder_once do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$reminder$;
revoke all on function private.generate_school_subscription_reminders() from public, anon, authenticated;


-- Public school self-registration creates the profile and pending request atomically.
create table public.school_subscription_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_renewal_review_consistency check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);
create unique index school_renewal_one_pending_per_school_uidx
  on public.school_subscription_renewal_requests (school_id) where status = 'pending';
create trigger school_subscription_renewal_requests_set_updated_at
  before update on public.school_subscription_renewal_requests
  for each row execute function public.set_updated_at();

create or replace function private.submit_school_registration_request(
  target_full_name text,
  target_school_name text,
  target_slug text,
  target_contact_phone text default null,
  target_address text default null,
  target_applicant_note text default null,
  target_locale text default 'ar'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $reminder$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_request_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if target_full_name is null or char_length(btrim(target_full_name)) not between 2 and 150
     or target_school_name is null or char_length(btrim(target_school_name)) not between 2 and 150
     or target_slug is null or target_slug <> lower(target_slug)
     or target_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(target_slug) not between 3 and 80
     or coalesce(target_locale, 'ar') not in ('ar', 'en') then
    raise exception using errcode = '22023', message = 'INVALID_REGISTRATION_DETAILS';
  end if;

  select auth_user.email into v_email
  from auth.users as auth_user
  where auth_user.id = v_user_id and auth_user.email_confirmed_at is not null;
  if v_email is null then
    raise exception using errcode = '42501', message = 'CONFIRMED_EMAIL_REQUIRED';
  end if;

  if exists (
    select 1 from public.school_memberships membership
    where membership.profile_id = v_user_id and membership.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'ACTIVE_SCHOOL_MEMBERSHIP_EXISTS';
  end if;

  select request.id into v_request_id
  from public.school_registration_requests as request
  where request.applicant_profile_id = v_user_id and request.status = 'pending'
  order by request.created_at desc limit 1;
  if v_request_id is not null then
    return v_request_id;
  end if;

  if exists (select 1 from public.schools where slug = target_slug) then
    raise exception using errcode = '23505', message = 'SCHOOL_SLUG_ALREADY_EXISTS';
  end if;

  insert into public.profiles (id, full_name, phone, locale, status)
  values (v_user_id, btrim(target_full_name), nullif(btrim(target_contact_phone), ''),
          coalesce(target_locale, 'ar'), 'active')
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = coalesce(excluded.phone, public.profiles.phone)
  where public.profiles.status = 'active';

  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_user_id and profile.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'PROFILE_DISABLED';
  end if;

  insert into public.school_registration_requests (
    applicant_profile_id, school_name, slug, contact_phone,
    contact_email, address, applicant_note
  ) values (
    v_user_id, btrim(target_school_name), target_slug,
    nullif(btrim(target_contact_phone), ''), v_email,
    nullif(btrim(target_address), ''), nullif(btrim(target_applicant_note), '')
  ) returning id into v_request_id;

  return v_request_id;
end;
$reminder$;
revoke all on function private.submit_school_registration_request(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function private.submit_school_registration_request(text, text, text, text, text, text, text)
  to authenticated;

create or replace function public.submit_school_registration_request(
  target_full_name text,
  target_school_name text,
  target_slug text,
  target_contact_phone text default null,
  target_address text default null,
  target_applicant_note text default null,
  target_locale text default 'ar'
)
returns uuid
language sql
security invoker
set search_path = ''
as $reminder$
  select private.submit_school_registration_request(
    target_full_name, target_school_name, target_slug,
    target_contact_phone, target_address, target_applicant_note, target_locale
  );
$reminder$;
revoke all on function public.submit_school_registration_request(text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.submit_school_registration_request(text, text, text, text, text, text, text)
  to authenticated;

-- RLS and least-privilege Data API grants for all new public tables.
alter table public.subscription_plans enable row level security;
alter table public.school_registration_requests enable row level security;
alter table public.platform_settings enable row level security;
alter table public.school_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.school_subscription_renewal_requests enable row level security;

revoke all on public.subscription_plans, public.school_registration_requests,
  public.platform_settings, public.school_subscriptions, public.subscription_payments,
  public.platform_audit_log, public.school_subscription_renewal_requests,
  public.school_subscription_reminders
  from public, anon, authenticated;

grant select, insert, update on public.subscription_plans to authenticated;
grant select, insert, update on public.school_registration_requests to authenticated;
grant select, update on public.platform_settings to authenticated;
grant select, update on public.school_subscriptions to authenticated;
grant select, insert on public.subscription_payments to authenticated;
grant select on public.platform_audit_log to authenticated;
grant select, insert, update on public.school_subscription_renewal_requests to authenticated;

create policy subscription_plans_read_active on public.subscription_plans
  for select to authenticated using (is_active or public.is_platform_owner());
create policy subscription_plans_owner_insert on public.subscription_plans
  for insert to authenticated with check (public.is_platform_owner());
create policy subscription_plans_owner_update on public.subscription_plans
  for update to authenticated using (public.is_platform_owner())
  with check (public.is_platform_owner());

create policy registration_requests_read_own_or_owner on public.school_registration_requests
  for select to authenticated
  using (applicant_profile_id = (select auth.uid()) or public.is_platform_owner());
create policy registration_requests_create_own on public.school_registration_requests
  for insert to authenticated
  with check (applicant_profile_id = (select auth.uid()) and status = 'pending'
    and reviewed_by is null and reviewed_at is null and approved_school_id is null);
create policy registration_requests_owner_update on public.school_registration_requests
  for update to authenticated using (public.is_platform_owner())
  with check (public.is_platform_owner());

create policy platform_settings_owner_read on public.platform_settings
  for select to authenticated using (public.is_platform_owner());
create policy platform_settings_owner_update on public.platform_settings
  for update to authenticated using (public.is_platform_owner())
  with check (public.is_platform_owner());

create policy school_subscriptions_read_school_or_owner on public.school_subscriptions
  for select to authenticated
  using (public.is_platform_owner() or public.has_school_permission(school_id, 'school.update'));
create policy school_subscriptions_owner_update on public.school_subscriptions
  for update to authenticated using (public.is_platform_owner())
  with check (public.is_platform_owner());

create policy subscription_payments_read_school_or_owner on public.subscription_payments
  for select to authenticated
  using (public.is_platform_owner() or public.has_school_permission(school_id, 'school.update'));
create policy subscription_payments_owner_insert on public.subscription_payments
  for insert to authenticated with check (
    public.is_platform_owner() and recorded_by = (select auth.uid())
  );

create policy platform_audit_log_owner_read on public.platform_audit_log
  for select to authenticated using (public.is_platform_owner());

create policy school_renewal_requests_read_school_or_owner
  on public.school_subscription_renewal_requests
  for select to authenticated
  using (public.is_platform_owner() or public.has_school_permission(school_id, 'school.update'));
create policy school_renewal_requests_create_admin
  on public.school_subscription_renewal_requests
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null and reviewed_at is null
    and public.has_school_permission(school_id, 'school.update')
  );
create policy school_renewal_requests_owner_update
  on public.school_subscription_renewal_requests
  for update to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

create policy schools_select_platform_owner on public.schools
  for select to authenticated using (public.is_platform_owner());

create policy school_subscription_reminders_read_school_or_owner
  on public.school_subscription_reminders
  for select to authenticated
  using (public.is_platform_owner() or public.has_school_permission(school_id, 'school.update'));

commit;