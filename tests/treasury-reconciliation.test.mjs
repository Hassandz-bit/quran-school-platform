import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [migration, client, page, app, nav] = await Promise.all([
  read("supabase/050_treasury_reconciliation_and_source_linking.sql"),
  read("client/src/lib/treasury-reconciliation.ts"),
  read("client/src/pages/TreasuryReconciliation.tsx"),
  read("client/src/App.tsx"),
  read("client/src/components/FinanceNavigation.tsx"),
]);

test("reconciles business totals against linked treasury evidence without transfers", () => {
  assert.match(migration, /business_sources as/);
  assert.match(migration, /linked_summary as/);
  assert.match(migration, /'unmatched'/);
  assert.match(migration, /source_type in \('student_payment', 'other_income', 'expense', 'payroll_payment'\)/);
  assert.doesNotMatch(migration, /business_sources as \([\s\S]*?transfer_(?:in|out)[\s\S]*?\), business_summary as/);
});

test("links only posted finance sources through exact finance manage scope", () => {
  assert.match(migration, /target_source_type not in \('student_payment', 'expense', 'payroll_payment'\)/);
  assert.match(migration, /TREASURY_LINK_SOURCE_NOT_POSTED/);
  assert.match(migration, /treasury_source_scope_can_manage/);
  assert.match(migration, /validate_treasury_account_for_transaction/);
  assert.match(migration, /set treasury_account_id = target_account_id/);
});

test("keeps reconciliation browser access RPC-only", () => {
  assert.match(client, /rpc\("get_treasury_reconciliation"/);
  assert.match(client, /rpc\("link_treasury_business_source"/);
  assert.doesNotMatch(client + page, /\.from\("payments"|\.from\("expenses"|\.from\("payroll_payments"|\.from\("treasury_/);
  assert.doesNotMatch(client + page, /service_role/i);
});

test("shows business, linked, unmatched, adjustments and account balances", () => {
  for (const marker of ["التدفقات الداخلة التجارية", "التدفقات الخارجة التجارية", "الصافي التجاري", "العمليات غير المربوطة بحساب", "إيداعات يدوية", "تحويلات داخلية", "أرصدة الحسابات"]) {
    assert.match(page, new RegExp(marker));
  }
  assert.match(page, /ربط/);
  assert.match(page, /dir="rtl"/);
});

test("registers the main treasury workspace in finance navigation and routing", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/pages\/Treasury"\)\)/);
  assert.match(app, /path="\/finance\/treasury"/);
  assert.match(nav, /"الخزينة", "\/finance\/treasury"/);
});
