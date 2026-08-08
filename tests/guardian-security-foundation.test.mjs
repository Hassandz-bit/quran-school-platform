import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path =>
  readFile(new URL("../" + path, import.meta.url), "utf8");

const [migration, seed, packageJson] = await Promise.all([
  read("supabase/017_guardian_security_foundation.sql"),
  read("supabase/seed.sql"),
  read("package.json"),
]);

const studentGuardiansTable =
  migration.match(
    /create table public\.student_guardians \([\s\S]*?\n\);/
  )?.[0] ?? "";

test("defines only the PR A guardian relationship and audit tables", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /create table public\.student_guardians/);
  assert.match(migration, /create table public\.guardian_access_events/);
  assert.doesNotMatch(migration, /guardian_invitations/);
  assert.doesNotMatch(migration, /guardian_channel_preferences/);
  assert.doesNotMatch(migration, /invite_guardian|invite-guardian/);
  assert.doesNotMatch(studentGuardiansTable, /\bbranch_id\b/);
});

test("uses tenant-safe keys and partial live relationship constraints", () => {
  assert.match(
    migration,
    /students_school_id_id_unique unique \(school_id, id\)/
  );
  assert.match(
    studentGuardiansTable,
    /foreign key \(school_id, student_id\)[\s\S]*?references public\.students\(school_id, id\)/
  );
  assert.match(
    migration,
    /student_guardians_live_relationship_unique_idx[\s\S]*?where status in \('pending', 'active'\)/
  );
  assert.match(
    migration,
    /student_guardians_live_primary_unique_idx[\s\S]*?where is_primary and status in \('pending', 'active'\)/
  );
  assert.match(
    studentGuardiansTable,
    /relationship_type in \([\s\S]*?'father'[\s\S]*?'mother'[\s\S]*?'legal_guardian'[\s\S]*?'relative'[\s\S]*?'other'/
  );
  assert.match(
    studentGuardiansTable,
    /status in \('pending', 'active', 'revoked'\)/
  );
});

test("adds the approved guardian permission matrix without reusing guardian role", () => {
  for (const code of [
    "guardians.view",
    "guardians.view_contacts",
    "guardians.link",
    "guardians.invite",
    "guardians.revoke",
    "guardians.audit",
  ]) {
    assert.match(migration, new RegExp("'" + code.replace(".", "\\.") + "'"));
  }

  assert.match(migration, /\('school_admin', 'guardians\.audit'\)/);
  assert.match(migration, /\('registrar', 'guardians\.revoke'\)/);
  assert.doesNotMatch(migration, /\('registrar', 'guardians\.audit'\)/);
  assert.doesNotMatch(
    migration,
    /\('(teacher|academic_supervisor|finance_officer|branch_manager|guardian)', 'guardians\./
  );
  assert.match(
    migration,
    /role\.code = 'guardian'[\s\S]*?permission\.code in \('school\.view', 'branches\.view'\)/
  );
  assert.match(seed, /'guardian',[\s\S]*?'ولي الأمر'/);
  assert.doesNotMatch(seed, /\('guardian', '(school|branches)\.view'\)/);
});

test("keeps guardian writes inside hardened RPCs and audit append-only", () => {
  for (const functionName of [
    "can_manage_student_guardian",
    "is_active_guardian_of_student",
    "prepare_student_guardian_link",
    "revoke_student_guardian_link",
    "revoke_guardians_on_terminal_student_status",
  ]) {
    assert.match(
      migration,
      new RegExp(
        "create or replace function public\\." +
          functionName +
          "[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''"
      )
    );
  }

  assert.match(
    migration,
    /revoke all on function public\.is_active_guardian_of_student\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant select on public\.student_guardians to authenticated/
  );
  assert.match(
    migration,
    /grant select on public\.guardian_access_events to authenticated/
  );
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete)[\s\S]*?guardian_access_events to authenticated/i
  );
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete)[\s\S]*?student_guardians to authenticated/i
  );
});

test("does not open parent access on existing academic or finance tables", () => {
  assert.doesNotMatch(
    migration,
    /create policy[\s\S]*?on public\.(students|attendance_sessions|attendance_records|memorization_records|student_charges|payments|expenses)/
  );
  assert.doesNotMatch(
    migration,
    /grant[\s\S]*?\b(students\.view|attendance\.view|memorization\.view|finance\.view)\b/
  );
  assert.doesNotMatch(migration, /service_role/i);
});

test("automatically revokes only explicit terminal student statuses", () => {
  assert.match(
    migration,
    /new\.status not in \('transferred', 'graduated', 'withdrawn'\)/
  );
  assert.match(migration, /event_type,[\s\S]*?'automatic_revoked'/);
  assert.doesNotMatch(
    migration,
    /new\.status not in \([\s\S]*?'suspended'/
  );
});

test("registers the isolated Migration 017 test command", () => {
  const parsedPackage = JSON.parse(packageJson);
  assert.equal(
    parsedPackage.scripts["test:guardian-security:migration"],
    "bash tests/run-guardian-security-foundation-migration-test.sh"
  );
});
