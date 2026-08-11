import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/039_registration_waitlist_foundation.sql");
const crmLib = read("client/src/lib/registration-crm.ts");
const crmPage = read("client/src/pages/Registrations.tsx");

test("waitlist is a real CRM status with server-derived bounded ranking", () => {
  assert.match(migration, /'waitlisted'/);
  assert.match(migration, /waitlisted_at timestamptz/i);
  assert.match(migration, /waitlist_priority smallint/i);
  assert.match(migration, /waitlist_reason text/i);
  assert.match(migration, /desired_level text/i);
  assert.match(migration, /row_number\(\) over/i);
  assert.match(migration, /lead\.waitlist_priority asc[\s\S]*lead\.waitlisted_at asc/i);
  assert.match(migration, /limit target_limit/i);
  assert.doesNotMatch(migration, /waitlist_position\s+(?:integer|smallint|bigint)/i);
});

test("waitlist entry is atomic and cannot be created through the generic pipeline RPC", () => {
  assert.match(migration, /create or replace function public\.set_registration_lead_waitlist/i);
  assert.match(migration, /target_priority not between 1 and 3/i);
  assert.match(migration, /target_reason not in/i);
  assert.match(migration, /status = 'waitlisted'/i);
  assert.match(migration, /waitlisted_at = next_waitlisted_at/i);
  assert.match(migration, /target_status = 'waitlisted'/i);
  assert.match(crmLib, /rpc\(["']set_registration_lead_waitlist["']/);
  assert.match(crmPage, /editStatus === "waitlisted"/);
  assert.match(crmPage, /setRegistrationLeadWaitlist/);
});

test("waitlist preserves CRM authorization and does not auto-enroll students", () => {
  assert.match(migration, /public\.has_branch_permission\([\s\S]*'registrations\.manage'/i);
  assert.match(migration, /branch\.status = 'active'/i);
  assert.match(migration, /school\.status = 'active'/i);
  assert.doesNotMatch(migration, /insert into public\.students/i);
  assert.doesNotMatch(crmPage, /functions\.invoke/);
});

test("waitlist UI exposes count, rank, priority, reason and requested level bilingually", () => {
  assert.match(crmLib, /\| "waitlisted"/);
  assert.match(crmLib, /RegistrationWaitlistReason/);
  assert.match(crmLib, /waitlistRank: number \| null/);
  assert.match(crmPage, /قائمة الانتظار/);
  assert.match(crmPage, /Waitlist/);
  assert.match(crmPage, /waitlistPosition/);
  assert.match(crmPage, /waitlistReason/);
  assert.match(crmPage, /desiredLevel/);
  assert.match(crmPage, /waitlistCount/);
});

test("waitlist updates are audited separately from pipeline transitions", () => {
  assert.match(migration, /'waitlist_updated'/);
  assert.match(migration, /previous_status = 'waitlisted'[\s\S]*new_status = 'waitlisted'/i);
  assert.match(migration, /when lead_row\.status = 'waitlisted' then 'waitlist_updated'/i);
  assert.match(migration, /else 'pipeline_updated'/i);
});
