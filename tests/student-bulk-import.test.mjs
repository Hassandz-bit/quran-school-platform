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

test("student and guardian screens expose Arabic import templates", async () => {
  const [studentPage, guardianPage, client] = await Promise.all([
    read("client/src/pages/StudentBulkImport.tsx"),
    read("client/src/pages/Guardians.tsx"),
    read("client/src/lib/student-import.ts"),
  ]);
  assert.match(studentPage, /تنزيل نموذج Excel/);
  assert.match(guardianPage, /نموذج استيراد الأولياء/);
  assert.match(client, /downloadGuardianImportTemplate/);
  assert.match(client, /mode: "guardian-template"/);
});

test("choosing a new workbook clears any stale preview before commit", async () => {
  const page = await read("client/src/pages/StudentBulkImport.tsx");
  assert.match(page, /const handleFileChange = \(nextFile: File \| null\)[\s\S]*?setFile\(nextFile\)[\s\S]*?setBatch\(null\)[\s\S]*?setRows\(\[\]\)/);
  assert.match(page, /disabled=\{busy !== null\}[\s\S]*?onChange=\{event => handleFileChange\(event\.target\.files\?\.\[0\] \?\? null\)\}/);
});

test("browser import client rejects oversized files before Base64 encoding", async () => {
  const client = await read("client/src/lib/student-import.ts");
  const sizeIndex = client.indexOf("file.size > MAX_STUDENT_IMPORT_FILE_BYTES");
  const encodeIndex = client.indexOf("fileToBase64(file)");
  assert.ok(sizeIndex >= 0 && encodeIndex > sizeIndex);
});

test("downloaded issue reports neutralize spreadsheet formula prefixes", async () => {
  const client = await read("client/src/lib/student-import.ts");
  assert.ok(client.includes("const safe = /^[=+\\-@\\t\\r]/.test(raw) ? `'${raw}` : raw;"));
});

test("browser import client never contains privileged Supabase credentials", async () => {
  const client = await read("client/src/lib/student-import.ts");
  assert.doesNotMatch(client, /SERVICE_ROLE|service_role|SUPABASE_SECRET_KEY/);
});

