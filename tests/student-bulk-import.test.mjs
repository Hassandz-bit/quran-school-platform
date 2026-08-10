import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/028_student_bulk_import.sql");
const importLib = read("client/src/lib/student-import.ts");
const importPage = read("client/src/pages/StudentImport.tsx");
const studentsRoute = read("client/src/components/StudentsRoute.tsx");
const studentsList = read("client/src/pages/StudentsList.tsx");
const app = read("client/src/App.tsx");

test("bulk import audit tables are private and browser writes are RPC-only", () => {
  assert.match(migration, /create table public\.student_import_batches/i);
  assert.match(migration, /create table public\.student_import_batch_students/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.student_import_batches, public\.student_import_batch_students[\s\S]*authenticated/i);
  assert.doesNotMatch(importLib, /\.from\(["']student_import_batches["']\)/);
  assert.doesNotMatch(importLib, /\.from\(["']student_import_batch_students["']\)/);
  assert.match(importLib, /rpc\("preview_student_import"/);
  assert.match(importLib, /rpc\("commit_student_import"/);
  assert.match(importLib, /rpc\("rollback_student_import"/);
});

test("preview and commit are separate, bounded, and revalidate exact branch permissions", () => {
  assert.match(migration, /create or replace function public\.preview_student_import/i);
  assert.match(migration, /create or replace function public\.commit_student_import/i);
  assert.match(migration, /jsonb_array_length\(target_rows\) > 2000/i);
  assert.match(migration, /has_branch_permission\(target_school_id, branch_id_value, 'students\.manage'\)/i);
  assert.match(migration, /student_import_manage_denied/i);
  assert.match(migration, /student_import_validate_one\(target_school_id, item\.row_data\)/i);
  assert.match(importPage, /معاينة قبل الاعتماد/);
  assert.match(importPage, /window\.confirm\(copy\.commitConfirm\)/);
});

test("duplicate detection covers existing records and duplicates inside the file", () => {
  assert.match(migration, /btrim\(student\.national_id\) = national_id_value/i);
  assert.match(migration, /regexp_replace\(student\.guardian_phone/i);
  assert.match(migration, /possible_duplicate_name_birthdate/i);
  assert.match(migration, /duplicate_in_file/i);
  assert.match(importLib, /downloadStudentImportIssues/);
});

test("import audit stores identifiers and counts, not raw spreadsheet PII", () => {
  const batchDefinition = migration.match(/create table public\.student_import_batches \([\s\S]*?\n\);/i)?.[0] ?? "";
  const batchStudentDefinition = migration.match(/create table public\.student_import_batch_students \([\s\S]*?\n\);/i)?.[0] ?? "";
  for (const sensitive of ["first_name", "last_name", "guardian_phone", "guardian_email", "national_id", "address"]) {
    assert.doesNotMatch(batchDefinition, new RegExp(`\\b${sensitive}\\b`, "i"));
    assert.doesNotMatch(batchStudentDefinition, new RegExp(`\\b${sensitive}\\b`, "i"));
  }
  assert.match(batchDefinition, /source_filename text/i);
  assert.match(batchDefinition, /imported_rows integer/i);
  assert.match(batchStudentDefinition, /student_id uuid/i);
});

test("rollback is time bounded and refuses students with downstream records", () => {
  assert.match(migration, /interval '24 hours'/i);
  assert.match(migration, /from public\.student_guardians/i);
  assert.match(migration, /from public\.attendance_records/i);
  assert.match(migration, /from public\.memorization_records/i);
  assert.match(migration, /from public\.student_charges/i);
  assert.match(migration, /from public\.student_discounts/i);
  assert.match(migration, /from public\.official_receipts/i);
  assert.match(migration, /rollback_partial/i);
  assert.match(importPage, /تراجع آمن/);
});

test("Excel loader is lazy, version pinned, and provides template plus issue workbook", () => {
  assert.match(importLib, /cdn\.sheetjs\.com\/xlsx-0\.20\.3\/package\/xlsx\.mjs/);
  assert.match(importLib, /import\(\/\* @vite-ignore \*\/ SHEETJS_MODULE_URL\)/);
  assert.match(importLib, /QuranOS_students_import_template\.xlsx/);
  assert.match(importLib, /"STUDENTS"/);
  assert.match(importLib, /"LOOKUPS"/);
  assert.match(importLib, /"INSTRUCTIONS"/);
  assert.match(importLib, /QuranOS_student_import_issues\.xlsx/);
});

test("student routes use database-backed view/manage authorization", () => {
  assert.match(studentsRoute, /fetchStudentManagementAccess/);
  assert.match(studentsRoute, /requireManage \? access\.canManage : access\.canView/);
  assert.match(app, /path="\/students\/import"[\s\S]*?<StudentsRoute requireManage>/);
  assert.match(app, /path="\/students\/new"[\s\S]*?<StudentsRoute requireManage>/);
  assert.match(app, /path="\/students\/:studentId"[\s\S]*?<StudentsRoute>/);
  assert.match(app, /path="\/students"[\s\S]*?<StudentsRoute>/);
  assert.match(studentsList, /setLocation\("\/students\/import"\)/);
  assert.match(studentsList, /canManage &&/);
});
