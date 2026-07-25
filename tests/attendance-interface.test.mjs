import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [app, route, page, attendanceData, dashboard, migration] =
  await Promise.all([
    read("client/src/App.tsx"),
    read("client/src/components/AttendanceRoute.tsx"),
    read("client/src/pages/Attendance.tsx"),
    read("client/src/lib/attendance.ts"),
    read("client/src/pages/Dashboard.tsx"),
    read("supabase/013_attendance_module.sql"),
  ]);

const interfaceSources = [app, route, page, attendanceData, dashboard].join(
  "\n"
);

test("registers a lazy Arabic attendance route", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/pages\/Attendance"\)\)/);
  assert.match(app, /<Route path="\/attendance">/);
  assert.match(app, /<AttendanceRoute>/);
  assert.match(app, /<AttendancePageFallback \/>/);
  assert.match(app, /جارٍ تحميل وحدة الحضور/);
  assert.match(route, /dir="rtl"/);
  assert.match(page, /dir="rtl"/);
});

test("requires an authenticated school context before rendering attendance", () => {
  assert.match(route, /if \(!session\) return <Redirect to="\/login" \/>/);
  assert.match(route, /if \(!school \|\| authorizationError\)/);
  assert.match(route, /جارٍ التحقق من صلاحيات الحضور/);
});

test("models view and manage as separate attendance capabilities", () => {
  assert.match(attendanceData, /"attendance\.view"/);
  assert.match(attendanceData, /"attendance\.manage"/);
  assert.match(attendanceData, /canView: boolean/);
  assert.match(attendanceData, /canManage: boolean/);
  assert.match(
    attendanceData,
    /canManage: classAccess\.get\(row\.id\)\?\.manage === true/
  );
});

test("keeps the academic supervisor explicitly view-only", () => {
  assert.match(
    migration,
    /\('academic_supervisor', 'attendance\.view'\)/
  );
  assert.doesNotMatch(
    migration,
    /\('academic_supervisor', 'attendance\.manage'\)/
  );
  assert.match(page, /!canManageSelectedClass/);
  assert.match(page, /وضع العرض فقط/);
});

