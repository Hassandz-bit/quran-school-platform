import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [policyMigration, calculationMigration, schedulesPage] = await Promise.all([
  read("supabase/096_staff_leave_payroll_policy.sql"),
  read("supabase/097_staff_leave_payroll_calculation.sql"),
  read("client/src/pages/StaffSchedules.tsx"),
]);

test("requires administrators to choose a payroll treatment for each new leave", () => {
  assert.match(policyMigration, /pay_treatment text not null default 'unconfigured'/);
  assert.match(policyMigration, /pay_treatment not in \('paid','unpaid','partial'\)/);
  assert.match(policyMigration, /target_paid_percentage is null or target_paid_percentage not between 0 and 100/);
  assert.match(policyMigration, /STAFF_LEAVE_PERIOD_OVERLAP/);
  assert.match(policyMigration, /policy_set_by,policy_set_at/);
  assert.match(policyMigration, /'staff_leave',saved_id,'create'/);
  assert.match(schedulesPage, /target_pay_treatment: leavePayTreatment/);
  assert.match(schedulesPage, /target_paid_percentage: leavePayTreatment === "partial"/);
  assert.match(schedulesPage, /اختر السياسة المالية/);
  assert.match(schedulesPage, /نسبة الأجر المستحق %/);
});

test("surfaces the selected payroll treatment and percentage in the leave list", () => {
  assert.match(schedulesPage, /pay_treatment: "paid" \| "unpaid" \| "partial" \| "unconfigured"/);
  assert.match(schedulesPage, /leavePayLabels\[row\.pay_treatment\]/);
  assert.match(schedulesPage, /row\.paid_percentage/);
});

test("joins duwam before reading its schedule fields in the teacher schedule query", () => {
  const classJoin = calculationMigration.indexOf("join public.classes class");
  const duwamJoin = calculationMigration.indexOf("left join public.duwams duwam");
  const timeUse = calculationMigration.indexOf("coalesce(class.start_time,duwam.start_time)");
  assert.ok(classJoin >= 0 && duwamJoin > classJoin && timeUse > duwamJoin);
});

test("calculates variable-unit leave pay from the assigned schedule", () => {
  assert.match(calculationMigration, /staff_leave_payroll_adjustment/);
  assert.match(calculationMigration, /schedule\.unit_kind=target_pay_unit/);
  assert.match(calculationMigration, /when pay_treatment='paid' then units/);
  assert.match(calculationMigration, /when pay_treatment='partial' then units\*paid_percentage\/100/);
  assert.match(calculationMigration, /leave_adjustment\.paid_leave_units/);
});

test("prorates monthly and manual compensation and prevents silent policy gaps", () => {
  assert.match(calculationMigration, /STAFF_LEAVE_PAY_POLICY_REQUIRED/);
  assert.match(calculationMigration, /STAFF_LEAVE_SCHEDULE_REQUIRED/);
  assert.match(calculationMigration, /leave_adjustment\.unpaid_leave_units\/nullif\(leave_adjustment\.scheduled_units,0\)/);
  assert.match(calculationMigration, /not exists \([\s\S]*from public\.staff_leave_periods leave/);
  assert.match(calculationMigration, /grant execute on function public\.generate_payroll_period/);
});
