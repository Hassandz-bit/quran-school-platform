import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  app,
  navigation,
  navigationData,
  dashboard,
  dashboardData,
  feePlans,
  charges,
  payments,
  expenses,
  reports,
  expenseData,
  reportData,
  paymentData,
  chargeData,
  migration,
] = await Promise.all([
  read("client/src/App.tsx"),
  read("client/src/components/FinanceNavigation.tsx"),
  read("client/src/lib/finance-navigation.ts"),
  read("client/src/pages/FinanceDashboard.tsx"),
  read("client/src/lib/finance.ts"),
  read("client/src/pages/FeePlans.tsx"),
  read("client/src/pages/StudentCharges.tsx"),
  read("client/src/pages/Payments.tsx"),
  read("client/src/pages/Expenses.tsx"),
  read("client/src/pages/FinancialReports.tsx"),
  read("client/src/lib/expenses.ts"),
  read("client/src/lib/financial-reports.ts"),
  read("client/src/lib/payments.ts"),
  read("client/src/lib/student-charges.ts"),
  read("supabase/007_finance_module.sql"),
]);

const financeSources = [
  navigation,
  navigationData,
  dashboardData,
  feePlans,
  charges,
  payments,
  expenses,
  reports,
  expenseData,
  reportData,
  paymentData,
  chargeData,
].join("\n");

test("registers every finance route", () => {
  for (const route of [
    "/finance",
    "/finance/fee-plans",
    "/finance/charges",
    "/finance/payments",
    "/finance/expenses",
    "/finance/reports",
  ]) {
    assert.match(app, new RegExp(`path="${route}"`));
  }
});

test("uses one permission-aware financial navigation on every page", () => {
  const pages = [
    [dashboard, "/finance"],
    [feePlans, "/finance/fee-plans"],
    [charges, "/finance/charges"],
    [payments, "/finance/payments"],
    [expenses, "/finance/expenses"],
    [reports, "/finance/reports"],
  ];

  pages.forEach(([source, path]) => {
    assert.match(source, /FinanceNavigation/);
    assert.match(source, new RegExp(`currentPath="${path}"`));
  });
  assert.match(navigation, /aria-current/);
  assert.match(navigation, /overflow-x-auto/);
});

test("hides links according to the exact permission split", () => {
  assert.match(
    navigation,
    /label: "خطط الرسوم"[\s\S]*?visible: access\.canManageFinance/
  );
  assert.match(navigation, /visible: access\.canViewFinance/);
  assert.match(navigation, /visible: access\.canManageExpenses/);
  assert.match(
    navigation,
    /access\.canViewFinance \|\| access\.canManageExpenses/
  );
  assert.match(navigationData, /"finance\.view"/);
  assert.match(navigationData, /"finance\.manage"/);
  assert.match(navigationData, /"finance\.expenses"/);
});

test("keeps finance view and manage away from expense access", () => {
  assert.match(
    paymentData,
    /permissionCode: "finance\.view" \| "finance\.manage"/
  );
  assert.match(
    chargeData,
    /permissionCode: "finance\.view" \| "finance\.manage"/
  );
  assert.equal(expenseData.includes('"finance.view"'), false);
  assert.equal(expenseData.includes('"finance.manage"'), false);
  assert.match(expenseData, /"finance\.expenses"/);
});

test("loads dashboard datasets only when their permissions are present", () => {
  assert.match(dashboardData, /if \(access\.canView\)/);
  assert.match(dashboardData, /if \(access\.canViewExpenses\)/);
  assert.match(dashboardData, /!access\.canView && !access\.canViewExpenses/);
});

test("school admin role receives the complete finance permission set", () => {
  assert.match(migration, /\('school_admin', 'finance\.view'\)/);
  assert.match(migration, /\('school_admin', 'finance\.manage'\)/);
  assert.match(migration, /\('school_admin', 'finance\.expenses'\)/);
});

test("finance data layers retain branch-scope filtering", () => {
  assert.match(paymentData, /visibleBranchSet/);
  assert.match(chargeData, /visibleBranchSet/);
  assert.match(expenseData, /allowedBranches/);
  assert.match(reportData, /financeBranchIds/);
  assert.match(reportData, /expenseBranchIds/);
});

test("financial pages contain no unsafe data access patterns", () => {
  assert.equal(financeSources.includes('.from("students")'), false);
  assert.equal(financeSources.includes("service_role"), false);
  assert.equal(financeSources.includes('.select("*")'), false);
  assert.equal(financeSources.includes(".delete("), false);
});

test("uses the secure finance student directory where names are required", () => {
  assert.match(paymentData, /rpc\("list_finance_students"/);
  assert.match(chargeData, /rpc\("list_finance_students"/);
});

test("all finance pages retain RTL and responsive breakpoints", () => {
  for (const source of [
    dashboard,
    feePlans,
    charges,
    payments,
    expenses,
    reports,
  ]) {
    assert.match(source, /dir="rtl"/);
    assert.match(source, /(sm:|md:|lg:|xl:)/);
  }
});

test("expense reports remain inaccessible without finance.expenses", () => {
  assert.match(reportData, /if \(access\.canViewExpenses\)/);
  assert.match(reports, /!pageData\.access\.canViewExpenses/);
  assert.match(reports, /finance\.expenses/);
});

test("lazy-loads every finance page behind an Arabic suspense fallback", () => {
  for (const page of [
    "FinanceDashboard",
    "FeePlans",
    "StudentCharges",
    "Payments",
    "Expenses",
    "FinancialReports",
  ]) {
    assert.match(
      app,
      new RegExp(`lazy\\(\\(\\) => import\\("\\./pages/${page}"\\)\\)`)
    );
  }
  assert.match(app, /<Suspense fallback=\{<FinancePageFallback \/>\}>/);
  assert.match(app, /جارٍ تحميل الوحدة المالية/);
});
