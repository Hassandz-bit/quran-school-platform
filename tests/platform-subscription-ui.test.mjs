import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../client/src/App.tsx");
const registration = read("../client/src/pages/SchoolRegistration.tsx");
const subscription = read("../client/src/pages/SchoolSubscriptionPage.tsx");
const owner = read("../client/src/pages/PlatformOwnerDashboard.tsx");
const redirect = read("../client/src/pages/PostLoginRedirect.tsx");
const migration = read("../supabase/082_platform_subscriptions_foundation.sql");

test("school self-registration is reachable from login and from unassigned sign-ins", () => {
  assert.match(app, /path="\/school-registration"/);
  assert.match(app, /href="\/school-registration"/);
  assert.match(redirect, /setLocation\("\/school-registration"\)/);
  assert.match(registration, /client\.auth\.signUp/);
  assert.match(registration, /submit_school_registration_request/);
  assert.match(registration, /emailRedirectTo/);
});

test("school applications retain a draft across email confirmation and show review status", () => {
  assert.match(registration, /quranos-school-registration-draft/);
  assert.match(registration, /requestStatus\?\.status === "pending"/);
  assert.match(registration, /requestStatus\?\.status === "approved"/);
  assert.match(registration, /requestStatus\?\.status === "rejected"/);
});

test("school subscription screen shows plan, payment history, renewal requests and reminders", () => {
  assert.match(app, /path="\/subscription"/);
  assert.match(subscription, /school_subscriptions/);
  assert.match(subscription, /subscription_payments/);
  assert.match(subscription, /school_subscription_renewal_requests/);
  assert.match(subscription, /school_subscription_reminders/);
  assert.match(subscription, /isSchoolAdmin/);
});

test("platform owner can create plans, approve schools, extend trials and record renewals", () => {
  assert.match(owner, /const createPlan/);
  assert.match(owner, /const approveRequest/);
  assert.match(owner, /const extendTrial/);
  assert.match(owner, /record_subscription_payment_and_renew/);
  assert.match(owner, /rejectRenewalRequest/);
});

test("subscription financial records are visible only to the platform owner or school admin", () => {
  assert.match(migration, /school_subscriptions_read_school_or_owner[\s\S]*?public\.has_school_permission\(school_id, 'school\.update'\)/);
  assert.match(migration, /subscription_payments_read_school_or_owner[\s\S]*?public\.has_school_permission\(school_id, 'school\.update'\)/);
  assert.match(migration, /school_subscription_reminders_read_school_or_owner[\s\S]*?public\.has_school_permission\(school_id, 'school\.update'\)/);
});
