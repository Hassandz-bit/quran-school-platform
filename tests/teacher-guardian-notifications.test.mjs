import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/063_teacher_guardian_notification_messaging.sql");
const notifications = read("client/src/lib/notifications.ts");
const page = read("client/src/pages/Notifications.tsx");
const composer = read("client/src/components/NotificationComposerDialog.tsx");

test("teacher and guardian sender schools are resolved server-side", () => {
  assert.match(migration, /create or replace function public\.list_my_notification_sender_schools\(\)/i);
  assert.match(migration, /'teacher'/);
  assert.match(migration, /'guardian'/);
  assert.match(migration, /public\.student_guardians/);
  assert.match(migration, /public\.class_teachers/);
  assert.match(notifications, /rpc\("list_my_notification_sender_schools"\)/);
  assert.match(page, /senderSchools\.length > 0/);
  assert.doesNotMatch(page, /parentMode \|\| !school\?\.id/);
});

test("guardian recipients are limited to administration and assigned teachers", () => {
  assert.match(migration, /guardian_teachers as \(/i);
  assert.match(migration, /relationship\.guardian_profile_id = current_user_id/);
  assert.match(migration, /class_teacher\.class_id = student\.class_id/);
  assert.match(migration, /current_sender_kind = 'guardian'/);
  assert.match(migration, /GUARDIAN_NOTIFICATION_INDIVIDUAL_ONLY/);
  assert.match(migration, /recent_send_count >= 10/);
  assert.match(composer, /canGroupSend \? \(\["individual", "group", "custom"\]/);
  assert.match(composer, /إدارة المدرسة أو معلمي أبنائك/);
});

test("teacher recipients are limited to administration and guardians of assigned classes", () => {
  assert.match(migration, /my_teacher_classes as \(/i);
  assert.match(migration, /teacher_guardians as \(/i);
  assert.match(migration, /teacher\.profile_id = current_user_id/);
  assert.match(migration, /recent_send_count >= 50/);
  assert.match(migration, /TEACHER_NOTIFICATION_CATEGORY_INVALID/);
});

test("messaging RPCs remain unavailable to anon", () => {
  for (const rpc of [
    "list_my_notification_sender_schools",
    "can_send_school_notifications",
    "list_manual_notification_recipients",
    "send_manual_app_notification",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon, authenticated`, "i")
    );
  }
});
