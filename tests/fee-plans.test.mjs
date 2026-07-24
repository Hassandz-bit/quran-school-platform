import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildFeePlanInsert,
  buildFeePlanUpdate,
  canManageFeePlan,
  normalizeFeePlanCode,
  validateFeePlanForm,
} from "../client/src/lib/fee-plans.ts";

const validValues = {
  branchId: "",
  name: "الخطة الشهرية",
  code: "monthly_01",
  billingCycle: "monthly",
  amount: "1500.50",
  dueDay: "10",
  status: "active",
  description: "رسوم الدراسة الشهرية",
};

const dataSource = await readFile(
  new URL("../client/src/lib/fee-plans.ts", import.meta.url),
  "utf8"
);
const pageSource = await readFile(
  new URL("../client/src/pages/FeePlans.tsx", import.meta.url),
  "utf8"
);
const appSource = await readFile(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);

test("normalizes a fee-plan insert to the database constraints", () => {
  const payload = buildFeePlanInsert("school-1", validValues);

  assert.deepEqual(payload, {
    school_id: "school-1",
    branch_id: null,
    name: "الخطة الشهرية",
    code: "MONTHLY_01",
    billing_cycle: "monthly",
    amount: 1500.5,
    currency: "DZD",
    due_day: 10,
    status: "active",
    description: "رسوم الدراسة الشهرية",
  });
  assert.equal(normalizeFeePlanCode(" monthly_01 "), "MONTHLY_01");
});

test("keeps school and branch identity out of fee-plan updates", () => {
  const payload = buildFeePlanUpdate({
    ...validValues,
    branchId: "branch-1",
  });

  assert.equal("school_id" in payload, false);
  assert.equal("branch_id" in payload, false);
  assert.equal(payload.code, "MONTHLY_01");
});

test("validates the actual fee-plan check constraints", () => {
  assert.deepEqual(validateFeePlanForm(validValues), {});

  const errors = validateFeePlanForm({
    ...validValues,
    name: "أ",
    code: "رمز غير صالح",
    amount: "-1",
    dueDay: "29",
  });

  assert.ok(errors.name);
  assert.ok(errors.code);
  assert.ok(errors.amount);
  assert.ok(errors.dueDay);
});

test("applies management permission to the exact fee-plan scope", () => {
  const access = {
    canView: true,
    canManage: true,
    canManageSchoolWide: false,
    manageableBranchIds: ["branch-1"],
  };

  assert.equal(canManageFeePlan({ branch_id: "branch-1" }, access), true);
  assert.equal(canManageFeePlan({ branch_id: "branch-2" }, access), false);
  assert.equal(canManageFeePlan({ branch_id: null }, access), false);
});

test("uses live fee_plans data with column-safe writes and no deletion", () => {
  assert.match(dataSource, /\.from\("fee_plans"\)/);
  assert.match(dataSource, /\.insert\(buildFeePlanInsert/);
  assert.match(dataSource, /\.update\(buildFeePlanUpdate/);
  assert.match(dataSource, /\.update\(\{ status: "archived" \}\)/);
  assert.equal(dataSource.includes(".delete("), false);
  assert.equal(dataSource.includes('select("*")'), false);
});

test("provides search, filters, loading, error, empty, and form states", () => {
  assert.match(pageSource, /searchQuery/);
  assert.match(pageSource, /statusFilter/);
  assert.match(pageSource, /cycleFilter/);
  assert.match(pageSource, /branchFilter/);
  assert.match(pageSource, /loadState === "loading"/);
  assert.match(pageSource, /loadState === "error"/);
  assert.match(pageSource, /pageData\.plans\.length === 0/);
  assert.match(pageSource, /<form onSubmit=\{handleSubmit\}/);
  assert.match(appSource, /path="\/finance\/fee-plans"/);
});
