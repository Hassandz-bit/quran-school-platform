import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [app, route, page, attendanceData, dashboard, migration, syncMigration] =
  await Promise.all([
    read("client/src/App.tsx"),
    read("client/src/components/AttendanceRoute.tsx"),
    read("client/src/pages/Attendance.tsx"),
    read("client/src/lib/attendance.ts"),
    read("client/src/pages/Dashboard.tsx"),
    read("supabase/013_attendance_module.sql"),
    read("supabase/084_attendance_transactional_sync.sql"),
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

test("routes attendance writes through the authenticated permission-checked transaction", () => {
  const saveStart = attendanceData.indexOf("export async function saveAttendance");
  assert.ok(saveStart >= 0);
  assert.match(attendanceData.slice(saveStart), /client\.rpc\("save_attendance_batch"/);
  assert.match(syncMigration, /public\.can_access_attendance_class\([\s\S]*'attendance\.manage'/);
  assert.match(syncMigration, /grant execute on function public\.save_attendance_batch[\s\S]*to authenticated/i);
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
    /Promise\.all\([\s\S]*canAccessAttendanceClass\([\s\S]*?"attendance\.view"/
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

test("loads a previously recorded session and its exact records including concurrency version", () => {
  assert.match(
    attendanceData,
    /\.from\("attendance_sessions"\)[\s\S]*?\.eq\("session_date", sessionDate\)[\s\S]*?\.maybeSingle\(\)/
  );
  assert.match(
    attendanceData,
    /\.from\("attendance_records"\)[\s\S]*?\.select\("id, student_id, status, arrival_time, note, updated_at"\)[\s\S]*?\.eq\("session_id", session\.id\)/
  );
  assert.match(attendanceData, /baseUpdatedAt: record\?\.updated_at \?\? null/);
  assert.match(page, /تم تحميل جلسة مسجلة لهذا التاريخ/);
});

test("creates a single session inside the transactional attendance RPC", () => {
  assert.match(syncMigration, /insert into public\.attendance_sessions[\s\S]*on conflict \(class_id, session_date\) do nothing/i);
  assert.match(syncMigration, /for update/i);
  assert.match(migration, /constraint attendance_sessions_class_date_unique\s+unique \(class_id, session_date\)/);
});

test("uses one transactional RPC and does not expose direct attendance writes to the client", () => {
  assert.match(attendanceData, /client\.rpc\("save_attendance_batch"/);
  assert.doesNotMatch(attendanceData, /\.from\("attendance_records"\)[\s\S]*?\.insert\(/);
  assert.doesNotMatch(attendanceData, /\.from\("attendance_records"\)[\s\S]*?\.update\(/);
  assert.match(syncMigration, /insert into public\.attendance_records/i);
  assert.match(syncMigration, /update public\.attendance_records/i);
  assert.doesNotMatch(attendanceData, /\.delete\(/);
});

test("validates the roster and class permissions inside the server transaction", () => {
  assert.match(syncMigration, /public\.can_access_attendance_class\([\s\S]*'attendance\.manage'/i);
  assert.match(syncMigration, /student\.status = 'active'/i);
  assert.match(syncMigration, /ATTENDANCE_ROSTER_CHANGED/);
  assert.match(syncMigration, /ATTENDANCE_RECORD_CONFLICT/);
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
