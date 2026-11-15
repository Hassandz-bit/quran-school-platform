import assert from "node:assert/strict";
import test from "node:test";
import { buildQuranReviewPlan } from "../client/src/lib/quran-review-scheduler.ts";

function record(overrides = {}) {
  return {
    id: "record-1",
    studentId: "student-1",
    teacherId: "teacher-1",
    recordDate: "2026-01-01",
    sessionType: "new_memorization",
    surahNumber: 1,
    ayahStart: 1,
    ayahEnd: 1,
    rating: 5,
    errorsCount: 0,
    recitationResult: "memorized",
    recitationAccuracy: "no_errors",
    focusWords: "",
    notes: "",
    nextAssignment: "",
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-01T08:00:00.000Z",
    ...overrides,
  };
}

test("schedules the first review one day after new memorization", () => {
  const plan = buildQuranReviewPlan([record()], "2026-01-02");
  assert.equal(plan.dueAyat, 1);
  assert.equal(plan.scheduledAyat, 1);
  assert.equal(plan.tasks[0].repetitions, 2);
  assert.equal(plan.tasks[0].priority, "reinforce");
});

test("widens the interval after consecutive strong revisions", () => {
  const records = [
    record(),
    record({ id: "review-1", recordDate: "2026-01-02", sessionType: "near_revision", recitationResult: "revised", rating: 5, createdAt: "2026-01-02T08:00:00.000Z" }),
    record({ id: "review-2", recordDate: "2026-01-03", sessionType: "distant_revision", recitationResult: "revised", rating: 5, createdAt: "2026-01-03T08:00:00.000Z" }),
  ];
  const plan = buildQuranReviewPlan(records, "2026-01-05");
  assert.equal(plan.dueAyat, 0);
  assert.equal(plan.nextReviewDate, "2026-01-06");
});

test("resets a weak or failed revision to next-day intensive repetition", () => {
  const records = [
    record(),
    record({ id: "weak", recordDate: "2026-01-02", sessionType: "near_revision", recitationResult: "revised", rating: 2, errorsCount: 4, createdAt: "2026-01-02T08:00:00.000Z" }),
  ];
  const plan = buildQuranReviewPlan(records, "2026-01-03");
  assert.equal(plan.dueAyat, 1);
  assert.equal(plan.tasks[0].priority, "urgent");
  assert.equal(plan.tasks[0].repetitions, 3);
});

test("does not count a failed memorization result as memorized", () => {
  const plan = buildQuranReviewPlan([record({ recitationResult: "not_memorized" })], "2026-01-10");
  assert.equal(plan.dueAyat, 0);
  assert.equal(plan.tasks.length, 0);
});

test("caps the daily amount and reports the remaining backlog", () => {
  const plan = buildQuranReviewPlan([
    record({ ayahStart: 1, ayahEnd: 4 }),
  ], "2026-01-02", 2);
  assert.equal(plan.dueAyat, 4);
  assert.equal(plan.scheduledAyat, 2);
  assert.equal(plan.remainingAyat, 2);
  assert.equal(plan.tasks[0].ayahCount, 2);
});

test("groups adjacent verses into a manageable review task", () => {
  const plan = buildQuranReviewPlan([record({ ayahStart: 1, ayahEnd: 3 })], "2026-01-02");
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].ayahStart, 1);
  assert.equal(plan.tasks[0].ayahEnd, 3);
  assert.equal(plan.tasks[0].ayahCount, 3);
});
