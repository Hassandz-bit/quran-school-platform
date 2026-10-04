import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

const guardianMigration = read("../supabase/068_guardian_relationship_edit.sql");
const students = read("../client/src/lib/students.ts");
const teachers = read("../client/src/lib/teachers.ts");
const guardians = read("../client/src/lib/guardians.ts");

 test("guardian edits stay relationship-scoped, permission checked, and audited", () => {
  assert.match(guardianMigration, /guardian_name_override text/i);
  assert.match(guardianMigration, /guardian_phone_override_set boolean/i);
  assert.match(guardianMigration, /create or replace function public\.update_student_guardian_link/i);
  assert.match(guardianMigration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(guardianMigration, /public\.can_manage_student_guardian\([\s\S]*'guardians\.link'/i);
  assert.match(guardianMigration, /relationship\.school_id = target_school_id[\s\S]*relationship\.id = target_student_guardian_id/i);
  assert.match(guardianMigration, /insert into public\.guardian_access_events/i);
  assert.match(guardianMigration, /'relationship_updated'/i);
  assert.match(guardianMigration, /'primary_changed'/i);
  assert.match(guardianMigration, /guardian_phone_override_set then relationship\.guardian_phone_override/i);
  assert.doesNotMatch(guardianMigration, /update\s+(public\.)?profiles\b/i);
  assert.doesNotMatch(guardianMigration, /update\s+auth\.users\b/i);
  assert.match(guardians, /update_student_guardian_link/);
  assert.match(guardians, /revoke_student_guardian_link/);
});

test("student and teacher update helpers omit tenant ownership and check branch permission", () => {
  assert.match(students, /export function buildStudentUpdate[\s\S]*const \{ school_id, \.\.\.update \} = payload/);
  assert.match(students, /\.update\(buildStudentUpdate\(schoolId, values, status\)\)[\s\S]*\.eq\("school_id", schoolId\)/);
  assert.match(students, /target_permission_code: "students\.manage"/);
  assert.match(teachers, /export function buildTeacherUpdate[\s\S]*const \{ school_id, \.\.\.update \} = payload/);
  assert.match(teachers, /\.update\(buildTeacherUpdate\(schoolId, values\)\)[\s\S]*\.eq\("school_id", schoolId\)/);
  assert.match(teachers, /target_permission_code: "teachers\.manage"/);
  assert.match(teachers, /assignmentHistoryKnown: !assignmentResult\.error/);
});
