import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildFinancialReportCsv,
  buildFinancialReports,
} from "../client/src/lib/financial-reports.ts";

const source = await readFile(
  new URL("../client/src/lib/financial-reports.ts", import.meta.url),
  "utf8"
);
const pageSource = await readFile(
  new URL("../client/src/pages/FinancialReports.tsx", import.meta.url),
  "utf8"
);
const appSource = await readFile(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);

const data = {
  branches: [{ id: "b1", name: "الفرع الرئيسي", is_main: true }],
  charges: [
    {
      id: "c1",
      branch_id: "b1",
      description: "رسوم جويلية",
      net_amount: 1000,
      due_date: "2026-07-01",
      status: "partially_paid",
    },
    {
      id: "c2",
      branch_id: "b1",
      description: "إعفاء",
      net_amount: 500,
      due_date: "2026-07-02",
      status: "waived",
    },
    {
      id: "c3",
      branch_id: "b1",
      description: "ملغى",
      net_amount: 400,
      due_date: "2026-07-03",
      status: "cancelled",
    },
  ],
  payments: [
    {
      id: "p1",
      branch_id: "b1",
      charge_id: "c1",
      amount: 300,
      payment_method: "cash",
      payment_date: "2026-07-10",
      reference_number: null,
      status: "completed",
    },
    {
      id: "p2",
      branch_id: "b1",
      charge_id: "c1",
      amount: 200,
      payment_method: "cash",
      payment_date: "2026-07-11",
      reference_number: null,
      status: "reversed",
    },
  ],
  expenses: [
    {
      id: "e1",
      branch_id: "b1",
      category: "supplies",
      description: "لوازم",
      amount: 100,
      expense_date: "2026-07-12",
      payment_method: "cash",
      reference_number: null,
      status: "recorded",
    },
    {
      id: "e2",
      branch_id: "b1",
      category: "rent",
      description: "إيجار ملغى",
      amount: 50,
      expense_date: "2026-07-13",
      payment_method: "cash",
      reference_number: null,
      status: "cancelled",
    },
  ],
  access: {
    canViewFinance: true,
    canViewExpenses: true,
    financeBranchIds: ["b1"],
    expenseBranchIds: ["b1"],
    canViewExpensesSchoolWide: false,
  },
};

const filters = {
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  branch: "all",
  chargeStatus: "all",
  paymentMethod: "all",
  expenseCategory: "all",
};

test("uses net amounts and excludes waived and cancelled charges from accruals", () => {
  const result = buildFinancialReports(data, filters, "2026-07-24");
  assert.equal(result.dueTotal, 1000);
  assert.equal(result.byChargeStatus.find(row => row.key === "waived").amount, 0);
  assert.equal(
    result.byChargeStatus.find(row => row.key === "cancelled").amount,
    0
  );
});

test("counts completed payments only and excludes reversed payments", () => {
  const result = buildFinancialReports(data, filters, "2026-07-24");
  assert.equal(result.collectedTotal, 300);
  assert.equal(result.byPaymentMethod[0].amount, 300);
});

test("counts recorded expenses only and calculates net cash flow", () => {
  const result = buildFinancialReports(data, filters, "2026-07-24");
  assert.equal(result.expenseTotal, 100);
  assert.equal(result.netFlow, 200);
});

test("calculates overdue outstanding balances after completed payments", () => {
  const result = buildFinancialReports(data, filters, "2026-07-24");
  assert.equal(result.overdue.length, 1);
  assert.equal(result.overdue[0].paid, 300);
  assert.equal(result.overdue[0].outstanding, 700);
  assert.equal(result.overdueTotal, 700);
});

test("applies current date, branch, status, method, and category filters", () => {
  const result = buildFinancialReports(
    data,
    {
      ...filters,
      branch: "b1",
      chargeStatus: "partially_paid",
      paymentMethod: "cash",
      expenseCategory: "supplies",
    },
    "2026-07-24"
  );
  assert.equal(result.charges.length, 1);
  assert.equal(result.payments.length, 2);
  assert.equal(result.expenses.length, 1);
});

test("builds branch, month, status, method, and category summaries", () => {
  const result = buildFinancialReports(data, filters, "2026-07-24");
  assert.equal(result.byBranch[0].label, "الفرع الرئيسي");
  assert.equal(result.byMonth[0].month, "2026-07");
  assert.ok(result.byChargeStatus.length > 0);
  assert.ok(result.byPaymentMethod.length > 0);
  assert.ok(result.byExpenseCategory.length > 0);
});

test("exports filtered Arabic CSV with UTF-8 BOM", () => {
  const result = buildFinancialReports(data, filters, "2026-07-24");
  const csv = buildFinancialReportCsv("charges", result, data.branches);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /رسوم جويلية/);
  assert.match(csv, /صافي المبلغ/);
});

test("keeps finance and expense report permissions independent", () => {
  assert.match(source, /"finance\.view"/);
  assert.match(source, /"finance\.manage"/);
  assert.match(source, /"finance\.expenses"/);
  assert.match(source, /if \(access\.canViewFinance\)/);
  assert.match(source, /if \(access\.canViewExpenses\)/);
});

test("uses direct RLS reads with explicit columns and no privileged bypass", () => {
  assert.equal(source.includes('.select("*")'), false);
  assert.equal(source.includes("service_role"), false);
  assert.equal(source.includes('.from("students")'), false);
  assert.equal(source.includes(".delete("), false);
});

test("provides reports route, printing, CSV, permissions, and responsive RTL", () => {
  assert.match(appSource, /path="\/finance\/reports"/);
  for (const marker of [
    "window.print",
    "buildFinancialReportCsv",
    "forbidden",
    "loading",
    "لا توجد بيانات",
    "dir=\"rtl\"",
    "finance.view",
    "finance.expenses",
  ]) {
    assert.match(pageSource, new RegExp(marker));
  }
});
