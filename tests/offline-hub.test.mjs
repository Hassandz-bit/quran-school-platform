import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/OfflineAttendance.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../client/src/contexts/AuthContext.tsx", import.meta.url), "utf8");
const storage = readFileSync(new URL("../client/src/lib/attendance-offline.ts", import.meta.url), "utf8");

test("offline attendance route is reachable without the online authorization route guard", () => {
  assert.match(app, /<Route path="\/offline">[\s\S]*?<OfflineAttendance \/>[\s\S]*?<\/Route>/);
  assert.doesNotMatch(app.slice(app.indexOf('<Route path="/offline">'), app.indexOf("</Route>", app.indexOf('<Route path="/offline">'))), /ProtectedRoute/);
});

test("offline hub requires the locally restored user and only presents cached records read-only", () => {
  assert.match(page, /const \{ user, loading \} = useAuth\(\)/);
  assert.match(page, /listOfflineAttendanceRosters\(user\.id\)/);
  assert.match(page, /قراءة فقط/);
  assert.match(page, /لا تُرسل أي تغييرات إلى الخادم/);
  assert.match(page, /window\.addEventListener\("online", resumeSyncWhenOnline\)/);
  assert.match(page, /window\.location\.assign\("\/attendance"\)/);
  assert.doesNotMatch(page, /saveAttendance\(|\.insert\(|\.update\(|\.delete\(/);
});

test("cached attendance stays user-scoped and pending drafts survive sign-out", () => {
  assert.match(storage, /store\.index\("userId"\)\.getAll\(userId\)/);
  assert.match(storage, /clearOfflineAttendanceForUser/);
  assert.match(auth, /clearOfflineAttendanceForUser\(currentUserId\)/);
  assert.match(app, /offlineSession \? "\/offline" : "\/post-login"/);
  assert.match(auth, /previousUserId !== nextUserId/);
});

test("offline authorization failure settles loading without granting cached permissions", () => {
  assert.match(auth, /catch \{\s*if \(!isCurrentRequest\(\)\) return;\s*setAuthorizationError\(AUTHORIZATION_MESSAGES\.connectionError\);\s*setAuthorizationLoading\(false\);/);
});
