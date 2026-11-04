import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/075_notification_three_party_scope.sql");
const legacyCountMigration = read("supabase/077_notification_remove_unscoped_unread_count.sql");
const contextMigration = read("supabase/074_notification_role_isolation.sql");
const page = read("client/src/pages/Notifications.tsx");
const lib = read("client/src/lib/notifications.ts");
const composer = read("client/src/components/NotificationComposerDialog.tsx");

test("only administration, teachers and guardians resolve as notification participants", () => {
  assert.match(migration, /permission\.code = 'notifications\.send'/);
  assert.match(migration, /membership_role\.branch_id is null/);
  assert.match(migration, /then 'staff'::text end/);
  assert.match(migration, /then 'teacher'::text end/);
  assert.match(migration, /then 'guardian'::text end/);
  assert.doesNotMatch(migration, /then 'student'::text end/);
  assert.match(migration, /array\['staff','teacher','guardian'\]::text\[\]/);
  assert.doesNotMatch(migration, /array\['staff','teacher','guardian','student'\]::text\[\]/);
});

test("non-administrative employees and students are excluded from the manual recipient directory", () => {
  assert.match(migration, /cross join lateral \(/i);
  assert.match(migration, /resolve_app_notification_audiences\(\s*target_school_id, recipient\.profile_id, null\s*\) as contexts/i);
  assert.match(migration, /where cardinality\(resolved\.contexts\) > 0/i);
  assert.match(migration, /notification_contexts text\[\]/);
  assert.match(migration, /case when 'staff' = any\(resolved\.contexts\) then 'staff'::text end/);
  assert.doesNotMatch(migration, /recipient\.audience_types/);
  assert.match(lib, /NotificationContext = "staff" \| "teacher" \| "guardian"/);
  assert.match(lib, /NotificationAudience = "staff" \| "teachers" \| "guardians"/);
  assert.doesNotMatch(lib, /"student"\]\s*\.includes/);
});

test("inbox and unread counts reject messages from unauthorized human senders", () => {
  assert.match(migration, /notification\.sender_profile_id is null or cardinality\(notification\.sender_audiences\) > 0/);
  assert.match(migration, /target_context not in \('staff','teacher','guardian'\)/);
});

test("teacher, guardian and administration portals use separate notification contexts", () => {
  assert.match(page, /parentMode[\s\S]*?\? "guardian"/);
  assert.match(page, /teacherMode[\s\S]*?\? "teacher"/);
  assert.match(page, /notificationContexts\.includes\("staff"\)/);
  assert.match(composer, /value: "staff", ar: "الإدارة", en: "Administration"/);
  assert.match(composer, /value: "teachers"/);
  assert.match(composer, /value: "guardians"/);
  assert.doesNotMatch(composer, /value: "students", ar: "أولياء الطلاب"/);
});

test("unread notification counts always require an explicit authorized role context", () => {
  assert.match(legacyCountMigration, /drop function if exists public\.get_my_unread_notification_count\(\)/i);
  assert.match(lib, /fetchUnreadNotificationCount\(\s*context: NotificationContext/);
  assert.match(lib, /rpc\(["']get_my_unread_notification_count["'], \{\s*target_context: context/);
  assert.doesNotMatch(lib, /rpc\(["']get_my_unread_notification_count["']\s*\)/);
});
