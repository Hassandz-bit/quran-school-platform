import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/094_staff_attendance_and_payroll_units.sql", import.meta.url), "utf8");
const attendancePage = readFileSync(new URL("../client/src/pages/StaffAttendance.tsx", import.meta.url), "utf8");
const payroll = readFileSync(new URL("../client/src/lib/payroll.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../client/src/components/StaffPayrollNavigation.tsx", import.meta.url), "utf8");

test("staff compensation supports per-person unit rates", () => {
  assert.match(migration, /pay_unit text not null default 'month'/);
  assert.match(migration, /'session', 'day', 'hour', 'month', 'task', 'manual'/);
  assert.match(payroll, /set_payroll_compensation_unit/);
});

test("staff attendance is tenant and branch scoped with controlled RPC access", () => {
  assert.match(migration, /create table public\.staff_attendance_records/);
  assert.match(migration, /foreign key \(school_id, branch_id, teacher_id\)/);
  assert.match(migration, /public\.payroll_can_manage_scope\(target_school_id, target_branch_id\)/);
  assert.match(migration, /record_staff_attendance/);
  assert.match(migration, /update_staff_attendance/);
  assert.match(migration, /staff_attendance_history/);
  assert.match(migration, /create_employee_compensation_with_unit/);
  assert.match(migration, /create_payroll_compensation_with_unit/);
  assert.match(migration, /list_staff_attendance_records/);
  assert.match(migration, /revoke all on public\.staff_attendance_records from public, anon, authenticated/);
});

test("payroll multiplies the configured rate by recorded units", () => {
  assert.match(migration, /profile\.base_amount \* calculated\.units_count/);
  assert.match(migration, /attendance\.status in \('present', 'late', 'partial', 'excused'\)/);
  assert.match(migration, /attendance\.unit_kind = profile\.pay_unit/);
  assert.match(migration, /when profile\.pay_unit in \('month', 'manual'\) then 1::numeric/);
});

test("staff attendance is reachable from the staff workspace", () => {
  assert.match(attendancePage, /StaffPayrollNavigation currentPath="\/staff\/attendance"/);
  assert.match(app, /path="\/staff\/attendance"/);
  assert.match(navigation, /حضور الموظفين/);
});
