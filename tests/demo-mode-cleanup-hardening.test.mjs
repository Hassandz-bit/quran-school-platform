import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const BLOCKERS = [
  "demo_cleanup_blocked_student_photo",
  "demo_cleanup_blocked_student_documents",
  "demo_cleanup_blocked_student_import_history",
  "demo_cleanup_blocked_real_school_track_result",
  "demo_cleanup_blocked_real_follow_up_note",
  "demo_cleanup_blocked_demo_teacher_payroll",
];

test("legacy demo cleanup remains atomic and preserves real or sensitive records", async () => {
  const [sql, receipts] = await Promise.all([
    read("supabase/071_demo_cleanup_related_records.sql"),
    read("supabase/027_official_receipts.sql"),
  ]);

  assert.match(sql, /rename to clear_school_demo_data_before_071/);
  assert.match(sql, /revoke all on function public\.clear_school_demo_data_before_071\(uuid\)[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.clear_school_demo_data\(uuid\) to authenticated/);
  assert.match(sql, /to_regclass\('public\.school_track_results'\)/);
  for (const blocker of BLOCKERS) assert.ok(sql.includes(blocker), `missing SQL blocker: ${blocker}`);

  const deletionOrder = [
    "delete from public.guardian_notification_events",
    "delete from public.school_track_result_history",
    "delete from public.school_track_results",
    "delete from public.memorization_follow_up_note_history",
    "delete from public.memorization_follow_up_notes",
    "delete from public.official_receipts",
    "update public.student_import_rows",
    "return public.clear_school_demo_data_before_071(target_school_id)",
  ].map(marker => sql.indexOf(marker));
  assert.ok(deletionOrder.every(position => position >= 0));
  assert.deepEqual(deletionOrder, [...deletionOrder].sort((left, right) => left - right));
  assert.match(sql, /when foreign_key_violation then[\s\S]*blocked_constraint = constraint_name[\s\S]*message = 'demo_cleanup_blocked_related_record'/i);
  assert.doesNotMatch(sql, /delete from public\.(document_records|payroll_entries|payroll_compensation_profiles|employees)/i);
  assert.match(receipts, /receipt_record_is_active_demo/);
});

test("demo creation is retired while the protected cleanup path remains available", async () => {
  const [dashboard, retirement, cleanup, catalog, runner, fixture, assertions] = await Promise.all([
    read("client/src/pages/Dashboard.tsx"),
    read("supabase/072_retire_demo_mode.sql"),
    read("supabase/071_demo_cleanup_related_records.sql"),
    read("client/src/lib/ui-copy-en.ts"),
    read("tests/run-demo-mode-student-profile-migration-test.sh"),
    read("tests/demo-mode-retirement-fixture.sql"),
    read("tests/demo-mode-retirement-assertions.sql"),
  ]);

  assert.doesNotMatch(dashboard, /DemoModeCard|demo-mode/i);
  assert.match(retirement, /revoke all on function public\.create_school_demo_data\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(retirement, /revoke all on function public\.get_school_demo_status\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(cleanup, /grant execute on function public\.clear_school_demo_data\(uuid\) to authenticated/);
  assert.doesNotMatch(retirement, /drop table[\s\S]*demo_seed/i);
  assert.doesNotMatch(catalog, /وضع العرض التجريبي|البيانات التجريبية|إنشاء بيانات العرض/);
  assert.match(fixture, /create_school_demo_data/);
  assert.ok(runner.indexOf("demo-mode-retirement-fixture.sql") < runner.indexOf("072_retire_demo_mode.sql"));
  assert.match(assertions, /retirement_migration_removed_existing_demo_records/);

  for (const path of ["client/src/components/DemoModeCard.tsx", "client/src/lib/demo-mode.ts"]) {
    await assert.rejects(read(path), error => error?.code === "ENOENT");
  }
});
