import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [foundation, reporting, bootstrap, client, page] = await Promise.all([
  read("supabase/047_treasury_and_other_income_foundation.sql"),
  read("supabase/048_treasury_workspace_and_reporting.sql"),
  read("supabase/049_treasury_bootstrap_scope_hardening.sql"),
  read("client/src/lib/treasury.ts"),
  read("client/src/pages/Treasury.tsx"),
]);
const sql = foundation + reporting + bootstrap;

test("derives balances from immutable posted movements", () => {
  assert.match(foundation, /create table public\.treasury_accounts/);
  assert.match(foundation, /create table public\.treasury_movements/);
  assert.doesNotMatch(foundation, /treasury_accounts[\s\S]{0,1500}\bbalance\s+numeric/i);
  assert.match(foundation, /sum\(case m\.direction when 'in' then m\.amount else -m\.amount end\)/);
  assert.match(foundation, /movement_type = 'opening_balance'/);
  assert.doesNotMatch(foundation, /delete from public\.treasury_/i);
});

test("keeps internal transfers balanced and outside business source totals", () => {
  assert.match(foundation, /'transfer_out'/);
  assert.match(foundation, /'transfer_in'/);
  assert.match(foundation, /values[\s\S]*target_from_account_id, 'out', 'transfer_out'[\s\S]*target_to_account_id, 'in', 'transfer_in'/);
  assert.match(foundation, /source_type in \('student_payment', 'other_income', 'expense', 'payroll_payment'\)/);
  assert.doesNotMatch(foundation, /source_type in \([^)]*treasury_transfer[^)]*student_payment/i);
});

test("links business transactions to treasury without turning movements into duplicate income or expense", () => {
  assert.match(foundation, /alter table public\.payments[\s\S]*treasury_account_id/);
  assert.match(foundation, /alter table public\.expenses[\s\S]*treasury_account_id/);
  assert.match(foundation, /alter table public\.payroll_payments[\s\S]*treasury_account_id/);
  assert.match(foundation, /'student_payment'/);
  assert.match(foundation, /'other_income'/);
  assert.match(foundation, /'expense'/);
  assert.match(foundation, /'payroll_payment'/);
  assert.match(reporting, /Business income\/expense totals remain sourced from their business tables/);
});

test("makes other income first-class and reversible", () => {
  assert.match(foundation, /create table public\.other_income/);
  assert.match(foundation, /category in \('donation', 'grant_subsidy', 'activity', 'rent_asset', 'other'\)/);
  assert.match(foundation, /create or replace function public\.create_other_income/);
  assert.match(foundation, /create or replace function public\.reverse_other_income/);
  assert.match(foundation, /status = 'reversed'/);
});

test("uses finance scopes and lets branch finance bootstrap an empty treasury", () => {
  assert.match(foundation, /has_school_permission\(target_school_id, 'finance\.manage'\)/);
  assert.match(foundation, /has_branch_permission\(target_school_id, target_account_branch_id, 'finance\.manage'\)/);
  assert.match(bootstrap, /from public\.branches b/);
  assert.match(bootstrap, /get_treasury_bootstrap/);
});

test("keeps raw treasury tables closed and browser mutations RPC-only", () => {
  assert.match(foundation, /revoke all on public\.treasury_accounts, public\.other_income, public\.treasury_transfers/);
  assert.doesNotMatch(client + page, /\.from\("treasury_/);
  assert.doesNotMatch(client + page, /\.from\("other_income"/);
  assert.match(client, /rpc\("create_treasury_account"/);
  assert.match(client, /rpc\("create_other_income"/);
  assert.match(client, /rpc\("record_treasury_transfer"/);
  assert.doesNotMatch(client + page, /service_role/i);
});

test("provides account lifecycle, reversals, adjustments and Arabic treasury UI", () => {
  assert.match(foundation, /status in \('active', 'inactive', 'archived'\)/);
  assert.match(foundation, /TREASURY_ACCOUNT_NONZERO_BALANCE/);
  assert.match(foundation, /reverse_treasury_transfer/);
  assert.match(reporting, /record_treasury_adjustment/);
  assert.match(page, /الخزينة والحسابات/);
  assert.match(page, /الإيرادات غير الطلابية/);
  assert.match(page, /التحويلات الداخلية/);
  assert.match(page, /dir="rtl"/);
});
