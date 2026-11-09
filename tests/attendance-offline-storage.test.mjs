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
  assert.match(storage, /saveOfflineAttendanceDraft/);
  assert.match(storage, /getOfflineAttendanceDraft/);
  assert.match(storage, /deleteOfflineAttendanceDraft/);
  assert.doesNotMatch(storage, /access_token|refresh_token|password/i);
});

test("offline attendance drafts are restored only when the server roster version still matches", () => {
  assert.match(page, /getOfflineAttendanceDraft\(draftScope\)/);
  assert.match(page, /current\.recordId === saved\.recordId/);
  assert.match(page, /current\.baseUpdatedAt === saved\.baseUpdatedAt/);
  assert.match(page, /احتُفظ بالمسودة ولم تُدمج تلقائيًا/);
  assert.match(page, /await saveOfflineAttendanceDraft\(/);
  assert.match(page, /لم تُرسل إلى الخادم بعد/);
});
