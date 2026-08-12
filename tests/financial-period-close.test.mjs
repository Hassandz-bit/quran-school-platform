import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [periodMigration, statementMigration, statementClient, periodPage, statementPage, app, nav] = await Promise.all([
  read("supabase/052_financial_period_close_and_account_reconciliation.sql"),
  read("supabase/053_financial_statements.sql"),
  read("client/src/lib/financial-statements-v2.ts"),
  read("client/src/pages/FinancialPeriodClose.tsx"),
  read("client/src/pages/FinancialStatements.tsx"),
  read("client/src/App.tsx"),
  read("client/src/components/FinanceNavigation.tsx"),
]);

test("financial close is transaction-row based, audited and reopen-only", () => {
  assert.match(periodMigration, /status in \('open', 'closing', 'closed'\)/);
  assert.match(periodMigration, /financial_period_events/);
  assert.match(periodMigration, /FINANCIAL_PERIOD_LOCKED/);
  assert.match(periodMigration, /FINANCIAL_PERIOD_RECONCILIATION_VARIANCE/);
  assert.match(periodMigration, /reopen_financial_period/);
  assert.match(periodMigration, /treasury_account_reconciliations/);
  assert.doesNotMatch(periodMigration, /mutable_balance|summary_balance/i);
});

test("financial statements use business rows for P&L and treasury only for cash", () => {
  for (const source of ["student_charges", "payments", "other_income", "expenses", "payroll_entries", "payroll_payments"]) assert.match(statementMigration, new RegExp(`public\\.${source}`));
  assert.match(statementMigration, /opening_balance/);
  assert.match(statementMigration, /internal_transfers/);
  assert.match(statementMigration, /operating_result/);
  assert.match(statementMigration, /scope_complete/);
});

test("formal statement browser access stays RPC-only and exports Arabic UTF-8 CSV", () => {
  assert.match(statementClient, /rpc\("get_financial_statement"/);
  assert.doesNotMatch(statementClient + statementPage, /\.from\(/);
  assert.match(statementClient, /"\\uFEFF"/);
  assert.match(statementClient, /"\\r\\n"/);
  assert.match(periodPage, /dir="rtl"/);
  assert.match(statementPage, /dir="rtl"/);
  assert.match(statementPage, /window\.print\(\)/);
  assert.match(statementPage, /text\/csv;charset=utf-8/);
});

test("finance routing exposes period close and formal statements", () => {
  assert.match(app, /FinancialPeriodClose/);
  assert.match(app, /FinancialStatements/);
  assert.match(app, /path="\/finance\/period-close"/);
  assert.match(app, /path="\/finance\/statements"/);
  assert.match(nav, /"إقفال الفترة"/);
  assert.match(nav, /"القوائم المالية"/);
});
