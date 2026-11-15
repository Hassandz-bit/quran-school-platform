import test from "node:test";
import assert from "node:assert/strict";
import { analyzeStudentQuranRecords } from "../client/src/lib/memorization-analysis.ts";

function record(overrides = {}) {
  return {
    id: "record-1",
    studentId: "student-1",
    teacherId: "teacher-1",
    recordDate: "2026-10-01",
    sessionType: "new_memorization",
    surahNumber: 2,
    ayahStart: 1,
    ayahEnd: 3,
    rating: 5,
    errorsCount: 0,
    recitationResult: "memorized",
    recitationAccuracy: null,
    focusWords: "",
    notes: "",
    nextAssignment: "",
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...overrides,
  };
}

test("counts only explicitly memorized ayat and removes overlapping duplicates", () => {
  const result = analyzeStudentQuranRecords([
    record({ id: "a", ayahStart: 1, ayahEnd: 3 }),
    record({ id: "b", ayahStart: 3, ayahEnd: 5 }),
    record({ id: "c", ayahStart: 6, ayahEnd: 8, recitationResult: "not_memorized" }),
    record({ id: "d", ayahStart: 9, ayahEnd: 10, recitationResult: null }),
    record({ id: "e", ayahStart: 11, ayahEnd: 12, sessionType: "assessment" }),
  ], "2026-10-02");

  assert.equal(result.memorizedAyat, 5);
});

test("review clears only the exact overlapping ayat, not the whole surah", () => {
  const result = analyzeStudentQuranRecords([
    record({ id: "memorization", recordDate: "2026-10-01", ayahStart: 1, ayahEnd: 5 }),
    record({
      id: "review",
      recordDate: "2026-10-10",
      sessionType: "near_revision",
      recitationResult: "revised",
      ayahStart: 4,
      ayahEnd: 7,
    }),
  ], "2026-10-10");

  const due = result.alerts.filter(alert => alert.kind === "review_due");
  assert.deepEqual(due.map(alert => [alert.ayahStart, alert.ayahEnd]), [[1, 3]]);
});

test("unrecorded ayat do not create memorization or review alerts", () => {
  const result = analyzeStudentQuranRecords([
    record({ recitationResult: null }),
    record({ id: "not-memorized", recitationResult: "not_memorized" }),
  ], "2026-10-30");

  assert.equal(result.memorizedAyat, 0);
  assert.equal(result.alerts.some(alert => alert.kind === "review_due"), false);
});

test("repeated weakness requires low ratings on two distinct dates for the same ayat", () => {
  const result = analyzeStudentQuranRecords([
    record({ id: "weak-1", recordDate: "2026-10-01", ayahStart: 8, ayahEnd: 8, rating: 2 }),
    record({ id: "weak-duplicate", recordDate: "2026-10-01", ayahStart: 8, ayahEnd: 8, rating: 1 }),
    record({ id: "weak-2", recordDate: "2026-10-03", ayahStart: 8, ayahEnd: 8, rating: 2 }),
    record({ id: "other-ayah", recordDate: "2026-10-03", ayahStart: 9, ayahEnd: 9, rating: 1 }),
  ], "2026-10-04");

  const weak = result.alerts.filter(alert => alert.kind === "repeated_weakness");
  assert.deepEqual(weak.map(alert => [alert.ayahStart, alert.ayahEnd]), [[8, 8]]);
});
