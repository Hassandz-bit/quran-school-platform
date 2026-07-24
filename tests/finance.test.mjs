import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildFinanceDashboardData,
  formatDzd,
} from "../client/src/lib/finance.ts";

const financeSource = await readFile(
  new URL("../client/src/lib/finance.ts", import.meta.url),
  "utf8"
);
const financePageSource = await readFile(
  new URL("../client/src/pages/FinanceDashboard.tsx", import.meta.url),
  "utf8"
);

test("calculates the finance summary from active accounting rows", () => {
  const result = buildFinanceDashboardData(
    [
      { id: "charge-1", net_amount: "1500.50", status: "pending" },
      { id: "charge-2", net_amount: 700, status: "paid" },
      { id: "charge-3", net_amount: 500, status: "waived" },
      { id: "charge-4", net_amount: 400, status: "cancelled" },
    ],
    [
      { id: "payment-1", amount: "900.50", status: "completed" },
      { id: "payment-2", amount: 200, status: "reversed" },
    ],
    [
      { id: "expense-1", amount: "300", status: "recorded" },
      { id: "expense-2", amount: 100, status: "cancelled" },
    ],
    { canView: true, canManage: false }
  );

  assert.equal(result.dueFees, 2200.5);
  assert.equal(result.collected, 900.5);
  assert.equal(result.remaining, 1300);
  assert.equal(result.expenses, 300);
  assert.equal(result.hasData, true);
  assert.equal(result.canManage, false);
});

test("returns a complete zero summary for an empty finance module", () => {
  const result = buildFinanceDashboardData(
    [],
    [],
    [],
    { canView: true, canManage: true }
  );

  assert.deepEqual(
    {
      dueFees: result.dueFees,
      collected: result.collected,
      remaining: result.remaining,
      expenses: result.expenses,
      hasData: result.hasData,
    },
    {
      dueFees: 0,
      collected: 0,
      remaining: 0,
      expenses: 0,
      hasData: false,
    }
  );
});

test("never reports a negative remaining balance", () => {
  const result = buildFinanceDashboardData(
    [{ id: "charge-1", net_amount: 100, status: "paid" }],
    [{ id: "payment-1", amount: 150, status: "completed" }],
    [],
    { canView: true, canManage: true }
  );

  assert.equal(result.remaining, 0);
});

test("formats monetary values in Algerian dinars", () => {
  const formatted = formatDzd(1250);
  assert.match(formatted, /1[.\s٬]?250/);
  assert.match(formatted, /(DZD|د\.ج)/);
});

test("checks finance permissions and never reads students directly", () => {
  assert.match(financeSource, /has_school_permission/);
  assert.match(financeSource, /has_branch_permission/);
  assert.equal(financeSource.includes('.from("students")'), false);
});

test("the first finance page contains no data-entry forms", () => {
  assert.equal(financePageSource.includes("<form"), false);
  assert.equal(financePageSource.includes(".insert("), false);
  assert.equal(financePageSource.includes(".update("), false);
});
