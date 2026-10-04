import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studentsList = readFileSync("client/src/pages/StudentsList.tsx", "utf8");
const attendance = readFileSync("client/src/pages/Attendance.tsx", "utf8");
const memorization = readFileSync("client/src/pages/Memorization.tsx", "utf8");
const groupEntry = readFileSync("client/src/components/GroupMemorizationEntry.tsx", "utf8");

test("student list follow-up shortcuts carry the selected cohort scope", () => {
  assert.match(studentsList, /\/attendance\?branchId=\$\{encodeURIComponent\(selectedCohort\.branch_id\)\}&classId=\$\{encodeURIComponent\(selectedCohort\.id\)\}/);
  assert.match(studentsList, /\/memorization\?branchId=\$\{encodeURIComponent\(selectedCohort\.branch_id\)\}&classId=\$\{encodeURIComponent\(selectedCohort\.id\)\}&mode=group/);
  assert.match(studentsList, /classes\.find\(classItem => classItem\.id === filterClass\)/);
});

test("attendance and memorization only preselect a cohort present in their authorized scope", () => {
  for (const source of [attendance, memorization]) {
    assert.match(source, /new URLSearchParams\(window\.location\.search\)/);
    assert.match(source, /item\.id === params\.get\("classId"\) && item\.branchId === params\.get\("branchId"\)/);
    assert.match(source, /requestedClass \?\? nextScope\.classes\[0\]/);
  }
});

test("group memorization uses one shared passage and per-student evaluation before a bulk save", () => {
  assert.match(groupEntry, /saveMemorizationGroup\(\{/);
  assert.match(groupEntry, /rating: entry\.rating/);
  assert.match(groupEntry, /notes: entry\.notes/);
  assert.match(groupEntry, /nextAssignment: entry\.nextAssignment/);
  assert.match(groupEntry, /ayahStart,/);
  assert.match(groupEntry, /ayahEnd,/);
});
