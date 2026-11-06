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

test("paid subscriptions are annual and trial subscriptions have a separate end date", () => {
  assert.match(migration, /v_now \+ interval '1 year'/);
  assert.match(migration, /trial_ends_at/);
  assert.match(migration, /v_trial_days < 0 or v_trial_days > 365/);
});

test("active student and branch caps are enforced with per-school transaction locks", () => {
  assert.match(migration, /:active-students/);
  assert.match(migration, /:active-branches/);
  assert.match(migration, /SUBSCRIPTION_STUDENT_LIMIT_REACHED/);
  assert.match(migration, /SUBSCRIPTION_BRANCH_LIMIT_REACHED/);
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

test("all subscription tables enable RLS and audit records are read-only to clients", () => {
  for (const table of [
    "subscription_plans",
    "school_registration_requests",
    "platform_settings",
    "school_subscriptions",
    "subscription_payments",
    "platform_audit_log",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /grant select on public\.platform_audit_log to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*platform_audit_log/i);
});
