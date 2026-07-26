import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/014_memorization_module.sql", import.meta.url),
  "utf8",
);

test("memorization migration creates records and append-only history", () => {
  assert.match(migration, /create table public\.memorization_records/i);
  assert.match(migration, /create table public\.memorization_record_history/i);
  assert.match(
    migration,
    /create trigger memorization_records_audit\s+after insert or update/i,
  );
  assert.match(migration, /insert into public\.memorization_record_history/i);
});

test("memorization session types and Quran ranges are constrained", () => {
  for (const type of [
    "new_memorization",
    "near_revision",
    "distant_revision",
    "assessment",
  ]) {
    assert.match(migration, new RegExp(`'${type}'`));
  }
  assert.match(migration, /surah_number between 1 and 114/i);
  assert.match(migration, /ayah_start between 1 and 286/i);
  assert.match(migration, /ayah_end between 1 and 286/i);
  assert.match(migration, /ayah_start <= ayah_end/i);
  assert.match(migration, /rating between 1 and 5/i);
  assert.match(migration, /errors_count between 0 and 100/i);
});

test("memorization permissions use least privilege for built-in roles", () => {
  for (const role of ["school_admin", "branch_manager", "teacher"]) {
    assert.match(
      migration,
      new RegExp(`\\('${role}', 'memorization\\.view'\\)`),
    );
    assert.match(
      migration,
      new RegExp(`\\('${role}', 'memorization\\.manage'\\)`),
    );
  }
  assert.match(
    migration,
    /\('academic_supervisor', 'memorization\.view'\)/,
  );
  assert.doesNotMatch(
    migration,
    /\('academic_supervisor', 'memorization\.manage'\)/,
  );
});

test("teacher access requires an active profile-linked class assignment", () => {
  assert.match(
    migration,
    /create or replace function public\.can_access_memorization_class/i,
  );
  assert.match(migration, /role\.code = 'teacher'/i);
  assert.match(
    migration,
    /teacher\.profile_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(migration, /class_teacher\.class_id = target_class_id/i);
  assert.match(migration, /class_teacher\.status = 'active'/i);
});

test("students and teachers are validated in the exact active class", () => {
  assert.match(migration, /student\.school_id = resolved_school_id/i);
  assert.match(migration, /student\.branch_id = resolved_branch_id/i);
  assert.match(migration, /student\.class_id = new\.class_id/i);
  assert.match(migration, /student\.status = 'active'/i);
  assert.match(migration, /class_teacher\.class_id = new\.class_id/i);
  assert.match(migration, /teacher\.status = 'active'/i);
});

test("teacher-only writers cannot attribute records to another teacher", () => {
  assert.match(migration, /caller_has_non_teacher_manage/i);
  assert.match(migration, /role\.code <> 'teacher'/i);
  assert.match(migration, /permission\.code = 'memorization\.manage'/i);
  assert.match(
    migration,
    /resolved_teacher_profile_id is distinct from \(select auth\.uid\(\)\)/i,
  );
  assert.match(migration, /MEMORIZATION_TEACHER_IDENTITY_MISMATCH/);
});

test("identity fields are derived and immutable while content updates remain audited", () => {
  assert.match(migration, /new\.school_id := resolved_school_id/i);
  assert.match(migration, /new\.branch_id := resolved_branch_id/i);
  assert.match(
    migration,
    /new\.recorded_by := \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    migration,
    /new\.last_modified_by := \(select auth\.uid\(\)\)/i,
  );
  for (const field of [
    "school_id",
    "branch_id",
    "class_id",
    "student_id",
    "teacher_id",
    "recorded_by",
  ]) {
    assert.match(
      migration,
      new RegExp(`new\\.${field} is distinct from old\\.${field}`),
    );
  }
});

test("RLS separates view and manage and provides no delete path", () => {
  for (const table of [
    "memorization_records",
    "memorization_record_history",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
  }
  const insertPolicy = migration.match(
    /create policy memorization_records_insert_authorized[\s\S]*?;\n/i,
  )?.[0];
  const updatePolicy = migration.match(
    /create policy memorization_records_update_authorized[\s\S]*?;\n/i,
  )?.[0];
  assert.ok(insertPolicy);
  assert.ok(updatePolicy);
  assert.match(insertPolicy, /'memorization\.manage'/);
  assert.doesNotMatch(insertPolicy, /'memorization\.view'/);
  assert.match(updatePolicy, /'memorization\.manage'/);
  assert.doesNotMatch(updatePolicy, /'memorization\.view'/);
  assert.doesNotMatch(migration, /for delete to authenticated/i);
  assert.doesNotMatch(migration, /grant delete on public\.memorization/i);
});

test("browser writes are restricted to mutable input columns", () => {
  assert.match(
    migration,
    /grant insert \([\s\S]*class_id,[\s\S]*student_id,[\s\S]*teacher_id,[\s\S]*next_assignment[\s\S]*\) on public\.memorization_records to authenticated/i,
  );
  assert.match(
    migration,
    /grant update \([\s\S]*record_date,[\s\S]*session_type,[\s\S]*next_assignment[\s\S]*\) on public\.memorization_records to authenticated/i,
  );
  assert.doesNotMatch(migration, /grant (?:insert|update)[^;]*recorded_by/i);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update)[^;]*last_modified_by/i,
  );
});

test("security-definer functions pin search_path and trigger functions are not browser executable", () => {
  for (const functionName of [
    "can_access_memorization_class",
    "prepare_memorization_record",
    "audit_memorization_record",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create or replace function public\\.${functionName}[\\s\\S]*?security definer\\s+set search_path = ''`,
        "i",
      ),
    );
  }
  assert.match(
    migration,
    /revoke execute on function public\.prepare_memorization_record\(\) from anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke execute on function public\.audit_memorization_record\(\) from anon, authenticated/i,
  );
});

test("anon has no memorization table or function access", () => {
  assert.match(
    migration,
    /revoke all on public\.memorization_records,[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke execute on function public\.can_access_memorization_class[\s\S]*from anon/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select|insert|update|delete|execute)[\s\S]*?\s+to\s+anon\s*;/i,
  );
});

test("migration avoids forbidden patterns and adds covering foreign-key indexes", () => {
  assert.doesNotMatch(migration, /service_role/i);
  assert.doesNotMatch(migration, /select\s+(?:\w+\.)?\*/i);
  for (const index of [
    "memorization_records_class_scope_idx",
    "memorization_records_student_date_idx",
    "memorization_records_teacher_date_idx",
    "memorization_history_record_scope_idx",
    "memorization_history_changed_by_idx",
  ]) {
    assert.match(migration, new RegExp(`create index ${index}`, "i"));
  }
});
