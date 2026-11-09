import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storage = readFileSync(
  new URL("../client/src/lib/attendance-offline.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../client/src/pages/Attendance.tsx", import.meta.url),
  "utf8",
);

test("offline attendance drafts use IndexedDB and are isolated by user and school scope", () => {
  assert.match(storage, /indexedDB\.open\(DATABASE_NAME, DATABASE_VERSION\)/);
  assert.match(storage, /keyPath: "key"/);
  assert.match(storage, /scope\.userId[\s\S]*scope\.schoolId[\s\S]*scope\.branchId[\s\S]*scope\.classId[\s\S]*scope\.sessionDate/);
  assert.match(storage, /operationId: string/);
  assert.match(storage, /const payloadUnchanged = existing\?\.operationPayload === operationPayload/);
  assert.match(storage, /prepareOperation[\s\S]*crypto\.randomUUID\(\)/);
  assert.match(storage, /operationPayload: prepareOperation/);
  assert.match(storage, /saveOfflineAttendanceDraft/);
  assert.match(storage, /getOfflineAttendanceDraft/);
  assert.match(storage, /deleteOfflineAttendanceDraft/);
  assert.match(storage, /DATABASE_VERSION = 2/);
  assert.match(storage, /saveOfflineAttendanceScope/);
  assert.match(storage, /saveOfflineAttendanceRoster/);
  assert.match(storage, /listOfflineAttendanceRosters/);
  assert.match(storage, /clearOfflineAttendanceForUser/);
  assert.match(storage, /AttendanceSyncState = "pending" \| "syncing" \| "conflict" \| "failed"/);
  assert.match(storage, /updateOfflineAttendanceDraftState/);
  assert.doesNotMatch(storage, /access_token|refresh_token|password/i);
});

test("offline attendance drafts are restored only when the server roster version still matches", () => {
  assert.match(page, /getOfflineAttendanceDraft\(draftScope\)/);
  assert.match(page, /current\.recordId === saved\.recordId/);
  assert.match(page, /current\.baseUpdatedAt === saved\.baseUpdatedAt/);
  assert.match(page, /احتُفظ بالمسودة ولم تُدمج تلقائيًا/);
  assert.match(page, /await saveOfflineAttendanceDraft\(/);
  assert.match(page, /\}, undefined, operationId\)/);
  assert.match(page, /saveOfflineAttendanceDraft\(offlineScope, sessionId, rows, true\)/);
  assert.match(page, /لم تُرسل إلى الخادم بعد/);
  assert.match(page, /getOfflineAttendanceScope/);
  assert.match(page, /getOfflineAttendanceRoster/);
  assert.match(page, /saveOfflineAttendanceRoster/);
  assert.match(page, /لم يتم التحقق من الصلاحيات/);
  assert.match(page, /needsOfflineSync/);
  assert.match(page, /saveOfflineAttendanceDraft\(offlineScope, sessionId, rows, true\)/);
  assert.match(page, /window\.addEventListener\("online", retryWhenOnline\)/);
  assert.match(page, /autoSyncAttemptedRef\.current = true/);
  assert.match(page, /setNeedsOfflineSync\(false\)/);
  assert.match(page, /updateOfflineAttendanceDraftState\(offlineScope, "syncing"/);
  assert.match(page, /updateOfflineAttendanceDraftState\(offlineScope, "pending"/);
  assert.match(page, /savedDraft\.operationId/);
  assert.match(page, /saveAttendance\([\s\S]*savedDraft\.operationId/);
  assert.match(page, /replayResult/);
});
