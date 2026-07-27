import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [app, launcher, data, studentsMigration, teachersMigration] =
  await Promise.all([
    read("client/src/App.tsx"),
    read("client/src/components/RosterAssignmentLauncher.tsx"),
    read("client/src/lib/class-roster.ts"),
    read("supabase/004_students_module.sql"),
    read("supabase/006_teachers_module.sql"),
  ]);

const interfaceSources = [app, launcher, data].join("\n");

test("loads roster assignment tools lazily on students and classes pages", () => {
  assert.match(
    app,
    /lazy\(\s*\(\) => import\("\.\/components\/RosterAssignmentLauncher"\)\s*\)/
  );
  assert.match(
    app,
    /<StudentsList \/>[\s\S]*?<RosterAssignmentLauncher mode="student-class" \/>/
  );
  assert.match(
    app,
    /<ClassesList \/>[\s\S]*?<RosterAssignmentLauncher mode="class-teacher" \/>/
  );
  assert.match(launcher, /dir="rtl"/);
  assert.match(launcher, /fixed bottom-5 left-5/);
});

test("hides write tools when no branch grants the required manage permission", () => {
  assert.match(data, /"students\.manage" \| "teachers\.manage"/);
  assert.match(data, /has_branch_permission/);
  assert.match(data, /filter\(row => accessByBranch\.get\(row\.id\) === true\)/);
  assert.match(
    launcher,
    /if \(!school\?\.id \|\| isCheckingPermission \|\| branches\.length === 0\) \{\s*return null;/
  );
  assert.match(
    launcher,
    /mode === "student-class" \? "students\.manage" : "teachers\.manage"/
  );
});

test("student class updates contain only class_id", () => {
  const start = data.indexOf("export function buildStudentClassUpdate");
  const end = data.indexOf("export function isActiveClassInBranch", start);
  const block = data.slice(start, end);

  assert.match(block, /class_id:/);
  for (const forbidden of ["school_id", "branch_id", "status", "student_id"]) {
    assert.equal(block.includes(forbidden), false);
  }
});

test("accepts only active classes from the student's exact branch", () => {
  assert.match(
    data,
    /return classItem\.status === "active" && classItem\.branchId === branchId/
  );
  assert.match(
    data,
    /\.from\("classes"\)[\s\S]*?\.eq\("school_id", schoolId\)[\s\S]*?\.eq\("branch_id", branchId\)[\s\S]*?\.eq\("id", payload\.class_id\)[\s\S]*?\.eq\("status", "active"\)/
  );
  assert.match(data, /class_outside_student_scope/);
});

test("prevents updating inactive or out-of-scope students", () => {
  assert.match(data, /if \(input\.studentStatus !== "active"\)/);
  assert.match(data, /"students\.manage"/);
  assert.match(
    data,
    /\.from\("students"\)[\s\S]*?\.update\(payload\)[\s\S]*?\.eq\("id", studentId\)[\s\S]*?\.eq\("school_id", schoolId\)[\s\S]*?\.eq\("branch_id", branchId\)[\s\S]*?\.eq\("status", "active"\)/
  );
  assert.match(data, /if \(!data\) throw new RosterValidationError\("student_not_updatable"\)/);
});

test("shows only active students and active classes in manageable branches", () => {
  assert.match(
    data,
    /\.from\("students"\)[\s\S]*?\.eq\("school_id", normalizedSchoolId\)[\s\S]*?\.eq\("status", "active"\)[\s\S]*?\.in\("branch_id", branchIds\)/
  );
  assert.match(
    data,
    /\.from\("classes"\)[\s\S]*?\.eq\("school_id", normalizedSchoolId\)[\s\S]*?\.eq\("status", "active"\)[\s\S]*?\.in\("branch_id", branchIds\)/
  );
  assert.match(launcher, /eligibleClasses\.map/);
  assert.match(launcher, /<option value="">دون حلقة<\/option>/);
});

test("loads only active teachers from the selected class branch", () => {
  assert.match(
    data,
    /\.from\("teachers"\)[\s\S]*?\.eq\("school_id", normalizedSchoolId\)[\s\S]*?\.eq\("branch_id", normalizedBranchId\)/
  );
  assert.match(
    data,
    /filter\(row => row\.status === "active" && row\.branch_id === normalizedBranchId\)/
  );
  assert.match(
    data,
    /\.from\("classes"\)[\s\S]*?\.eq\("branch_id", normalizedBranchId\)[\s\S]*?\.eq\("id", normalizedClassId\)[\s\S]*?\.eq\("status", "active"\)/
  );
});

test("supports primary and assistant assignment roles", () => {
  assert.match(data, /"primary" \| "assistant"/);
  assert.match(launcher, /<option value="primary">معلم أساسي<\/option>/);
  assert.match(launcher, /<option value="assistant">معلم مساعد<\/option>/);
  assert.match(data, /assignment_role: input\.assignmentRole/);
});

test("creates new class teacher assignments with explicit scope", () => {
  const start = data.indexOf("export function buildClassTeacherInsert");
  const end = data.indexOf("export function buildClassTeacherUpdate", start);
  const block = data.slice(start, end);

  for (const field of [
    "school_id",
    "branch_id",
    "class_id",
    "teacher_id",
    "assignment_role",
    'status: "active"',
    "assigned_at",
  ]) {
    assert.match(block, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(data, /\.from\("class_teachers"\)\.insert\(payload\)/);
});

test("reuses an existing assignment instead of creating a duplicate", () => {
  const start = data.indexOf("export async function saveClassTeacherAssignment");
  const end = data.indexOf("export async function deactivateClassTeacherAssignment", start);
  const block = data.slice(start, end);
  const existingCheck = block.indexOf("if (existingData)");
  const update = block.indexOf(".update(buildClassTeacherUpdate", existingCheck);
  const insert = block.indexOf('.from("class_teachers").insert(payload)');

  assert.ok(existingCheck >= 0);
  assert.ok(update > existingCheck);
  assert.ok(insert > update);
  assert.match(block, /\.eq\("class_id", payload\.class_id\)/);
  assert.match(block, /\.eq\("teacher_id", payload\.teacher_id\)/);
});

test("reactivates or changes a role using editable assignment columns only", () => {
  const start = data.indexOf("export function buildClassTeacherUpdate");
  const end = data.indexOf("export function buildDeactivateClassTeacherUpdate", start);
  const block = data.slice(start, end);

  for (const field of ["assignment_role", 'status: "active"', "assigned_at"]) {
    assert.match(block, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of [
    "school_id",
    "branch_id",
    "class_id",
    "teacher_id",
    "created_by",
  ]) {
    assert.equal(block.includes(forbidden), false);
  }
  assert.match(launcher, /إعادة تفعيل/);
});

test("deactivates assignments by status update without DELETE", () => {
  assert.match(data, /return \{ status: "inactive" \}/);
  assert.match(
    data,
    /\.from\("class_teachers"\)[\s\S]*?\.update\(buildDeactivateClassTeacherUpdate\(\)\)/
  );
  assert.match(launcher, /تم إلغاء التعيين دون حذف السجل/);
  assert.doesNotMatch(interfaceSources, /\.delete\s*\(/);
});

test("uses the permissions and constraints already present in migrations", () => {
  assert.match(studentsMigration, /'students\.manage'/);
  assert.match(
    studentsMigration,
    /students_class_branch_school_fk[\s\S]*?foreign key \(school_id, branch_id, class_id\)/
  );
  assert.match(studentsMigration, /grant update \([\s\S]*?class_id/);
  assert.match(teachersMigration, /'teachers\.manage'/);
  assert.match(
    teachersMigration,
    /class_teachers_class_teacher_unique[\s\S]*?unique \(class_id, teacher_id\)/
  );
  assert.match(
    teachersMigration,
    /class_teachers_one_active_primary_per_class_idx[\s\S]*?assignment_role = 'primary' and status = 'active'/
  );
  assert.match(
    teachersMigration,
    /class_teachers_(insert|update)_authorized[\s\S]*?'teachers\.manage'/
  );
});

test("contains no forbidden browser or user-management patterns", () => {
  assert.equal(interfaceSources.includes('.select("*")'), false);
  assert.equal(interfaceSources.includes("service_role"), false);
  assert.equal(interfaceSources.includes("SUPABASE_SERVICE"), false);
  assert.equal(interfaceSources.includes("auth.admin"), false);
  assert.equal(interfaceSources.includes("inviteUserByEmail"), false);
  assert.equal(interfaceSources.includes("createUser"), false);
  assert.equal(interfaceSources.includes(".delete("), false);
});
