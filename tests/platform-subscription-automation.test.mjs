import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const migration = read("supabase/091_platform_subscription_usage_and_reminders_cron.sql");
const dashboard = read("client/src/pages/PlatformOwnerDashboard.tsx");

test("subscription expiry reminders are installed as one idempotent daily cron job", () => {
  assert.match(migration, /if not exists \(select 1 from pg_catalog\.pg_extension where extname = 'pg_cron'\)/);
  assert.match(migration, /Enable the Supabase pg_cron extension/);
  assert.match(migration, /where jobname = 'quranos-school-subscription-reminders'/);
  assert.match(migration, /cron\.unschedule\(existing_job\.jobid\)/);
  assert.match(migration, /cron\.schedule\(\s*'quranos-school-subscription-reminders',\s*'0 7 \* \* \*',\s*'select private\.generate_school_subscription_reminders\(\);'/s);
});

test("platform usage endpoint exposes aggregate counts only and checks platform-owner access", () => {
  assert.match(migration, /private\.get_platform_subscription_usage\(\)/);
  assert.match(migration, /if not public\.is_platform_owner\(\) then[\s\S]*PLATFORM_OWNER_REQUIRED/);
  assert.match(migration, /count\(\*\)::bigint as active_students/);
  assert.match(migration, /count\(\*\)::bigint as active_branches/);
  assert.match(migration, /revoke all on function private\.get_platform_subscription_usage\(\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function private\.get_platform_subscription_usage\(\) to authenticated/);
  assert.doesNotMatch(migration, /student\.(full_name|phone|address|email)/i);
});

test("platform owner dashboard filters subscriptions by real active student and branch counts", () => {
  assert.match(dashboard, /rpc\("get_platform_subscription_usage"\)/);
  assert.match(dashboard, /active_students/);
  assert.match(dashboard, /active_branches/);
  assert.match(dashboard, /studentCountFilter/);
  assert.match(dashboard, /branchCountFilter/);
  assert.match(dashboard, /value="lt">أقل من/);
  assert.match(dashboard, /value="gt">أكبر من/);
  assert.match(dashboard, /filteredSubscriptions\.map/);
  assert.match(dashboard, /setUsageAvailable\(!usageResult\.error\)/);
  assert.match(dashboard, /disabled=\{!usageAvailable/);
});

test("extending a trial also extends its grace deadline by the configured grace period", () => {
  assert.match(dashboard, /trialEndDate\.getTime\(\) \+ Number\(settings\.grace_period_days\) \* 86400000/);
  assert.match(dashboard, /rpc\("extend_school_subscription_trial"/);
});
