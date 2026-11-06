import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const postLogin = readFileSync(new URL("../client/src/pages/PostLoginRedirect.tsx", import.meta.url), "utf8");
const ownerRoute = readFileSync(new URL("../client/src/components/PlatformOwnerRoute.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../client/src/pages/PlatformOwnerDashboard.tsx", import.meta.url), "utf8");

test("platform owner has a separate route and is detected after normal authentication", () => {
  assert.match(app, /path="\/platform-owner"/);
  assert.match(app, /PlatformOwnerRoute/);
  assert.match(postLogin, /from\("platform_owners"\)/);
  assert.match(postLogin, /setLocation\("\/platform-owner"\)/);
});

test("platform owner route checks the server-managed owner registry for the signed-in user", () => {
  assert.match(ownerRoute, /from\("platform_owners"\)/);
  assert.match(ownerRoute, /eq\("user_id", session\.user\.id\)/);
  assert.doesNotMatch(ownerRoute, /user_metadata|raw_user_meta_data/);
});

test("dashboard uses secured owner RPCs for approval and annual renewal", () => {
  assert.match(dashboard, /rpc\("approve_school_registration"/);
  assert.match(dashboard, /rpc\("record_subscription_payment_and_renew"/);
  assert.match(dashboard, /trial_default_days/);
  assert.match(dashboard, /grace_period_days/);
  assert.match(dashboard, /platform_audit_log/);
});

test("approval and renewal handlers use the same visible defaults as their forms", () => {
  assert.match(dashboard, /const selected = approval\[request\.id\] \?\?/);
  assert.match(dashboard, /const form = renewal\[subscription\.id\] \?\?/);
  assert.match(dashboard, /plans\.find\(plan => plan\.id === defaultPlanId\)\?\.annual_price \?\? subscription\.agreed_annual_price/);
});

test("subscription plan creation exposes limits and one annual price without feature tiers", () => {
  assert.match(dashboard, /max_active_students/);
  assert.match(dashboard, /max_active_branches/);
  assert.match(dashboard, /annual_price/);
  assert.match(dashboard, /savePlan/);
  assert.match(dashboard, /togglePlan/);
  assert.match(dashboard, /extendTrial/);
  assert.doesNotMatch(dashboard, /feature_flags|feature_tier|monthly_price|quarterly_price/);
});
