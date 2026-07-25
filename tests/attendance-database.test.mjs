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

  for (const role of ["school_admin", "branch_manager", "teacher"]) {
    assert.match(
      migration,
      new RegExp(`\\('${role}', 'attendance\\.view'\\)`),
    );
    assert.match(
      migration,
      new RegExp(`\\('${role}', 'attendance\\.manage'\\)`),
    );
  }

  assert.match(
    migration,
    /\('academic_supervisor', 'attendance\.view'\)/,
  );
  assert.doesNotMatch(
    migration,
    /\('academic_supervisor', 'attendance\.manage'\)/,
  );
});

test("view-only attendance access cannot insert or update", () => {
  const sessionInsertPolicy = migration.match(
    /create policy attendance_sessions_insert_authorized[\s\S]*?;\n/i,
  )?.[0];
  const recordInsertPolicy = migration.match(
    /create policy attendance_records_insert_authorized[\s\S]*?;\n/i,
  )?.[0];
  const recordUpdatePolicy = migration.match(
    /create policy attendance_records_update_authorized[\s\S]*?;\n/i,
  )?.[0];

  assert.ok(sessionInsertPolicy);
  assert.ok(recordInsertPolicy);
  assert.ok(recordUpdatePolicy);

  for (const policy of [
    sessionInsertPolicy,
    recordInsertPolicy,
    recordUpdatePolicy,
  ]) {
    assert.match(policy, /'attendance\.manage'/);
    assert.doesNotMatch(policy, /'attendance\.view'/);
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

test("school, branch, and class isolation is enforced in authorization and foreign keys", () => {
  assert.match(
    migration,
    /target_class\.school_id = target_school_id[\s\S]*target_class\.branch_id = target_branch_id[\s\S]*target_class\.id = target_class_id/i,
  );
  assert.match(
    migration,
    /membership\.school_id = target_school_id[\s\S]*membership_role\.branch_id is null\s+or membership_role\.branch_id = target_branch_id/i,
  );
  assert.match(
    migration,
    /foreign key \(school_id, branch_id, class_id\)\s+references public\.classes\(school_id, branch_id, id\)/i,
  );
  assert.match(
    migration,
    /foreign key \(school_id, branch_id, class_id, session_id\)\s+references public\.attendance_sessions\(school_id, branch_id, class_id, id\)/i,
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
  assert.doesNotMatch(
    migration,
    /grant update[^;]*on public\.attendance_sessions/i,
  );
  assert.doesNotMatch(
    migration,
    /attendance_sessions_update_authorized/i,
  );
});

test("anon has no attendance table or function access", () => {
  assert.match(
    migration,
    /revoke all on public\.attendance_sessions,[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke execute on function public\.can_access_attendance_class[\s\S]*from anon/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select|insert|update|delete|execute)[\s\S]*?\s+to\s+anon\s*;/i,
  );
  assert.doesNotMatch(migration, /for\s+(?:all|select|insert|update|delete)\s+to\s+anon/i);
});

test("security-definer attendance functions pin an empty search path", () => {
  for (const functionName of [
    "can_access_attendance_class",
    "prepare_attendance_record",
    "audit_attendance_record",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create or replace function public\\.${functionName}[\\s\\S]*?security definer\\s+set search_path = ''`,
        "i",
      ),
    );
  }
});

test("migration avoids forbidden access patterns", () => {
  assert.doesNotMatch(migration, /service_role/i);
  assert.doesNotMatch(migration, /select\s*\(\s*["']\*["']\s*\)/i);
  assert.doesNotMatch(migration, /select\s+(?:\w+\.)?\*/i);
});
