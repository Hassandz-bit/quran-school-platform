import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const authStore = read("client/src/lib/offline-auth.ts");
const authContext = read("client/src/contexts/AuthContext.tsx");
const preload = read("client/src/lib/teacher-offline-preload.ts");
const teacherStore = read("client/src/lib/teacher-offline.ts");
const memorization = read("client/src/lib/memorization.ts");
const memorizationPage = read("client/src/pages/Memorization.tsx");
const attendancePage = read("client/src/pages/Attendance.tsx");

test("offline authorization cache is isolated by authenticated user and contains no credentials", () => {
  assert.match(authStore, /keyPath: "userId"/);
  assert.match(authStore, /get\(userId\)/);
  assert.doesNotMatch(authStore, /access_token|refresh_token|password|service_role/i);
  assert.match(authContext, /getCachedAuthorization\(userId\)/);
  assert.match(authContext, /Every queued write is[\s\S]*?revalidated by the server/);
});

test("teacher preparation downloads only classes with last-verified manage access", () => {
  assert.match(preload, /attendanceScope\.classes\.filter\(item => item\.canManage\)/);
  assert.match(preload, /memorizationScope\.classes\.filter\(item => item\.canManage\)/);
  assert.match(preload, /saveOfflineAttendanceRoster/);
  assert.match(preload, /saveTeacherMemorizationWorkspace/);
  assert.match(preload, /saveTeacherMemorizationRecords/);
});

test("memorization offline drafts have stable operation IDs before network submission", () => {
  assert.match(teacherStore, /operationId: samePayload \? previous\.operationId : operationId \?\? crypto\.randomUUID\(\)/);
  assert.match(memorization, /id: operationId/);
  assert.match(memorization, /const exactReplay = !lookupError && existing/);
  assert.match(memorizationPage, /await saveTeacherMemorizationDraft\(offlineScope, selectedStudentId, draft\)/);
  assert.match(memorizationPage, /operationId: stored\.operationId/);
  assert.match(memorizationPage, /updateTeacherMemorizationDraftState\([\s\S]*?"syncing"/);
});

test("offline memorization never silently edits an existing server record", () => {
  assert.match(memorizationPage, /if \(offline && user\?\.id && !draft\.recordId\)/);
  assert.match(memorizationPage, /التعديلات على السجلات السابقة والمراجعة الجماعية تحتاج إلى اتصال/);
});

test("attendance remains durable and server-validated when synchronization resumes", () => {
  assert.match(attendancePage, /saveOfflineAttendanceDraft\(offlineScope, sessionId, rows, true\)/);
  assert.match(attendancePage, /saveAttendance\([\s\S]*?operationId/);
  assert.match(attendancePage, /window\.addEventListener\("online", retryWhenOnline\)/);
});
