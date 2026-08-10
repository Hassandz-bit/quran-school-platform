import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/025_guardian_directory_notification_center.sql");
const guardiansLib = read("client/src/lib/guardians.ts");
const notificationsLib = read("client/src/lib/notifications.ts");
const guardiansPage = read("client/src/pages/Guardians.tsx");
const notificationsPage = read("client/src/pages/Notifications.tsx");
const navigation = read("client/src/lib/app-navigation.ts");
const app = read("client/src/App.tsx");
const parentShell = read("client/src/components/ParentShell.tsx");

test("notification table stays private and self-service is RPC only", () => {
  assert.match(migration, /alter table public\.app_notifications enable row level security/i);
  assert.match(migration, /revoke all on public\.app_notifications from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.create_app_notification_internal[\s\S]*authenticated, service_role/i);
  assert.match(migration, /notification\.recipient_profile_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /notification\.sender_profile_id = current_user_id/i);
  assert.doesNotMatch(notificationsLib, /\.from\(["']app_notifications["']\)/);
  assert.match(notificationsLib, /rpc\(["']list_my_app_notifications["']/);
});

test("attendance events feed one durable center event per guardian rather than per device", () => {
  assert.match(migration, /create trigger guardian_notification_events_app_center/i);
  assert.match(migration, /select distinct relationship\.guardian_profile_id/i);
  assert.match(migration, /unique \(recipient_profile_id, source_type, source_id\)/i);
  assert.match(migration, /'guardian_attendance'/i);
  assert.match(migration, /attendance_record\.last_modified_by/i);
});

test("guardian directory is server scoped and contact data is permission gated", () => {
  assert.match(migration, /public\.can_manage_student_guardian\([\s\S]*'guardians\.view'/i);
  assert.match(migration, /'guardians\.view_contacts'/i);
  assert.match(migration, /'guardians\.invite'/i);
  assert.match(migration, /'guardians\.link'/i);
  assert.match(guardiansLib, /functions\.invoke\(["']invite-guardian["']/);
  assert.match(guardiansLib, /Idempotency-Key/);
  assert.match(guardiansPage, /دعوة ولي أمر/);
});

test("V2 navigation and routes expose guardians and notifications to staff and parents", () => {
  assert.match(navigation, /id: "guardians"/);
  assert.match(navigation, /path: "\/guardians"/);
  assert.match(navigation, /id: "notifications"/);
  assert.match(navigation, /path: "\/notifications"/);
  assert.match(app, /path="\/guardians"/);
  assert.match(app, /path="\/notifications"/);
  assert.match(app, /path="\/parent\/notifications"/);
  assert.match(parentShell, /fetchUnreadNotificationCount/);
  assert.match(parentShell, /\/parent\/notifications/);
});

test("notification center includes sent, received and module filters", () => {
  assert.match(notificationsPage, /value="inbox"/);
  assert.match(notificationsPage, /value="sent"/);
  for (const label of ["الإدارة", "التعليم والحفظ", "الحضور", "المالية", "الأولياء", "النظام"]) {
    assert.match(notificationsPage, new RegExp(label));
  }
  assert.match(notificationsPage, /markNotificationRead/);
  assert.match(notificationsPage, /row\.targetPath/);
});
