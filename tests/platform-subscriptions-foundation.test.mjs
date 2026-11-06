import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/082_platform_subscriptions_foundation.sql", import.meta.url),
  "utf8"
);

test("platform owner is provisioned outside public signup and user metadata", () => {
  assert.match(migration, /create table public\.platform_owners/);
  assert.match(migration, /user_id uuid primary key references auth\.users/);
  assert.match(migration, /revoke all on public\.platform_owners from public, anon, authenticated/);
  assert.match(migration, /create or replace function public\.is_platform_owner\(\)/);
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/);
});

test("legacy schools are grandfathered before write guards are installed", () => {
  assert.match(migration, /insert into public\.school_subscriptions[\s\S]*?'legacy'/);
  assert.match(migration, /where not exists \([\s\S]*?subscription\.school_id = school\.id/);
  assert.match(migration, /install_subscription_write_guards/);
});

test("zero-trial approvals remain read-only until the first manual payment", () => {
  assert.match(migration, /pending_payment/);
  assert.match(migration, /case when v_trial_days > 0 then 'trial' else 'pending_payment' end/);
  assert.match(migration, /status = 'pending_payment' and starts_at is null and ends_at is null and trial_ends_at is null/);
  assert.match(migration, /where status in \('legacy', 'trial', 'pending_payment', 'active', 'grace', 'suspended'\)/);
});

test("paid subscriptions are annual and trial subscriptions have a separate end date", () => {
  assert.match(migration, /v_now \+ interval '1 year'/);
  assert.match(migration, /trial_ends_at/);
  assert.match(migration, /v_trial_days < 0 or v_trial_days > 365/);
});

test("annual plans require positive prices and owner discounts match the recorded payment", () => {
  assert.ok(migration.includes("annual_price numeric(12,2) not null check (annual_price > 0)"));
  assert.ok(migration.includes("if v_discount < 0 or v_discount >= v_plan.annual_price then"));
  assert.ok(migration.includes("when v_subscription.trial_ends_at is not null and v_subscription.trial_ends_at > now()"));
  assert.ok(migration.includes("target_amount - v_expected_amount"));
});

test("active student and branch caps are enforced with per-school transaction locks", () => {
  assert.match(migration, /:active-students/);
  assert.match(migration, /:active-branches/);
  assert.match(migration, /SUBSCRIPTION_STUDENT_LIMIT_REACHED/);
  assert.match(migration, /SUBSCRIPTION_BRANCH_LIMIT_REACHED/);
  assert.match(migration, /v_old_school_id is not distinct from v_school_id/);
  assert.ok(migration.includes("limit 1\n    for update;"));
  assert.ok(migration.includes("v_old_school_id := old.school_id;\n    end if;\n    if not v_new_active or (v_old_active and v_old_school_id is not distinct from v_school_id)"));
  assert.ok(migration.includes("update of status, school_id on public.students"));
  assert.ok(migration.includes("update of status, school_id on public.branches"));
});

test("expired subscriptions become read-only without deleting tenant data", () => {
  assert.match(migration, /SCHOOL_SUBSCRIPTION_READ_ONLY/);
  assert.match(migration, /v_old_school_id/);
  assert.match(migration, /v_new_school_id/);
  assert.match(migration, /before insert or update or delete on public\.%I/);
  assert.doesNotMatch(migration, /delete from public\.(schools|students|branches)/i);
});

test("service-role edge workflows remain subject to subscription enforcement, including child import rows", () => {
  assert.match(migration, /batch[.]school_id/);
  assert.match(migration, /guardian_import_rows/);
  assert.match(migration, /student_import_rows/);
  assert.match(migration, /guardian_notification_deliveries/);
  assert.match(migration, /when 'schools' then/);
  assert.doesNotMatch(migration, /service_role/);
});

test("approval and manual annual renewal require the platform owner", () => {
  assert.match(migration, /approve_school_registration/);
  assert.match(migration, /record_subscription_payment_and_renew/);
  assert.match(migration, /PLATFORM_OWNER_REQUIRED/);
  assert.match(migration, /payment_method in \('cash', 'bank_transfer', 'ccp', 'cheque', 'other'\)/);
});

test("internal trigger and status helpers are not callable by browser roles", () => {
  for (const functionName of [
    "school_subscription_can_operate(uuid)",
    "resolve_school_id_from_tenant_row(text, jsonb)",
    "enforce_school_subscription_write()",
    "enforce_school_subscription_limits()",
    "write_platform_audit_log()",
    "notify_school_subscription_reminder()",
    "generate_school_subscription_reminders()",
  ]) {
    assert.ok(
      migration.includes(`revoke all on function private.${functionName} from public, anon, authenticated`),
      `Expected ${functionName} to be revoked from browser roles`
    );
  }
});

test("privileged implementation functions stay in the unexposed private schema", () => {
  assert.match(migration, /create schema if not exists private/);
  assert.match(migration, /revoke all on schema private from public, anon, authenticated/);
  assert.match(migration, /grant usage on schema private to authenticated/);
  assert.match(migration, /create or replace function public\.approve_school_registration\([\s\S]*?security invoker/);
  assert.match(migration, /create or replace function public\.record_subscription_payment_and_renew\([\s\S]*?security invoker/);
});

test("SQL function dollar quoting is balanced and wrappers are syntactically complete", () => {
  const delimiters = migration.match(/\$\$/g) ?? [];
  const reminderDelimiters = migration.match(/\$reminder\$/g) ?? [];
  const guardDelimiters = migration.match(/\$install_subscription_write_guards\$/g) ?? [];
  assert.equal(delimiters.length % 2, 0);
  assert.equal(reminderDelimiters.length % 2, 0);
  assert.equal(guardDelimiters.length % 2, 0);
  assert.doesNotMatch(migration, /as \$\s/);
  assert.match(migration, /create or replace function public\.submit_school_registration_request\([\s\S]*?security invoker[\s\S]*?as \$reminder\$/);
});

test("migration is one complete transaction and school registration SQL is not truncated", () => {
  assert.equal(migration.split("commit;").length - 1, 1);
  const commitIndex = migration.lastIndexOf("commit;");
  assert.ok(commitIndex >= 0);
  assert.equal(migration.slice(commitIndex + "commit;".length).trim(), "");
  assert.equal(migration.split("create or replace function private.submit_school_registration_request").length - 1, 1);
  assert.equal(migration.split("create or replace function public.submit_school_registration_request").length - 1, 1);
  assert.ok(migration.includes("or target_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'"));
  assert.ok(migration.includes("char_length(target_slug) not between 3 and 80"));
});

test("school registration requires a confirmed authenticated account and creates the profile server-side", () => {
  assert.match(migration, /auth_user\.email_confirmed_at is not null/);
  assert.match(migration, /private\.submit_school_registration_request/);
  assert.match(migration, /insert into public\.profiles \(id, full_name, phone, locale, status\)/);
  assert.match(migration, /profile\.locale from public\.profiles profile where profile\.id = v_request\.applicant_profile_id/);
  assert.match(migration, /ACTIVE_SCHOOL_MEMBERSHIP_EXISTS/);
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/);
});

test("school renewal requests are tenant-scoped, owner-reviewed, and audited", () => {
  assert.match(migration, /create table public\.school_subscription_renewal_requests/);
  assert.match(migration, /school_renewal_requests_create_admin[\s\S]*?public\.has_school_permission\(school_id, 'school\.update'\)/);
  assert.match(migration, /school_renewal_requests_owner_update[\s\S]*?public\.is_platform_owner\(\)/);
  assert.match(migration, /school_subscription_renewal_requests_audit/);
  assert.match(migration, /tg_table_name = 'school_subscription_renewal_requests' and tg_op = 'INSERT'/);
  assert.match(migration, /RENEWAL_PAYMENT_AMOUNT_MISMATCH/);
});

test("30-day and 7-day reminders create staff-only school notifications", () => {
  assert.match(migration, /reminder_days in \(7, 30\)/);
  assert.match(migration, /school_subscription_reminder_once/);
  assert.match(migration, /recipient_audiences, sender_audiences/);
  assert.match(migration, /array\['staff'\]::text\[\]/);
  assert.match(migration, /school_subscription_reminder_notify/);
  assert.match(migration, /permission\.code = 'notifications\.send'/);
  assert.match(migration, /source_type, source_id, recipient_audiences/);
});

test("all subscription tables enable RLS and audit records are read-only to clients", () => {
  for (const table of [
    "subscription_plans",
    "school_registration_requests",
    "platform_settings",
    "school_subscriptions",
    "subscription_payments",
    "platform_audit_log",
    "school_subscription_renewal_requests",
    "school_subscription_reminders",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /grant select on public\.platform_audit_log to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*platform_audit_log/i);
});