test("student import Edge Function validates bearer and encoded size before workbook decoding", async () => {
  const [config, handler] = await Promise.all([
    read("supabase/config.toml"),
    read("supabase/functions/import-students/handler.ts"),
  ]);
  assert.match(config, /\[functions\.import-students\][\s\S]*?verify_jwt = false/);
  const bearerIndex = handler.indexOf("getBearer(request)");
  const sizeIndex = handler.indexOf("fileBase64.length > MAX_FILE_BASE64_CHARS");
  const decodeIndex = handler.indexOf("decodeBase64(fileBase64)");
  const parseIndex = handler.indexOf("parseStudentWorkbook(bytes)");
  assert.ok(bearerIndex >= 0 && sizeIndex > bearerIndex && decodeIndex > sizeIndex && parseIndex > decodeIndex);
  assert.match(handler, /authorizeImporter\(userClient, schoolId/);
  assert.match(handler, /invalid_workbook/);
});

test("migration keeps staging private and rechecks authorization on commit", async () => {
  const migration = await read("supabase/028_student_bulk_import.sql");
  assert.match(migration, /revoke all on public\.student_import_batches, public\.student_import_rows[\s\S]*?authenticated/);
  assert.match(migration, /commit_student_import_batch/);
  assert.match(migration, /has_branch_permission\([\s\S]*?'students\.manage'/);
  assert.match(migration, /duplicate_detected_at_commit/);
});

test("PLpgSQL ambiguity fix is compatible with hosted Supabase", async () => {
  const migration = await read("supabase/030_student_bulk_import_plpgsql_resolution.sql");
  assert.match(migration, /#variable_conflict use_variable/);
  assert.match(migration, /procedure\.prosrc/);
  assert.match(migration, /create or replace function public\.stage_student_import_batch/);
  assert.match(migration, /create or replace function public\.commit_student_import_batch/);
  assert.doesNotMatch(
    migration,
    /alter\s+function[\s\S]{0,180}?set\s+plpgsql\.variable_conflict\s*=\s*'use_variable'/i,
  );
  assert.match(migration, /student_import_hosted_incompatible_variable_conflict_guc/);
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

test("guardian bulk import is routed from the directory and confirms before sending", async () => {
  const [app, directory, page, client] = await Promise.all([
    read("client/src/App.tsx"),
    read("client/src/pages/Guardians.tsx"),
    read("client/src/pages/GuardianBulkImport.tsx"),
    read("client/src/lib/guardian-import.ts"),
  ]);
  assert.match(app, /path="\/guardians\/import"[\s\S]*?<GuardianBulkImport \/>/);
  assert.match(directory, /setLocation\("\/guardians\/import"\)/);
  assert.match(page, /previewGuardianImport\(school\.id, file\)/);
  assert.match(page, /setConfirmOpen\(true\)/);
  assert.match(page, /inviteGuardian\(/);
  assert.match(page, /لا يمكن التراجع عنه/);
  assert.match(client, /mode: "guardian-preview"/);
  assert.match(client, /file\.size > MAX_GUARDIAN_IMPORT_FILE_BYTES/);
  assert.ok(client.includes("const safe = /^[=+\\-@\\t\\r]/.test(raw) ? `'${raw}` : raw;"));
});

test("guardian import previews only permission-scoped students and rejects ambiguous or duplicate rows", async () => {
  const [handler, importer] = await Promise.all([
    read("supabase/functions/import-students/handler.ts"),
    read("supabase/functions/import-students/guardian-import.ts"),
  ]);
  assert.match(handler, /mode === "guardian-preview"/);
  assert.match(handler, /guardianMode \? "guardians\.link"/);
  assert.match(importer, /list_guardian_invite_students/);
  assert.match(importer, /student_ambiguous/);
  assert.match(importer, /duplicate_relationship/);
  assert.match(importer, /multiple_primary_guardians/);
  assert.match(importer, /MAX_GUARDIAN_ROWS = 500/);
});

test("guardian invitations accept and save an optional imported phone number", async () => {
  const [logic, services, client] = await Promise.all([
    read("supabase/functions/invite-guardian/logic.ts"),
    read("supabase/functions/invite-guardian/services.ts"),
    read("client/src/lib/guardians.ts"),
  ]);
  assert.match(logic, /normalizeGuardianPhone/);
  assert.match(logic, /phone: normalizeGuardianPhone\(record\.phone\)/);
  assert.match(services, /update\(\{ phone \}\)/);
  assert.match(services, /phone,\s*locale: "ar"/);
  assert.match(client, /phone: input\.phone\?\.trim\(\) \|\| undefined/);
});

test("guardian invitations can be filtered and sent by cohort while retaining per-row outcomes", async () => {
  const [directory, page, importer] = await Promise.all([
    read("client/src/pages/Guardians.tsx"),
    read("client/src/pages/GuardianBulkImport.tsx"),
    read("supabase/functions/import-students/guardian-import.ts"),
  ]);
  assert.match(directory, /guardianDirectoryCohortKey/);
  assert.match(directory, /matchesGuardianStatus/);
  assert.match(directory, /قُبلت الدعوة/);
  assert.match(directory, /أُرسلت الدعوة/);
  assert.match(page, /studentClassName/);
  assert.match(page, /selectedRowNumbers\.has\(row\.rowNumber\)/);
  assert.match(page, /cohortOptions/);
  assert.match(importer, /studentClassName: matched\?\.className/);
});

test("new-student paper form is blank, printable, bilingual, and available from registration", async () => {
  const [app, studentForm, paperForm, copy] = await Promise.all([
    read("client/src/App.tsx"),
    read("client/src/pages/AddStudentForm.tsx"),
    read("client/src/pages/PrintableStudentRegistrationForm.tsx"),
    read("client/src/lib/printable-registration-form-copy.ts"),
  ]);
  assert.match(app, /path="\/students\/registration-form"[\s\S]*?StudentsRoute requireManage/);
  assert.match(studentForm, /setLocation\("\/students\/registration-form"\)/);
  assert.match(paperForm, /window\.print\(\)/);
  assert.match(paperForm, /registration-sheet:last-of-type/);
  assert.match(paperForm, /guardianDeclaration/);
  assert.match(paperForm, /additionalGuardianName/);
  assert.match(copy, /ar: \{/);
  assert.match(copy, /en: \{/);
  assert.match(copy, /firstName: "الاسم الأول"/);
  assert.match(copy, /guardianPhone: "رقم هاتف ولي الأمر"/);
});
