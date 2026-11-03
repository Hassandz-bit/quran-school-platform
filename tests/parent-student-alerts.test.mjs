import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");

test("guardian student page reuses the severity summary with only guardian-scoped academic records", async () => {
  const [page, client] = await Promise.all([
    read("client/src/pages/ParentStudent.tsx"),
    read("client/src/lib/parent-portal.ts"),
  ]);
  assert.match(page, /StudentAlertSummary attendance=\{data\.attendanceRecords\} memorization=\{data\.memorizationRecords\}/);
  assert.match(page, /fetchParentStudentAcademic\(/);
  assert.match(client, /list_my_guardian_student_attendance/);
  assert.match(client, /list_my_guardian_student_memorization/);
  assert.doesNotMatch(page, /fetchStudent360|fetchStudentAttendanceRecords/);
});

test("guardian severity view distinguishes excused absence and does not infer risk without history", async () => {
  const component = await read("client/src/components/StudentAlertSummary.tsx");
  assert.match(component, /item\.status === "absent"/);
  assert.match(component, /excused > 0 \? "info"/);
  assert.match(component, /لا توجد سجلات حضور كافية/);
  assert.match(component, /لا توجد سجلات حفظ كافية/);
});
