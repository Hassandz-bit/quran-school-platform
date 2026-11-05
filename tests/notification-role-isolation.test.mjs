import "./notification-three-party-scope.test.mjs";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/074_notification_role_isolation.sql");
const retiredCategories = read("supabase/078_remove_student_learning_attendance_notifications.sql");
const page = read("client/src/pages/Notifications.tsx");
const lib = read("client/src/lib/notifications.ts");
const composer = read("client/src/components/NotificationComposerDialog.tsx");
const parentShell = read("client/src/components/ParentShell.tsx");

test("portal context is resolved from active school relationships", () => {
  assert.match(migration, /create or replace function public\.get_my_notification_contexts\(\)/i);
  assert.match(lib, /rpc\(["']get_my_notification_contexts["']\)/);
  assert.match(page, /fetchMyNotificationContexts\(\)/);
  assert.match(page, /fetchMyNotificationSenderSchools\(notificationContext\)/);
  assert.match(migration, /list_my_notification_sender_schools_for_context/);
  assert.match(migration, /list_manual_notification_recipients_for_context/);
  assert.match(migration, /send_manual_app_notification_for_context/);
});

test("notification rows carry a validated recipient and sender portal context", () => {
  assert.match(migration, /add column if not exists recipient_audiences text\[\]/i);
  assert.match(migration, /add column if not exists sender_audiences text\[\]/i);
  assert.match(migration, /NOTIFICATION_RECIPIENT_AUDIENCE_INVALID/);
  assert.match(migration, /recipient_audiences @> array\[target_context\]/i);
  assert.match(migration, /sender_audiences @> array\[target_context\]/i);
});

test("unscoped list and read RPCs are removed in favor of portal-scoped RPCs", () => {
  assert.match(migration, /drop function if exists public\.list_my_app_notifications\(text, text, integer\)/i);
  assert.match(migration, /create function public\.list_my_app_notifications\([\s\S]*target_context text/i);
  assert.match(migration, /drop function if exists public\.mark_my_app_notification_read\(uuid\)/i);
  assert.match(migration, /create function public\.mark_my_app_notification_read\([\s\S]*target_context text/i);
  assert.match(lib, /target_context: context/);
  assert.match(lib, /target_notification_id: notificationId,[\s\S]*target_context: context/);
});

test("guardian and teacher portals expose only their remaining relevant notification filters", () => {
  assert.ok(page.includes('["all", "administration", "finance", "guardians"]'));
  assert.ok(page.includes('["all", "administration", "teachers", "guardians"]'));
  for (const retired of ['"students"', '"learning"', '"attendance"']) {
    assert.ok(!page.includes(retired));
  }
  assert.ok(retiredCategories.includes("'administration', 'teachers', 'finance', 'guardians', 'system'"));
  assert.match(page, /fetchMyNotifications\([\s\S]*notificationContext/);
  assert.match(page, /markNotificationRead\(row\.notificationId, notificationContext\)/);
});

test("manual sends attach intended audience to each recipient and guardian badge is scoped", () => {
  assert.match(composer, /recipientAudiences/);
  assert.match(composer, /targetingSummary:[\s\S]*recipientAudiences/);
  assert.match(lib, /notificationContexts: \(Array\.isArray\(row\.notification_contexts\)/);
  assert.match(composer, /actualContexts = recipient\?\.notificationContexts/);
  assert.match(composer, /fetchManualNotificationRecipients\(schoolId, selectedSchool\.senderKind\)/);
  assert.match(composer, /selectedSchool\.senderKind\);/);
  assert.match(parentShell, /fetchUnreadNotificationCount\("guardian"\)/);
});
