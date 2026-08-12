import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [migration, hardening, client, historyClient, page, historyPage, app, nav, reports] = await Promise.all([
  read("supabase/043_payroll_foundation.sql"),
  read("supabase/044_payroll_hardening_and_history.sql"),
  read("client/src/lib/payroll.ts"),
  read("client/src/lib/payroll-history.ts"),
  read("client/src/pages/Payroll.tsx"),
  read("client/src/pages/PayrollHistory.tsx"),
  read("client/src/App.tsx"),
  read("client/src/components/FinanceNavigation.tsx"),
  read("client/src/lib/financial-reports.ts"),
]);

test("adds effective-dated payroll snapshots and reversible actual payments", () => {
  assert.match(migration, /create table public\.payroll_compensation_profiles/);
  assert.match(migration, /effective_from date not null/);
  assert.match(migration, /PAYROLL_COMPENSATION_PERIOD_OVERLAP/);
  assert.match(migration, /create table public\.payroll_periods/);
  assert.match(migration, /create table public\.payroll_entries/);
  assert.match(migration, /generated always as[\s\S]*base_amount \+ additions - deductions - advances/);
  assert.match(migration, /create table public\.payroll_payments/);
  assert.match(migration, /status text not null default 'completed'/);
  assert.match(migration, /reverse_payroll_payment/);
  assert.doesNotMatch(migration + hardening, /delete from public\.payroll_/i);
});

test("keeps payroll raw tables closed and browser access RPC-only", () => {
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on public\.payroll_compensation_profiles[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_payroll_workspace/);
  assert.match(migration, /grant execute on function public\.record_payroll_payment/);
  assert.match(hardening, /grant execute on function public\.list_payroll_history/);
  assert.doesNotMatch(client + historyClient, /\.from\("payroll_/);
  assert.match(client, /rpc\("get_payroll_workspace"/);
  assert.match(client, /rpc<string \| null>\(\s*"record_payroll_payment"/);
  assert.match(historyClient, /rpc\("list_payroll_history"/);
  assert.doesNotMatch(client + historyClient, /service_role/i);
});

test("reuses finance permissions and does not expose salary merely to payees", () => {
  assert.match(migration, /has_school_permission\(target_school_id, 'finance\.view'\)/);
  assert.match(migration, /has_school_permission\(target_school_id, 'finance\.manage'\)/);
  assert.match(migration, /has_branch_permission\(target_school_id, target_branch_id, 'finance\.view'\)/);
  assert.match(hardening, /payroll_can_view_scope\(target_school_id, target_branch_id\)/);
  assert.doesNotMatch(migration + hardening, /payroll\.view|payroll\.manage/);
});

test("prevents duplicate people, cross-scope staff overlap, and duplicate monthly payment state", () => {
  assert.match(migration, /PAYROLL_LINKED_TEACHER_USE_TEACHER_PAYEE/);
  assert.match(migration, /unique \(period_id, compensation_profile_id\)/);
  assert.match(migration, /payroll_payment_one_completed_per_entry_idx/);
  assert.match(migration, /on conflict \(period_id, compensation_profile_id\) do nothing/);
  assert.match(hardening, /on public\.payroll_compensation_profiles \(school_id, membership_id, effective_from\)/);
  assert.match(hardening, /new\.payee_kind = 'member' and p\.membership_id = new\.membership_id/);
});

test("uses a strict draft approve pay close lifecycle", () => {
  assert.match(migration, /status in \('draft', 'approved', 'closed', 'cancelled'\)/);
  assert.match(migration, /PAYROLL_ENTRY_NOT_EDITABLE/);
  assert.match(migration, /PAYROLL_ENTRY_NOT_PAYABLE/);
  assert.match(migration, /PAYROLL_PERIOD_HAS_UNSETTLED_ENTRIES/);
  assert.match(page, /اعتماد المسير/);
  assert.match(page, /عكس الدفع/);
  assert.match(page, /إغلاق المسير/);
});

test("integrates payroll into Finance without duplicating ordinary expenses", () => {
  assert.match(app, /path="\/finance\/payroll"/);
  assert.match(app, /path="\/finance\/payroll\/history"/);
  assert.match(nav, /label: "الرواتب"/);
  assert.match(nav, /label: "سجل الأجور"/);
  assert.match(reports, /rpc\("list_payroll_report_payments"/);
  assert.match(reports, /outflowTotal = roundCurrency\(expenseTotal \+ payrollTotal\)/);
  assert.match(reports, /netFlow: roundCurrency\(collectedTotal - outflowTotal\)/);
  assert.doesNotMatch(client + page, /\.from\("expenses"\)|\.insert\([^)]*expenses/);
});

test("provides bounded Arabic RTL person-level payroll history", () => {
  assert.match(hardening, /target_limit integer default 100/);
  assert.match(hardening, /target_limit is null or target_limit not between 1 and 500/);
  assert.match(historyPage, /dir="rtl"/);
  assert.match(historyPage, /سجل الأجور/);
  assert.match(historyPage, /دفعات معكوسة محفوظة/);
  assert.match(historyPage, /كل المستفيدين/);
});

test("keeps payroll Arabic RTL and supports teacher and administrative staff", () => {
  assert.match(page, /dir="rtl"/);
  assert.match(page, /رواتب المعلمين والإداريين/);
  assert.match(page, /المعلم \/ الإداري/);
  assert.match(page, /الزيادات − الخصومات − السلف/);
  assert.match(migration, /payee_kind in \('teacher', 'member'\)/);
});
