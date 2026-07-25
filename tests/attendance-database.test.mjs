import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/013_attendance_module.sql", import.meta.url),
  "utf8",
);

test("attendance migration uses the next available number and creates the required tables", () => {
  assert.match(migration, /create table public\.attendance_sessions/i);
  assert.match(migration, /create table public\.attendance_records/i);
  assert.match(migration, /create table public\.attendance_record_history/i);
  assert.match(
    migration,
    /constraint attendance_sessions_class_date_unique\s+unique \(class_id, session_date\)/i,
  );
  assert.match(
    migration,
    /constraint attendance_records_session_student_unique\s+unique \(session_id, student_id\)/i,
  );
});

test("attendance states and optional arrival time are constrained", () => {
  for (const status of [
    "present",
    "absent",
    "late",
    "excused_absence",
  ]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }

  assert.match(
    migration,
    /arrival_time is null\s+or status in \('present', 'late'\)/i,
  );
  assert.match(
    migration,
    /char_length\(btrim\(note\)\) between 1 and 500/i,
  );
});

test("attendance permission catalogue is not duplicated and built-in roles are scoped", () => {
  assert.match(migration, /'attendance\.view'/);
  assert.match(migration, /'attendance\.manage'/);
  assert.match(migration, /on conflict \(code\) do update/i);

  for (const role of [
    "school_admin",
    "branch_manager",
    "academic_supervisor",
    "teacher",
  ]) {
    assert.match(
      migration,
      new RegExp(`\\('${role}', 'attendance\\.view'\\)`),
    );
    assert.match(
      migration,
      new RegExp(`\\('${role}', 'attendance\\.manage'\\)`),
    );
  }
});

test("teacher access requires an active profile-linked class assignment", () => {
  assert.match(
    migration,
    /create or replace function public\.can_access_attendance_class/i,
  );
  assert.match(migration, /role\.code <> 'teacher'/);
  assert.match(migration, /role\.code = 'teacher'/);
  assert.match(
    migration,
    /teacher\.profile_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    migration,
    /class_teacher\.class_id = target_class_id/i,
  );
  assert.match(migration, /class_teacher\.status = 'active'/i);
  assert.match(
    migration,
    /membership_role\.branch_id is null\s+or membership_role\.branch_id = target_branch_id/i,
  );
});

test("student scope is derived from the session and validated server-side", () => {
  assert.match(
    migration,
    /create or replace function public\.prepare_attendance_record/i,
  );
  assert.match(
    migration,
    /student\.school_id = resolved_school_id/i,
  );
  assert.match(
    migration,
    /student\.branch_id = resolved_branch_id/i,
  );
  assert.match(
    migration,
    /student\.class_id = resolved_class_id/i,
  );
  assert.match(migration, /student\.status = 'active'/i);
  assert.match(
    migration,
    /new\.recorded_by := \(select auth\.uid\(\)\)/i,
  );
});

test("updates preserve an append-only audit trail", () => {
  assert.match(
    migration,
    /create or replace function public\.audit_attendance_record/i,
  );
  assert.match(
    migration,
    /create trigger attendance_records_audit\s+after insert or update/i,
  );
  assert.match(
    migration,
    /insert into public\.attendance_record_history/i,
  );
  assert.match(
    migration,
    /grant select on public\.attendance_record_history to authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete)[^;]*attendance_record_history/i,
  );
});

test("RLS is enabled and browser privileges are least-privilege", () => {
  for (const table of [
    "attendance_sessions",
    "attendance_records",
    "attendance_record_history",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
  }

  assert.match(
    migration,
    /revoke all on public\.attendance_sessions,[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke execute on function public\.can_access_attendance_class[\s\S]*from anon/i,
  );
  assert.doesNotMatch(migration, /for delete to authenticated/i);
  assert.doesNotMatch(
    migration,
    /grant delete on public\.attendance_(?:sessions|records|record_history)/i,
  );
});

test("migration avoids forbidden access patterns", () => {
  assert.doesNotMatch(migration, /service_role/i);
  assert.doesNotMatch(migration, /select\s*\(\s*["']\*["']\s*\)/i);
  assert.doesNotMatch(migration, /select\s+(?:\w+\.)?\*/i);
});
