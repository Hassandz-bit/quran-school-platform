import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/033_registration_crm_foundation.sql");
const crmLib = read("client/src/lib/registration-crm.ts");
const crmPage = read("client/src/pages/Registrations.tsx");
const crmRoute = read("client/src/components/RegistrationRoute.tsx");
const app = read("client/src/App.tsx");
const navigation = read("client/src/lib/app-navigation.ts");
const locale = read("client/src/lib/locale.ts");

test("registration CRM tables stay private and browser access is RPC only", () => {
  assert.match(migration, /alter table public\.registration_leads enable row level security/i);
  assert.match(migration, /alter table public\.registration_lead_events enable row level security/i);
  assert.match(migration, /revoke all on table public\.registration_leads, public\.registration_lead_events[\s\S]*authenticated/i);
  assert.doesNotMatch(crmLib, /\.from\(["']registration_(?:leads|lead_events)["']\)/);
  assert.match(crmLib, /rpc\(["']list_registration_leads["']/);
  assert.match(crmLib, /rpc\(["']create_registration_lead["']/);
  assert.match(crmLib, /rpc\(["']update_registration_lead_pipeline["']/);
});

test("registration CRM authorization is exact and branch scoped", () => {
  assert.match(migration, /'registrations\.view'/);
  assert.match(migration, /'registrations\.manage'/);
  assert.match(migration, /public\.has_branch_permission\(target_school_id, target_branch_id, 'registrations\.manage'\)/i);
  assert.match(migration, /public\.has_branch_permission\(lead\.school_id, lead\.branch_id, 'registrations\.view'\)/i);
  assert.match(migration, /\('registrar', 'registrations\.manage'\)/i);
  assert.match(migration, /\('branch_manager', 'registrations\.manage'\)/i);
  assert.doesNotMatch(migration, /\('teacher', 'registrations\.(?:view|manage)'\)/i);
  assert.match(crmRoute, /fetchRegistrationCrmAccess/);
  assert.match(crmRoute, /result\.canView/);
});

test("registration CRM is pipeline-only and cannot delete or auto-create students", () => {
  assert.match(migration, /event_type in \('created', 'pipeline_updated'\)/i);
  assert.doesNotMatch(migration, /delete from public\.registration_leads/i);
  assert.doesNotMatch(migration, /insert into public\.students/i);
  assert.doesNotMatch(crmPage, /functions\.invoke/);
  assert.doesNotMatch(crmPage, /WhatsApp|SMS/i);
});

test("registration CRM route and navigation are bilingual and V2-visible", () => {
  assert.match(app, /path="\/registrations"/);
  assert.match(app, /<RegistrationRoute>/);
  assert.match(navigation, /id: "registrations"/);
  assert.match(navigation, /path: "\/registrations"/);
  assert.match(locale, /"nav\.registrations": "طلبات التسجيل"/);
  assert.match(locale, /"nav\.registrations": "Registration CRM"/);
  assert.match(crmPage, /Registration CRM/);
  assert.match(crmPage, /طلبات التسجيل/);
});
