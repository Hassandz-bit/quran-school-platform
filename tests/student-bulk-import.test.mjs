import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("student import route is permission-aware and preview is explicit", async () => {
  const [app, students, page] = await Promise.all([
    read("client/src/App.tsx"),
    read("client/src/pages/StudentsList.tsx"),
    read("client/src/pages/StudentBulkImport.tsx"),
  ]);
  assert.match(app, /path="\/students\/import"[\s\S]*?<StudentsRoute requireManage>/);
  assert.match(students, /setLocation\("\/students\/import"\)/);
  assert.match(page, /previewStudentImport/);
  assert.match(page, /commitStudentImport/);
});

test("choosing a new workbook clears any stale preview before commit", async () => {
  const page = await read("client/src/pages/StudentBulkImport.tsx");
  assert.match(page, /const handleFileChange = \(nextFile: File \| null\)[\s\S]*?setFile\(nextFile\)[\s\S]*?setBatch\(null\)[\s\S]*?setRows\(\[\]\)/);
  assert.match(page, /disabled=\{busy !== null\}[\s\S]*?onChange=\{event => handleFileChange\(event\.target\.files\?\.\[0\] \?\? null\)\}/);
});

test("browser import client never contains privileged Supabase credentials", async () => {
  const client = await read("client/src/lib/student-import.ts");
  assert.doesNotMatch(client, /SERVICE_ROLE|service_role|SUPABASE_SECRET_KEY/);
});

test("student import Edge Function validates bearer before parsing workbooks", async () => {
  const [config, handler] = await Promise.all([
    read("supabase/config.toml"),
    read("supabase/functions/import-students/handler.ts"),
  ]);
  assert.match(config, /\[functions\.import-students\][\s\S]*?verify_jwt = false/);
  const bearerIndex = handler.indexOf("getBearer(request)");
  const parseIndex = handler.indexOf("parseStudentWorkbook(bytes)");
  assert.ok(bearerIndex >= 0 && parseIndex > bearerIndex);
  assert.match(handler, /authorizeImporter\(userClient, schoolId\)/);
});

test("migration keeps staging private and rechecks authorization on commit", async () => {
  const migration = await read("supabase/028_student_bulk_import.sql");
  assert.match(migration, /revoke all on public\.student_import_batches, public\.student_import_rows[\s\S]*?authenticated/);
  assert.match(migration, /commit_student_import_batch/);
  assert.match(migration, /has_branch_permission\([\s\S]*?'students\.manage'/);
  assert.match(migration, /duplicate_detected_at_commit/);
});

test("import ledger reads require active school membership", async () => {
  const hardening = await read("supabase/031_student_bulk_import_rollback_fk_order.sql");
  assert.match(hardening, /get_student_import_batch[\s\S]*?is_active_school_member\(batch\.school_id\)/);
  assert.match(hardening, /list_student_import_rows[\s\S]*?is_active_school_member\(batch\.school_id\)/);
});

test("rollback is batch-scoped and blocked after downstream activity", async () => {
  const consistency = await read("supabase/029_student_bulk_import_consistency.sql");
  assert.match(consistency, /student_guardians/);
  assert.match(consistency, /attendance_records/);
  assert.match(consistency, /memorization_records/);
  assert.match(consistency, /student_charges/);
  assert.match(consistency, /payments/);
  assert.match(consistency, /official_receipts/);
  assert.match(consistency, /student_import_rollback_blocked_by_activity/);
});
