import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/056_manual_notifications_and_staff_directory.sql");
const payrollStaffMigration = read("supabase/057_payroll_staff_job_management.sql");
const payrollStaffLockdown = read("supabase/058_payroll_staff_legacy_rpc_lockdown.sql");
const employeeMigration = read("supabase/059_staff_payroll_module.sql");
const notifications = read("client/src/lib/notifications.ts");
const composer = read("client/src/components/NotificationComposerDialog.tsx");
const staff = read("client/src/lib/staff.ts");
const employeePage = read("client/src/pages/Employees.tsx");
const employeeClient = read("client/src/lib/employees.ts");
const payrollPage = read("client/src/pages/Payroll.tsx");
const membersPage = read("client/src/pages/Members.tsx");
const focusNotes = read("client/src/components/MemorizationFocusNotes.tsx");
const memorization = read("client/src/lib/memorization.ts");

test("manual sends are campaign-audited, permission checked and recipient bounded", () => {
  assert.match(migration, /create table public\.notification_campaigns/i);
  assert.match(migration, /'notifications\.send'/);
  assert.match(migration, /public\.can_send_school_notifications\(target_school_id\)/);
  assert.match(migration, /cardinality\(normalized_recipient_ids\).*1 and 500/is);
  assert.match(migration, /public\.list_manual_notification_recipients\(target_school_id\)/);
  assert.match(migration, /'manual_campaign'/);
  assert.match(migration, /revoke all on function public\.create_app_notification_internal[\s\S]*from authenticated/i);
});

test("composer supports individual, group, audience, branch, class and explicit people", () => {
  for (const token of ["individual", "group", "custom", "audience", "branch", "class"]) {
    assert.match(composer, new RegExp(`"${token}"`));
  }
  assert.match(composer, /uniqueResolvedIds\.length/);
  assert.match(composer, /عدد المستلمين قبل الإرسال/);
  assert.match(composer, /sendManualNotification/);
  assert.match(notifications, /rpc\("send_manual_app_notification"/);
  assert.match(notifications, /rpc\("list_manual_notification_recipients"/);
});

test("staff titles are independent from authorization roles and allow a custom job", () => {
  assert.match(migration, /create table public\.staff_positions/i);
  assert.match(migration, /job title describes employment and never grants application permissions/i);
  for (const job of ["manager", "deputy_manager", "bursar", "teacher", "guard", "cleaner", "driver", "other"]) {
    assert.match(migration, new RegExp(`'${job}'`));
    assert.match(staff, new RegExp(`\\b${job}\\b`));
  }
  assert.match(migration, /job_code = 'other'.*custom_job_title/is);
  assert.match(employeePage, /الوظيفة/);
  assert.match(employeePage, /مسمى آخر/);
  assert.match(employeePage, /الوظيفة تصف عمل الموظف فقط ولا تمنحه صلاحيات في النظام/);
  assert.doesNotMatch(employeePage, /membership_roles|role_permissions/);
});

test("employees are an independent module connected to Finance payroll", () => {
  assert.doesNotMatch(payrollPage, /PayrollStaffDialog/);
  assert.doesNotMatch(membersPage, /PayrollStaffDialog|StaffManagementDialog/);
  assert.match(employeeMigration, /create table public\.employees/);
  assert.match(employeeMigration, /Employees do not require login accounts/i);
  assert.match(employeeMigration, /public\.payroll_can_view_scope\(target_school_id, target_branch_id\)/);
  assert.match(employeeMigration, /public\.payroll_can_manage_scope\(target_school_id, target_branch_id\)/);
  assert.match(employeeMigration, /create or replace function public\.create_employee_compensation/);
  assert.match(employeeClient, /rpc\("list_staff_employees"/);
  assert.match(employeeClient, /rpc\("save_staff_employee"/);
  assert.match(payrollPage, /candidate\.roleLabel/);
  for (const legacyFunction of ["list_school_staff", "upsert_staff_position", "deactivate_staff_position"]) {
    assert.match(
      payrollStaffLockdown,
      new RegExp(`revoke all on function public\\.${legacyFunction}[\\s\\S]*?from public, anon, authenticated`, "i")
    );
    assert.doesNotMatch(employeeClient, new RegExp(`rpc\\("${legacyFunction}"`));
  }
});

test("new recitation and multiple notes remain linked to one memorization record", () => {
  assert.match(memorization, /new_memorization: "التسميع الجديد"/);
  assert.match(focusNotes, /setSessionNotes\(notes\.filter\(note => note\.sourceRecordId === props\.sourceRecordId\)\)/);
  assert.match(focusNotes, /ملاحظات جلسة التسميع الحالية/);
  assert.match(focusNotes, /حفظ وإضافة ملاحظة أخرى/);
  assert.match(focusNotes, /setShowForm\(Boolean\(props\.sourceRecordId\)\)/);
});
