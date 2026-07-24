import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildChargeBalances,
  buildPaymentInsert,
  buildPaymentLedgerRows,
  getOpenChargeBalances,
  paymentMethods,
  validatePaymentForm,
} from "../client/src/lib/payments.ts";

const paymentsSource = await readFile(
  new URL("../client/src/lib/payments.ts", import.meta.url),
  "utf8"
);
const paymentsPageSource = await readFile(
  new URL("../client/src/pages/Payments.tsx", import.meta.url),
  "utf8"
);
const migrationSource = await readFile(
  new URL(
    "../supabase/011_payments_manage_visibility.sql",
    import.meta.url
  ),
  "utf8"
);
const appSource = await readFile(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);
const financeDashboardSource = await readFile(
  new URL("../client/src/pages/FinanceDashboard.tsx", import.meta.url),
  "utf8"
);

const charge = {
  id: "charge-1",
  branch_id: "branch-1",
  student_id: "student-1",
  fee_plan_id: null,
  description: "رسوم شهرية",
  original_amount: 1200,
  net_amount: 1000,
  due_date: "2026-07-01",
  status: "partially_paid",
};

const completedPayment = {
  id: "payment-1",
  school_id: "school-1",
  branch_id: "branch-1",
  student_id: "student-1",
  charge_id: "charge-1",
  amount: 300,
  payment_method: "cash",
  payment_date: "2026-07-20",
  reference_number: null,
  notes: null,
  status: "completed",
  created_at: "2026-07-20T10:00:00Z",
};

test("calculates paid and remaining amounts from completed payments only", () => {
  const balances = buildChargeBalances(
    [charge],
    [
      completedPayment,
      { ...completedPayment, id: "payment-2", amount: 200, status: "reversed" },
    ]
  );
  assert.equal(balances[0].paid, 300);
  assert.equal(balances[0].remaining, 700);
});

test("shows paid previously without counting the current completed payment", () => {
  const rows = buildPaymentLedgerRows(
    [charge],
    [
      completedPayment,
      { ...completedPayment, id: "payment-2", amount: 200 },
    ]
  );
  assert.equal(rows[0].paidPreviously, 200);
  assert.equal(rows[0].remaining, 500);
});

test("offers only pending or partially paid charges with a balance", () => {
  const result = getOpenChargeBalances(
    [
      charge,
      { ...charge, id: "waived", status: "waived" },
      { ...charge, id: "cancelled", status: "cancelled" },
      { ...charge, id: "paid", status: "paid" },
    ],
    [completedPayment]
  );
  assert.deepEqual(result.map(item => item.charge.id), ["charge-1"]);
});

test("rejects an overpayment before relying on the database trigger", () => {
  const errors = validatePaymentForm(
    {
      studentId: "student-1",
      chargeId: "charge-1",
      amount: "701",
      paymentMethod: "cash",
      paymentDate: "2026-07-24",
      referenceNumber: "",
      notes: "",
    },
    { charge, paid: 300, remaining: 700 }
  );
  assert.match(errors.amount, /الرصيد المتبقي/);
});

test("supports exactly the database payment methods", () => {
  assert.deepEqual(paymentMethods, [
    "cash",
    "bank_transfer",
    "postal",
    "cheque",
    "other",
  ]);
});

test("builds a tenant and charge bound payment insert", () => {
  const payload = buildPaymentInsert(
    "school-1",
    { charge, paid: 300, remaining: 700 },
    {
      studentId: "student-1",
      chargeId: "charge-1",
      amount: "700",
      paymentMethod: "postal",
      paymentDate: "2026-07-24",
      referenceNumber: " CCP-42 ",
      notes: " دفعة كاملة ",
    }
  );
  assert.deepEqual(payload, {
    school_id: "school-1",
    branch_id: "branch-1",
    student_id: "student-1",
    charge_id: "charge-1",
    amount: 700,
    payment_method: "postal",
    payment_date: "2026-07-24",
    reference_number: "CCP-42",
    notes: "دفعة كاملة",
  });
});

test("uses the secure finance student directory and explicit selects", () => {
  assert.match(paymentsSource, /rpc\("list_finance_students"/);
  assert.equal(paymentsSource.includes('.from("students")'), false);
  assert.equal(paymentsSource.includes('.select("*")'), false);
  assert.equal(paymentsSource.includes(".delete("), false);
  assert.equal(paymentsSource.includes("service_role"), false);
});

test("reversal changes status without editing completed payment amounts", () => {
  assert.match(
    paymentsSource,
    /\.update\(\{ status: "reversed" \}\)/
  );
  assert.equal(paymentsPageSource.includes("تعديل مبلغ"), false);
  assert.match(paymentsPageSource, /عكس الدفعة/);
});

test("provides every required payment state and filter", () => {
  for (const marker of [
    "loading",
    "forbidden",
    "error",
    "لا توجد دفعات",
    "studentFilter",
    "branchFilter",
    "methodFilter",
    "statusFilter",
    "dateFrom",
    "dateTo",
  ]) {
    assert.match(paymentsPageSource, new RegExp(marker));
  }
});

test("links the payments route from the finance dashboard", () => {
  assert.match(appSource, /path="\/finance\/payments"/);
  assert.match(financeDashboardSource, /\/finance\/payments/);
});

test("the manage visibility migration is narrow and keeps RLS authoritative", () => {
  assert.match(migrationSource, /payments_select_manage_authorized/);
  assert.match(migrationSource, /finance\.manage/);
  assert.match(migrationSource, /for select to authenticated/);
  assert.equal(/\bgrant\b/i.test(migrationSource), false);
  assert.equal(/\bdelete\b/i.test(migrationSource), false);
});
