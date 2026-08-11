import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [hardening, transferAssertions, runner] = await Promise.all([
  read("supabase/041_memorization_follow_up_scope_hardening.sql"),
  read("tests/memorization-follow-up-transfer-assertions.sql"),
  read("tests/run-memorization-follow-up-migration-test.sh"),
]);

test("status mutation hides note existence outside the student's current class scope", () => {
  assert.match(
    hardening,
    /create or replace function public\.set_memorization_follow_up_note_status[\s\S]*security definer\s+set search_path = ''/i
  );
  assert.match(
    hardening,
    /from public\.memorization_follow_up_notes as note\s+join public\.students as student[\s\S]*student\.school_id = target_school_id[\s\S]*student\.branch_id = target_branch_id[\s\S]*student\.class_id = target_class_id[\s\S]*student\.status = 'active'/i
  );
  assert.match(hardening, /for update of note, student/i);
  assert.match(hardening, /if not found then\s+return false;/i);
  assert.doesNotMatch(hardening, /MEMORIZATION_FOLLOW_UP_STUDENT_SCOPE_DENIED/);
});

test("hardening keeps exact manage permission before any note lookup", () => {
  const permissionIndex = hardening.indexOf("public.can_access_memorization_class(");
  const noteLookupIndex = hardening.indexOf(
    "from public.memorization_follow_up_notes as note"
  );
  assert.ok(permissionIndex >= 0, "missing class permission guard");
  assert.ok(noteLookupIndex > permissionIndex, "note lookup occurs before permission guard");
  assert.match(hardening, /'memorization\.manage'/);
});

test("transfer coverage compares a known inaccessible note with a nonexistent UUID", () => {
  assert.match(
    transferAssertions,
    /former teacher should receive false for a transferred-student historical note/
  );
  assert.match(
    transferAssertions,
    /former teacher should receive the same false result for a nonexistent note/
  );
  assert.match(
    transferAssertions,
    /new teacher should retain access to historical follow-up notes after class transfer/
  );
  assert.match(
    transferAssertions,
    /recurrence count should continue across a same-school class transfer/
  );
  assert.match(
    transferAssertions,
    /historical note provenance must remain on the original class after student transfer/
  );
});

test("PostgreSQL runner applies 040 then 041 before lifecycle and transfer assertions", () => {
  const migration040 = runner.indexOf("supabase/040_memorization_follow_up_notes.sql");
  const migration041 = runner.indexOf(
    "supabase/041_memorization_follow_up_scope_hardening.sql"
  );
  const lifecycle = runner.indexOf("tests/memorization-follow-up-assertions.sql");
  const transfer = runner.indexOf(
    "tests/memorization-follow-up-transfer-assertions.sql"
  );

  assert.ok(migration040 >= 0);
  assert.ok(migration041 > migration040);
  assert.ok(lifecycle > migration041);
  assert.ok(transfer > lifecycle);
});
