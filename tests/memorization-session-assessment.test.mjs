import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migration, sessionTypeMigration, lib, page, group, parentLib, parentPage] = await Promise.all([
  readFile("supabase/075_memorization_session_assessment.sql", "utf8"),
  readFile("supabase/076_add_new_hifz_session_type.sql", "utf8"),
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
  assert.match(lib, /recitation_accuracy: null/);
  assert.match(lib, /focus_words: null/);
  assert.match(lib, /getMemorizationRatingLabel/);
  assert.match(lib, /if \(!result\) return "غير مسجل"/);
  assert.match(lib, /if \(!accuracy\) return "غير مسجل"/);
});

test("individual and group forms capture session outcomes without recitation accuracy fields", () => {
  assert.match(page, /نتيجة الجلسة/);
  assert.match(group, /recitationResult/);
  assert.match(group, /نتيجة التسميع/);
  assert.doesNotMatch(page, /دقة التسميع|الكلمات التي تحتاج إلى تركيز/);
  assert.doesNotMatch(group, /دقة التسميع|الكلمات التي تحتاج إلى تركيز/);
});

test("guardian academic RPC returns only the same authorized student's assessment fields", () => {
  assert.match(migration, /public\.is_active_guardian_of_student\(/);
  assert.match(migration, /record\.recitation_result/);
  assert.match(migration, /record\.recitation_accuracy/);
  assert.match(parentLib, /recitationResult/);
  assert.match(parentLib, /focusWords/);
  assert.match(parentPage, /recitationResultLabel/);
  assert.match(sessionTypeMigration, /\x27new_hifz\x27/);
  assert.doesNotMatch(parentPage, /recitationAccuracyLabel|مواضع التركيز/);
});
