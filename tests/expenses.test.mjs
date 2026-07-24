import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildExpenseMutation,
  canEditExpense,
  expenseCategories,
  expensePaymentMethods,
  expenseStatuses,
  filterExpenses,
  validateExpenseForm,
} from "../client/src/lib/expenses.ts";

const expenseSource = await readFile(
  new URL("../client/src/lib/expenses.ts", import.meta.url),
  "utf8"
);
const expensePageSource = await readFile(
  new URL("../client/src/pages/Expenses.tsx", import.meta.url),
  "utf8"
);
const appSource = await readFile(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);
const dashboardSource = await readFile(
  new URL("../client/src/pages/FinanceDashboard.tsx", import.meta.url),
  "utf8"
);

const recordedExpense = {
  id: "expense-1",
  school_id: "school-1",
  branch_id: "branch-1",
  category: "supplies",
  description: "لوازم تعليمية",
  amount: 1500,
  expense_date: "2026-07-20",
  payment_method: "cash",
  reference_number: "REF-1",
  status: "recorded",
  notes: "دفاتر",
  created_at: "2026-07-20T10:00:00Z",
};

test("uses exactly the expense values allowed by the database", () => {
  assert.deepEqual(expenseCategories, [
    "salaries",
    "rent",
    "utilities",
    "maintenance",
    "supplies",
    "transport",
    "activities",
    "other",
  ]);
  assert.deepEqual(expensePaymentMethods, [
    "cash",
    "bank_transfer",
    "postal",
    "cheque",
    "other",
  ]);
  assert.deepEqual(expenseStatuses, ["recorded", "cancelled"]);
});

test("validates category, payment method, amount, date, and description", () => {
  const errors = validateExpenseForm({
    branchId: "",
    category: "invalid",
    description: " ",
    amount: "-10",
    expenseDate: "",
    paymentMethod: "invalid",
    referenceNumber: " ",
    notes: " ",
  });
  assert.ok(errors.category);
  assert.ok(errors.description);
  assert.ok(errors.amount);
  assert.ok(errors.expenseDate);
  assert.ok(errors.paymentMethod);
  assert.ok(errors.referenceNumber);
  assert.ok(errors.notes);
});

test("builds a school-scoped trimmed expense payload", () => {
  const payload = buildExpenseMutation({
    branchId: "",
    category: "rent",
    description: " إيجار المقر ",
    amount: "25000.50",
    expenseDate: "2026-07-24",
    paymentMethod: "postal",
    referenceNumber: " CCP-10 ",
    notes: " شهر جويلية ",
  });
  assert.deepEqual(payload, {
    branch_id: null,
    category: "rent",
    description: "إيجار المقر",
    amount: 25000.5,
    expense_date: "2026-07-24",
    payment_method: "postal",
    reference_number: "CCP-10",
    notes: "شهر جويلية",
  });
});

test("keeps cancelled expenses immutable in the interface", () => {
  const access = {
    canManageSchoolWide: false,
    manageableBranchIds: ["branch-1"],
  };
  assert.equal(canEditExpense(recordedExpense, access), true);
  assert.equal(
    canEditExpense({ ...recordedExpense, status: "cancelled" }, access),
    false
  );
  assert.equal(
    canEditExpense({ ...recordedExpense, branch_id: "branch-2" }, access),
    false
  );
});

test("filters expenses by scope, category, method, status, and date", () => {
  const rows = [
    recordedExpense,
    {
      ...recordedExpense,
      id: "expense-2",
      branch_id: null,
      category: "rent",
      payment_method: "postal",
      expense_date: "2026-06-01",
    },
  ];
  const filtered = filterExpenses(
    rows,
    [{ id: "branch-1", name: "الفرع الرئيسي", is_main: true }],
    {
      search: "تعليمية",
      category: "supplies",
      branch: "branch-1",
      status: "recorded",
      paymentMethod: "cash",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    }
  );
  assert.deepEqual(filtered.map(row => row.id), ["expense-1"]);
});

test("uses finance.expenses only and keeps RLS authoritative", () => {
  assert.match(expenseSource, /target_permission_code: "finance\.expenses"/);
  assert.equal(expenseSource.includes('"finance.view"'), false);
  assert.equal(expenseSource.includes('"finance.manage"'), false);
  assert.equal(expenseSource.includes('.select("*")'), false);
  assert.equal(expenseSource.includes(".delete("), false);
  assert.equal(expenseSource.includes("service_role"), false);
});

test("cancellation is a status update with no reactivation path", () => {
  assert.match(expenseSource, /\.update\(\{ status: "cancelled" \}\)/);
  assert.equal(expenseSource.includes('{ status: "recorded" }'), false);
  assert.match(expensePageSource, /إلغاء المصروف/);
});

test("provides the required route, navigation, and interface states", () => {
  assert.match(appSource, /path="\/finance\/expenses"/);
  assert.match(dashboardSource, /\/finance\/expenses/);
  for (const marker of [
    "loading",
    "forbidden",
    "error",
    "لا توجد مصروفات",
    "categoryFilter",
    "branchFilter",
    "statusFilter",
    "methodFilter",
    "dateFrom",
    "dateTo",
  ]) {
    assert.match(expensePageSource, new RegExp(marker));
  }
});
