import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/056_manual_notifications_and_staff_directory.sql");
const notifications = read("client/src/lib/notifications.ts");
const composer = read("client/src/components/NotificationComposerDialog.tsx");
const staff = read("client/src/lib/staff.ts");
const staffDialog = read("client/src/components/StaffManagementDialog.tsx");
const focusNotes = read("client/src/components/MemorizationFocusNotes.tsx");
const memorization = read("client/src/lib/memorization.ts");

test("manual sends are campaign-audited, permission checked and recipient bounded", () => {
  assert.match(migration, /create table public\.notification_campaigns/i);
  assert.match(migration, /'notifications\.send'/);
  assert.match(migration, /public\.can_send_school_notifications\(target_school_id\)/);
  assert.match(migration, /cardinality\(normalized_recipient_ids\).*1 and 500/is);
  assert.match(migration, /public\.list_manual_notification_recipients\(target_school_id\)/);
  assert.match(migration, /'manual_campaign'/);
  assert.match(migration, /revoke all on function public\.create_app_notification_internal[\s\S]*from authenticated/i);
});

test("composer supports individual, group, audience, branch, class and explicit people", () => {
  for (const token of ["individual", "group", "custom", "audience", "branch", "class"]) {
    assert.match(composer, new RegExp(`"${token}"`));
  }
  assert.match(composer, /uniqueResolvedIds\.length/);
  assert.match(composer, /عدد المستلمين قبل الإرسال/);
  assert.match(composer, /sendManualNotification/);
  assert.match(notifications, /rpc\("send_manual_app_notification"/);
  assert.match(notifications, /rpc\("list_manual_notification_recipients"/);
});

test("staff titles are independent from authorization roles and allow a custom job", () => {
  assert.match(migration, /create table public\.staff_positions/i);
  assert.match(migration, /job title describes employment and never grants application permissions/i);
  for (const job of ["manager", "deputy_manager", "bursar", "teacher", "guard", "cleaner", "driver", "other"]) {
    assert.match(migration, new RegExp(`'${job}'`));
    assert.match(staff, new RegExp(`\\b${job}\\b`));
  }
  assert.match(migration, /job_code = 'other'.*custom_job_title/is);
  assert.match(staffDialog, /المسمى الوظيفي/);
  assert.match(staffDialog, /اكتب المسمى غير المدرج/);
  assert.doesNotMatch(staffDialog, /membership_roles|role_permissions/);
});

test("new recitation and multiple notes remain linked to one memorization record", () => {
  assert.match(memorization, /new_memorization: "التسميع الجديد"/);
  assert.match(focusNotes, /setSessionNotes\(notes\.filter\(note => note\.sourceRecordId === props\.sourceRecordId\)\)/);
  assert.match(focusNotes, /ملاحظات جلسة التسميع الحالية/);
  assert.match(focusNotes, /حفظ وإضافة ملاحظة أخرى/);
  assert.match(focusNotes, /setShowForm\(Boolean\(props\.sourceRecordId\)\)/);
});
