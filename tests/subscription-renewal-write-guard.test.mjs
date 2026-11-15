import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const migration = readFileSync(new URL("supabase/092_subscription_renewal_write_guard.sql", root), "utf8");
const dashboard = readFileSync(new URL("client/src/pages/PlatformOwnerDashboard.tsx", root), "utf8");

test("annual subscription date changes require the payment-backed renewal context", () => {
  assert.match(migration, /SUBSCRIPTION_UPDATE_REQUIRES_PAYMENT_OR_TRIAL_EXTENSION/);
  assert.match(migration, /tg_table_name = 'school_subscriptions' and tg_op = 'UPDATE' then/);
  assert.match(migration, /create table if not exists private\.subscription_write_contexts/);
  assert.match(migration, /insert into private\.subscription_write_contexts[\s\S]*?'payment_renewal'/);
});

test("trial extension is owner-only, trial-only, and advances the grace deadline", () => {
  assert.match(migration, /if not public\.is_platform_owner\(\) then[\s\S]*?PLATFORM_OWNER_REQUIRED/);
  assert.match(migration, /v_subscription\.status <> 'trial'/);
  assert.match(migration, /target_trial_ends_at <= v_subscription\.trial_ends_at/);
  assert.match(migration, /grace_ends_at = target_trial_ends_at \+ make_interval\(days => coalesce\(v_grace_days, 7\)\)/);
  assert.match(migration, /grant execute on function public\.extend_school_subscription_trial\(uuid, timestamptz\)\s+to authenticated/);
  assert.match(migration, /revoke all on function public\.extend_school_subscription_trial\(uuid, timestamptz\)\s+from public, anon/);
});

test("platform dashboard has no unpaid annual extension path", () => {
  assert.doesNotMatch(dashboard, /extendSubscription|subscriptionExtensions|تمديد الاشتراك/);
  assert.match(dashboard, /rpc\("extend_school_subscription_trial"/);
  assert.match(dashboard, /rpc\("record_subscription_payment_and_renew"/);
  assert.doesNotMatch(dashboard, /from\("school_subscriptions"\)\s*\.update\(\{\s*trial_ends_at/);
});
