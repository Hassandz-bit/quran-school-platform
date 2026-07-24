import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildStudentChargeInsert,
  buildStudentChargeUpdate,
  calculateNetAmount,
  canManageStudentCharge,
  computeDiscountAmount,
  isFeePlanAllowedForStudent,
  validateStudentChargeForm,
} from "../client/src/lib/student-charges.ts";

const student = {
  id: "student-1",
  branch_id: "branch-1",
  first_name: "ساجد",
  last_name: "محمدي",
  guardian_name: null,
  guardian_phone: null,
  status: "active",
};

const validValues = {
  studentId: "student-1",
  feePlanId: "plan-1",
  chargeType: "fee",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  description: "رسوم شهر جويلية",
  originalAmount: "1500.00",
  discountType: "percentage",
  discountValue: "10",
  discountReason: "خصم الإخوة",
  dueDate: "2026-07-28",
};

const dataSource = await readFile(
  new URL("../client/src/lib/student-charges.ts", import.meta.url),
  "utf8"
);
const pageSource = await readFile(
  new URL("../client/src/pages/StudentCharges.tsx", import.meta.url),
  "utf8"
);
const appSource = await readFile(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);
const migrationSource = await readFile(
  new URL(
    "../supabase/010_student_charge_discount_details.sql",
    import.meta.url
  ),
  "utf8"
);

test("calculates fixed and percentage discounts to DZD precision", () => {
  assert.equal(computeDiscountAmount(1500, "fixed", 125.25), 125.25);
  assert.equal(computeDiscountAmount(1500, "percentage", 10), 150);
  assert.equal(computeDiscountAmount(999.99, "percentage", 12.5), 125);
  assert.equal(calculateNetAmount(validValues), 1350);
});

test("builds a tenant and branch scoped charge with auditable discount details", () => {
  assert.deepEqual(buildStudentChargeInsert("school-1", student, validValues), {
    school_id: "school-1",
    branch_id: "branch-1",
    student_id: "student-1",
    fee_plan_id: "plan-1",
    charge_type: "fee",
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    description: "رسوم شهر جويلية",
    original_amount: 1500,
    discount_amount: 150,
    discount_value_type: "percentage",
    discount_value: 10,
    discount_reason: "خصم الإخوة",
    due_date: "2026-07-28",
  });
});

test("keeps charge identity and status out of browser updates", () => {
  const update = buildStudentChargeUpdate(validValues);
  assert.equal("school_id" in update, false);
  assert.equal("branch_id" in update, false);
  assert.equal("student_id" in update, false);
  assert.equal("status" in update, false);
});

test("normalizes no discount to zero with null audit details", () => {
  const payload = buildStudentChargeInsert("school-1", student, {
    ...validValues,
    discountType: "none",
    discountValue: "",
    discountReason: "",
  });

  assert.equal(payload.discount_amount, 0);
  assert.equal(payload.discount_value_type, null);
  assert.equal(payload.discount_value, null);
  assert.equal(payload.discount_reason, null);
});

test("validates amounts, percentage, reason, dates, and text constraints", () => {
  assert.deepEqual(validateStudentChargeForm(validValues), {});

  const errors = validateStudentChargeForm({
    ...validValues,
    studentId: "",
    description: "أ",
    originalAmount: "100",
    discountValue: "101",
    discountReason: "",
    periodEnd: "2026-06-30",
    dueDate: "",
  });

  assert.ok(errors.studentId);
  assert.ok(errors.description);
  assert.ok(errors.discountValue);
  assert.ok(errors.discountReason);
  assert.ok(errors.periodEnd);
  assert.ok(errors.dueDate);
});

test("enforces exact branch management and fee-plan scope", () => {
  const access = {
    canView: true,
    canManage: true,
    visibleBranchIds: ["branch-1", "branch-2"],
    manageableBranchIds: ["branch-1"],
  };

  assert.equal(canManageStudentCharge({ branch_id: "branch-1" }, access), true);
  assert.equal(canManageStudentCharge({ branch_id: "branch-2" }, access), false);
  assert.equal(
    isFeePlanAllowedForStudent(
      { branch_id: null, status: "active" },
      student
    ),
    true
  );
  assert.equal(
    isFeePlanAllowedForStudent(
      { branch_id: "branch-2", status: "active" },
      student
    ),
    false
  );
  assert.equal(
    isFeePlanAllowedForStudent(
      { branch_id: "branch-1", status: "archived" },
      student
    ),
    false
  );
});

test("uses the safe finance directory and never reads students directly", () => {
  assert.match(dataSource, /rpc\("list_finance_students"/);
  assert.equal(dataSource.includes('.from("students")'), false);
  assert.equal(pageSource.includes('.from("students")'), false);
  assert.equal(dataSource.includes('select("*")'), false);
});

test("uses live charges, safe administrative cancellation, and no deletion", () => {
  assert.match(dataSource, /\.from\("student_charges"\)/);
  assert.match(dataSource, /\.insert\(buildStudentChargeInsert/);
  assert.match(dataSource, /\.update\(buildStudentChargeUpdate/);
  assert.match(dataSource, /set_student_charge_administrative_status/);
  assert.equal(dataSource.includes(".delete("), false);
  assert.match(appSource, /path="\/finance\/charges"/);
});

test("provides filters and loading, error, empty, and forbidden states", () => {
  assert.match(pageSource, /searchQuery/);
  assert.match(pageSource, /branchFilter/);
  assert.match(pageSource, /statusFilter/);
  assert.match(pageSource, /planFilter/);
  assert.match(pageSource, /dueFrom/);
  assert.match(pageSource, /dueTo/);
  assert.match(pageSource, /loadState === "loading"/);
  assert.match(pageSource, /loadState === "forbidden"/);
  assert.match(pageSource, /loadState === "error"/);
  assert.match(pageSource, /pageData\.charges\.length === 0/);
});

test("migration is additive, auditable, scoped, and does not grant deletion", () => {
  assert.match(migrationSource, /add column discount_value_type text/);
  assert.match(migrationSource, /add column discount_value numeric\(12, 2\)/);
  assert.match(migrationSource, /add column discount_reason text/);
  assert.match(migrationSource, /discount_amount = case discount_value_type/);
  assert.match(migrationSource, /grant insert \(/);
  assert.match(migrationSource, /grant update \(/);
  assert.match(
    migrationSource,
    /student_charges_select_manage_authorized[\s\S]*finance\.manage/
  );
  assert.equal(/grant\s+delete/i.test(migrationSource), false);
  assert.equal(/drop\s+table/i.test(migrationSource), false);
});
