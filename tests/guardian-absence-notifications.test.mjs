import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("attendance saves before best-effort guardian notification dispatch", async () => {
  const attendance = await read("client/src/pages/Attendance.tsx");
  const saveIndex = attendance.indexOf("const result = await saveAttendance");
  const successIndex = attendance.indexOf("toast.success(message)", saveIndex);
  const dispatchIndex = attendance.indexOf(
    "void dispatchGuardianAttendanceNotifications",
    saveIndex
  );

  assert.ok(saveIndex >= 0, "attendance save call is missing");
  assert.ok(successIndex > saveIndex, "attendance success no longer follows durable save");
  assert.ok(dispatchIndex > successIndex, "notification dispatch must remain post-save best-effort");
  assert.match(attendance, /sessionId: result\.sessionId/);
  assert.doesNotMatch(attendance, /await\s+dispatchGuardianAttendanceNotifications/);
});

test("client dispatch helper swallows notification failures instead of failing attendance", async () => {
  const helper = await read("client/src/lib/guardian-notification-dispatch.ts");
  assert.match(helper, /dispatch-guardian-notifications/);
  assert.match(helper, /catch\s*\{\s*return false;/s);
  assert.doesNotMatch(helper, /throw\s+/);
});

test("guardian secrets stay server-only and retry cron has an independent secret", async () => {
  const guardianPush = await read("client/src/lib/guardian-push.ts");
  const dispatcher = await read("supabase/functions/dispatch-guardian-notifications/services.ts");
  const config = await read("supabase/config.toml");

  assert.match(guardianPush, /VITE_GUARDIAN_PUSH_PUBLIC_VAPID_KEY/);
  assert.doesNotMatch(guardianPush, /GUARDIAN_PUSH_PRIVATE_VAPID_KEY/);
  assert.doesNotMatch(guardianPush, /GUARDIAN_NOTIFICATION_CRON_SECRET/);
  assert.match(dispatcher, /GUARDIAN_PUSH_PRIVATE_VAPID_KEY/);
  assert.match(dispatcher, /GUARDIAN_NOTIFICATION_CRON_SECRET/);
  assert.match(dispatcher, /x-quranos-cron-secret/);
  assert.match(dispatcher, /npm:web-push@3\.6\.7/);
  assert.match(dispatcher, /status === 404 \|\| status === 410/);
  assert.match(dispatcher, /status === 429/);
  assert.match(
    config,
    /\[functions\.dispatch-guardian-notifications\][\s\S]*verify_jwt = false/
  );
  assert.match(dispatcher, /can_access_attendance_class/);
});

test("notification outbox suppresses stale absences and worker access remains service-only", async () => {
  const migration = await read("supabase/024_guardian_absence_notifications.sql");

  assert.match(migration, /unique \(attendance_record_id, event_type\)/i);
  assert.match(migration, /event_type in \('absence_confirmed', 'absence_corrected'\)/i);
  assert.match(
    migration,
    /attendance_corrected_before_delivery/i
  );
  assert.match(
    migration,
    /absence_delivery\.status = 'delivered'/i
  );
  assert.match(
    migration,
    /revoke all on public\.guardian_notification_events,[\s\S]*public\.guardian_notification_deliveries[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_guardian_push_deliveries\(uuid, uuid, integer\)[\s\S]*to service_role/i
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_due_guardian_push_deliveries\(integer\)[\s\S]*to service_role/i
  );
  assert.match(migration, /for update of delivery skip locked/i);
  assert.match(migration, /relationship\.status = 'active'/i);
});