test("does not render write controls for view-only users", () => {
  assert.match(page, /\{canManageSelectedClass && rows\.length > 0 && \(/);
  assert.match(page, /canManageSelectedClass \? \(/);
  assert.match(page, /if \(!canManageSelectedClass\) return/);
  assert.match(page, /لا تُرسل الصفحة\s+أي عملية إنشاء أو تعديل/);
});

test("checks manage permission before issuing any attendance write", () => {
  const saveStart = attendanceData.indexOf(
    "export async function saveAttendance"
  );
  const permissionCheck = attendanceData.indexOf(
    '"attendance.manage"',
    saveStart
  );
  const sessionWrite = attendanceData.indexOf(
    "getOrCreateAttendanceSession(client, input)",
    saveStart
  );
  const recordWrite = attendanceData.indexOf(
    "updateExistingRecords(client, input",
    saveStart
  );

  assert.ok(saveStart >= 0);
  assert.ok(permissionCheck > saveStart);
  assert.ok(sessionWrite > permissionCheck);
  assert.ok(recordWrite > permissionCheck);
  assert.match(
    attendanceData,
    /if \(!allowed\) throw new AttendancePermissionError\(\)/
  );
});

test("filters branch and class choices to the attendance scope", () => {
  assert.match(attendanceData, /hasSchoolPermission/);
  assert.match(attendanceData, /hasBranchPermission/);
  assert.match(attendanceData, /canAccessAttendanceClass/);
  assert.match(attendanceData, /allowedBranchIds/);
  assert.match(attendanceData, /allowedClassIds/);
  assert.match(attendanceData, /\.in\("id", allowedBranchIds\)/);
  assert.match(attendanceData, /\.in\("id", allowedClassIds\)/);
  assert.match(page, /scope\.branches\.map/);
  assert.match(page, /availableClasses\.map/);
});

test("loads only active students in the exact school branch and class", () => {
  assert.match(
    attendanceData,
    /\.from\("students"\)[\s\S]*?\.select\("id, first_name, last_name"\)[\s\S]*?\.eq\("school_id", schoolId\)[\s\S]*?\.eq\("branch_id", branchId\)[\s\S]*?\.eq\("class_id", classId\)[\s\S]*?\.eq\("status", "active"\)/
  );
  assert.match(
    attendanceData,
    /await canAccessAttendanceClass\([\s\S]*?"attendance\.view"/
  );
});

test("supports every required attendance state and Arabic label", () => {
  for (const [status, label] of [
    ["present", "حاضر"],
    ["absent", "غائب"],
    ["late", "متأخر"],
    ["excused_absence", "غياب مبرر"],
  ]) {
    assert.match(attendanceData, new RegExp(`"${status}"`));
    assert.match(page, new RegExp(label));
  }
});

test("marks every student present and still allows individual changes", () => {
  assert.match(
    attendanceData,
    /export function markAllPresent[\s\S]*?status: "present"/
  );
  assert.match(page, /setRows\(current => markAllPresent\(current\)\)/);
  assert.match(page, /handleStatusChange\(row\.id, option\.value\)/);
  assert.match(page, /aria-pressed=\{selected\}/);
});

test("captures late arrival time and a bounded short note", () => {
  assert.match(page, /row\.status === "late"/);
  assert.match(page, /type="time"/);
  assert.match(page, /ملاحظة قصيرة/);
  assert.match(page, /maxLength=\{500\}/);
  assert.match(
    attendanceData,
    /row\.status === "late" && row\.arrivalTime/
  );
  assert.match(attendanceData, /row\.note\.trim\(\)\.length > 500/);
});

test("computes the four live summary counters from draft rows", () => {
  assert.match(attendanceData, /export function summarizeAttendance/);
  for (const status of [
    "present",
    "absent",
    "late",
    "excused_absence",
  ]) {
    assert.match(
      attendanceData,
      new RegExp(`${status}: 0`)
    );
    assert.match(page, new RegExp(`summary\\.${status}`));
  }
});

test("loads a previously recorded session and its exact records", () => {
  assert.match(
    attendanceData,
    /\.from\("attendance_sessions"\)[\s\S]*?\.eq\("session_date", sessionDate\)[\s\S]*?\.maybeSingle\(\)/
  );
  assert.match(
    attendanceData,
    /\.from\("attendance_records"\)[\s\S]*?\.select\("id, student_id, status, arrival_time, note"\)[\s\S]*?\.eq\("session_id", session\.id\)/
  );
  assert.match(page, /تم تحميل جلسة مسجلة لهذا التاريخ/);
});

test("creates at most one session and recovers from a concurrent duplicate", () => {
  assert.match(
    attendanceData,
    /getOrCreateAttendanceSession[\s\S]*?findAttendanceSession/
  );
  assert.match(attendanceData, /error\.code === "23505"/);
  assert.match(
    migration,
    /constraint attendance_sessions_class_date_unique\s+unique \(class_id, session_date\)/
  );
});

test("uses bounded bulk inserts and RLS-checked updates without deletes", () => {
  assert.match(attendanceData, /insertNewRecords/);
  assert.match(attendanceData, /\.insert\(inserts\)/);
  assert.match(attendanceData, /updateExistingRecords/);
  assert.match(attendanceData, /\.update\(normalizeWriteRow\(row\)\)/);
  assert.match(attendanceData, /\.select\("id"\)/);
  assert.doesNotMatch(attendanceData, /\.delete\(/);
});

test("validates the roster server-side before a bulk save", () => {
  assert.match(attendanceData, /async function verifyRoster/);
  assert.match(
    attendanceData,
    /\.eq\("school_id", input\.schoolId\)[\s\S]*?\.eq\("branch_id", input\.branchId\)[\s\S]*?\.eq\("class_id", input\.classId\)[\s\S]*?\.eq\("status", "active"\)/
  );
  assert.match(
    attendanceData,
    /allowedIds\.size !== input\.rows\.length/
  );
});

test("covers loading error empty forbidden and save-success states", () => {
  for (const text of [
    "جارٍ تحميل نطاق الحضور",
    "تعذر تحميل الحضور",
    "لا توجد صلاحية لعرض الحضور",
    "لا توجد فروع متاحة",
    "لا توجد حلقات متاحة",
    "جارٍ تحميل طلاب الحلقة",
    "لا يوجد طلاب في الحلقة",
    "تم حفظ حضور",
  ]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
});

test("is mobile-first with responsive RTL controls and a sticky save bar", () => {
  assert.match(page, /dir="rtl"/);
  assert.match(page, /grid-cols-2/);
  assert.match(page, /sm:grid-cols-4/);
  assert.match(page, /md:grid-cols-3/);
  assert.match(page, /fixed inset-x-0 bottom-0/);
  assert.match(page, /min-h-11/);
});

test("offers date branch and class filters and links attendance from dashboard", () => {
  assert.match(page, /type="date"/);
  assert.match(page, /handleBranchChange/);
  assert.match(page, /setClassId/);
  assert.match(dashboard, /path: "\/attendance"/);
});

test("contains no forbidden browser data-access patterns", () => {
  assert.equal(interfaceSources.includes('.select("*")'), false);
  assert.equal(interfaceSources.includes("service_role"), false);
  assert.equal(interfaceSources.includes(".delete("), false);
  assert.equal(interfaceSources.includes("SUPABASE_SERVICE"), false);
});
