import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const appSource = read("client/src/App.tsx");
const navigationSource = read("client/src/lib/app-navigation.ts");
const pageSource = read("client/src/pages/SchoolBackups.tsx");
const migrationSource = read("supabase/066_school_backup_recovery_foundation.sql");
const handlerSource = read("supabase/functions/create-school-backup/handler.ts");
const r2Source = read("supabase/functions/create-school-backup/r2-storage.ts");

const BACKUP_TABLE_NAMES = [
  "branches",
  "school_memberships",
  "roles",
  "role_permissions",
  "membership_roles",
  "classes",
  "students",
  "teachers",
  "class_teachers",
  "fee_plans",
  "student_charges",
  "payments",
  "student_discounts",
  "expenses",
  "attendance_sessions",
  "attendance_records",
  "attendance_record_history",
  "memorization_records",
  "memorization_record_history",
  "student_guardians",
  "guardian_access_events",
  "app_notifications",
  "official_receipt_counters",
  "official_receipts",
  "registration_leads",
  "registration_lead_events",
  "document_records",
  "document_events",
  "memorization_follow_up_notes",
  "memorization_follow_up_note_history",
  "payroll_compensation_profiles",
  "payroll_periods",
  "payroll_entries",
  "payroll_payments",
  "payroll_audit_events",
  "treasury_accounts",
  "other_income",
  "treasury_transfers",
  "treasury_movements",
  "treasury_audit_events",
  "financial_periods",
  "financial_period_events",
  "treasury_account_reconciliations",
  "staff_positions",
  "notification_campaigns",
  "employees",
];

test("registers an admin-only backup route and navigation item", () => {
  assert.match(appSource, /path="\/backups"/);
  assert.match(appSource, /<ProtectedRoute><Shell><SchoolBackups \/><\/Shell><\/ProtectedRoute>/);
  assert.match(navigationSource, /id: "backups" as const/);
  assert.match(navigationSource, /path: "\/backups"/);
  assert.match(navigationSource, /\.\.\.\(canManageSchool[\s\S]*?id: "backups" as const/);
});

test("backup UI uses the school-scoped backup client", () => {
  assert.match(pageSource, /createAndDownloadSchoolBackup/);
  assert.match(pageSource, /schoolId: school\.id/);
  assert.match(pageSource, /listSchoolBackups\(school\.id\)/);
});

test("migration grants backup permissions only through school roles and protects metadata with RLS", () => {
  for (const permission of ["backup.view", "backup.create", "backup.download", "backup.restore_request"]) {
    assert.ok(migrationSource.includes(`'${permission}'`), `missing ${permission}`);
  }
  assert.match(migrationSource, /'school_admin', 'backup\.view'/);
  assert.match(migrationSource, /alter table public\.school_backup_snapshots enable row level security/i);
  assert.match(migrationSource, /public\.has_school_permission\(school_id, 'backup\.view'\)/);
});

test("export handler isolates every operational table by school_id and excludes credential stores", () => {
  assert.match(handlerSource, /\.eq\("school_id", schoolId\)/);
  assert.match(handlerSource, /snapshotId: snapshot\.id/);
  for (const forbiddenExport of [
    "auth.users",
    "passwords_and_auth_tokens",
    "teacher_invitations",
    "guardian_invitations",
    "guardian_push_subscriptions",
    "platform_secrets",
  ]) {
    assert.ok(handlerSource.includes(`"${forbiddenExport}"`), `missing exclusion ${forbiddenExport}`);
  }
});

test("R2 offsite storage remains private server-side configuration", () => {
  assert.match(r2Source, /QURANOS_BACKUP_R2_ENDPOINT/);
  assert.match(r2Source, /QURANOS_BACKUP_R2_BUCKET/);
  assert.match(r2Source, /QURANOS_BACKUP_R2_ACCESS_KEY_ID/);
  assert.match(r2Source, /QURANOS_BACKUP_R2_SECRET_ACCESS_KEY/);
  assert.match(r2Source, /\.r2\.cloudflarestorage\.com/);
  assert.match(r2Source, /region: "auto"/);
  assert.doesNotMatch(r2Source, /VITE_/);
  assert.doesNotMatch(r2Source, /NEXT_PUBLIC_/);
});

test("restore dry-run validator rejects incomplete, cross-school, extra-table and secret packages", async () => {
  const validatorUrl = pathToFileURL(
    new URL("../supabase/functions/validate-school-backup/logic.ts", import.meta.url).pathname
  ).href;
  const { validateSchoolBackupPackage } = await import(validatorUrl);

  const schoolId = "10000000-0000-4000-8000-000000000001";
  const tables = Object.fromEntries(BACKUP_TABLE_NAMES.map(name => [name, []]));
  tables.students = [{ id: "student-1", school_id: schoolId }];

  const validPackage = {
    format: "quranos-school-backup",
    formatVersion: 1,
    snapshotId: "40000000-0000-4000-8000-000000000004",
    generatedAt: "2026-08-14T00:00:00.000Z",
    school: { id: schoolId, name: "Test School" },
    profiles: [],
    permissionCatalog: [],
    tables,
    storage: {
      documentsIncluded: false,
      documentObjectPaths: [],
    },
  };

  const valid = validateSchoolBackupPackage(validPackage, schoolId);
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.snapshotId, validPackage.snapshotId);
  assert.equal(valid.tableCounts.students, 1);

  const wrongTenant = structuredClone(validPackage);
  wrongTenant.tables.students[0].school_id = "20000000-0000-4000-8000-000000000002";
  const tenantResult = validateSchoolBackupPackage(wrongTenant, schoolId);
  assert.equal(tenantResult.valid, false);
  assert.ok(tenantResult.errors.includes("tenant_mismatch:students"));

  const secretPackage = structuredClone(validPackage);
  secretPackage.tables.students[0].password = "must-never-be-restored";
  const secretResult = validateSchoolBackupPackage(secretPackage, schoolId);
  assert.equal(secretResult.valid, false);
  assert.ok(secretResult.errors.includes("forbidden_secret_field"));

  const wrongSchool = structuredClone(validPackage);
  wrongSchool.school.id = "20000000-0000-4000-8000-000000000002";
  const schoolResult = validateSchoolBackupPackage(wrongSchool, schoolId);
  assert.equal(schoolResult.valid, false);
  assert.ok(schoolResult.errors.includes("school_mismatch"));

  const extraTable = structuredClone(validPackage);
  extraTable.tables.auth_users = [];
  const extraTableResult = validateSchoolBackupPackage(extraTable, schoolId);
  assert.equal(extraTableResult.valid, false);
  assert.ok(extraTableResult.errors.includes("unexpected_table:auth_users"));

  const missingTable = structuredClone(validPackage);
  delete missingTable.tables.payments;
  const missingTableResult = validateSchoolBackupPackage(missingTable, schoolId);
  assert.equal(missingTableResult.valid, false);
  assert.ok(missingTableResult.errors.includes("missing_table:payments"));
});
