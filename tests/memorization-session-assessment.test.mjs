import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migration, lib, page, group, parentLib, parentPage] = await Promise.all([
  readFile("supabase/075_memorization_session_assessment.sql", "utf8"),
  readFile("client/src/lib/memorization.ts", "utf8"),
  readFile("client/src/pages/Memorization.tsx", "utf8"),
  readFile("client/src/components/GroupMemorizationEntry.tsx", "utf8"),
  readFile("client/src/lib/parent-portal.ts", "utf8"),
  readFile("client/src/pages/ParentStudent.tsx", "utf8"),
]);

test("session outcome and recitation accuracy are constrained and audited", () => {
  for (const value of ["memorized", "not_memorized", "revised", "not_revised"]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  for (const value of ["no_errors", "focus_words", "repeated_errors", "needs_repetition"]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  for (const field of ["recitation_result", "recitation_accuracy", "focus_words"]) {
    assert.match(migration, new RegExp(`new\\.${field}`));
    assert.match(migration, new RegExp(`old\\.${field}`));
  }
  assert.match(migration, /char_length\(btrim\(focus_words\)\) between 1 and 500/i);
  assert.match(migration, /memorization_records_session_result_matches_type_check/i);
});

test("memorization client validates and persists the structured session details", () => {
  for (const field of ["recitationResult", "recitationAccuracy", "focusWords"]) {
    assert.match(lib, new RegExp(field));
  }
  assert.match(lib, /recitation_result: draft\.recitationResult/);
  assert.match(lib, /recitation_accuracy: draft\.recitationAccuracy/);
  assert.match(lib, /focus_words: draft\.recitationAccuracy === "focus_words" \? draft\.focusWords\.trim\(\) : null/);
  assert.match(lib, /getMemorizationRatingLabel/);
  assert.match(lib, /if \\(!result\\) return "غير مسجل"/);
  assert.match(lib, /if \\(!accuracy\\) return "غير مسجل"/);
});

test("individual and group forms capture independent outcomes and focus words", () => {
  assert.match(page, /نتيجة الجلسة/);
  assert.match(page, /الكلمات التي تحتاج إلى تركيز/);
  assert.match(group, /recitationResult/);
  assert.match(group, /recitationAccuracy/);
  assert.match(group, /focusWords/);
  assert.match(group, /نتيجة التسميع/);
});

test("guardian academic RPC returns only the same authorized student's assessment fields", () => {
  assert.match(migration, /public\.is_active_guardian_of_student\(/);
  assert.match(migration, /record\.recitation_result/);
  assert.match(migration, /record\.recitation_accuracy/);
  assert.match(parentLib, /recitationResult/);
  assert.match(parentLib, /focusWords/);
  assert.match(parentPage, /recitationResultLabel/);
});
