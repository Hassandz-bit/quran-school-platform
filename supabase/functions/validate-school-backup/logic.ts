export const BACKUP_FORMAT = "quranos-school-backup";
export const BACKUP_FORMAT_VERSION = 1;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BACKUP_TABLES = [
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
] as const;
const BACKUP_TABLE_SET = new Set<string>(BACKUP_TABLES);

export type BackupValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tableCounts: Record<string, number>;
  snapshotId: string | null;
};

const FORBIDDEN_KEYS = new Set([
  "password",
  "password_hash",
  "access_token",
  "refresh_token",
  "service_role",
  "secret_key",
  "private_key",
  "recovery_token",
  "token_hash",
  "auth_key",
  "p256dh",
]);

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return true;
    if (containsForbiddenKey(nested)) return true;
  }
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateScopedProfiles(
  pkg: Record<string, unknown>,
  tables: Record<string, unknown[]>,
  errors: string[]
) {
  const allowedIds = new Set<string>();
  const references = [
    ["school_memberships", "profile_id"],
    ["teachers", "profile_id"],
    ["student_guardians", "guardian_profile_id"],
    ["employees", "linked_profile_id"],
  ] as const;

  for (const [tableName, column] of references) {
    for (const rowValue of tables[tableName] ?? []) {
      if (!isObject(rowValue)) continue;
      const value = rowValue[column];
      if (typeof value === "string") allowedIds.add(value);
    }
  }

  if (!Array.isArray(pkg.profiles)) {
    errors.push("invalid_profiles");
    return;
  }

  for (const profileValue of pkg.profiles) {
    if (!isObject(profileValue) || typeof profileValue.id !== "string") {
      errors.push("invalid_profile");
      continue;
    }
    if (!allowedIds.has(profileValue.id)) {
      errors.push("unscoped_profile");
    }
  }
}

function validatePermissionCatalog(
  pkg: Record<string, unknown>,
  tables: Record<string, unknown[]>,
  errors: string[]
) {
  const allowedIds = new Set<string>();
  for (const rowValue of tables.role_permissions ?? []) {
    if (!isObject(rowValue)) continue;
    const permissionId = rowValue.permission_id;
    if (typeof permissionId === "string") allowedIds.add(permissionId);
  }

  if (!Array.isArray(pkg.permissionCatalog)) {
    errors.push("invalid_permission_catalog");
    return;
  }

  for (const permissionValue of pkg.permissionCatalog) {
    if (!isObject(permissionValue) || typeof permissionValue.id !== "string") {
      errors.push("invalid_permission");
      continue;
    }
    if (!allowedIds.has(permissionValue.id)) {
      errors.push("unscoped_permission");
    }
  }
}

export function validateSchoolBackupPackage(
  value: unknown,
  expectedSchoolId: string
): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tableCounts: Record<string, number> = {};
  let snapshotId: string | null = null;

  if (!isObject(value)) {
    return {
      valid: false,
      errors: ["invalid_package"],
      warnings,
      tableCounts,
      snapshotId,
    };
  }

  const pkg = value;
  if (pkg.format !== BACKUP_FORMAT) errors.push("invalid_format");
  if (pkg.formatVersion !== BACKUP_FORMAT_VERSION) {
    errors.push("unsupported_version");
  }

  if (typeof pkg.snapshotId === "string" && UUID_RE.test(pkg.snapshotId)) {
    snapshotId = pkg.snapshotId;
  } else {
    errors.push("invalid_snapshot_id");
  }

  const generatedAt = typeof pkg.generatedAt === "string" ? Date.parse(pkg.generatedAt) : NaN;
  if (!Number.isFinite(generatedAt)) errors.push("invalid_generated_at");

  const school = isObject(pkg.school) ? pkg.school : null;
  if (!school || school.id !== expectedSchoolId) errors.push("school_mismatch");

  const rawTables = pkg.tables;
  const tables: Record<string, unknown[]> = {};
  if (!isObject(rawTables)) {
    errors.push("invalid_tables");
  } else {
    for (const tableName of BACKUP_TABLES) {
      const rowsValue = rawTables[tableName];
      if (!Array.isArray(rowsValue)) {
        errors.push(`missing_table:${tableName}`);
        continue;
      }
      tables[tableName] = rowsValue;
      tableCounts[tableName] = rowsValue.length;
      for (const rowValue of rowsValue) {
        if (!isObject(rowValue)) {
          errors.push(`invalid_row:${tableName}`);
          continue;
        }
        if (rowValue.school_id !== expectedSchoolId) {
          errors.push(`tenant_mismatch:${tableName}`);
        }
      }
    }

    for (const tableName of Object.keys(rawTables)) {
      if (!BACKUP_TABLE_SET.has(tableName)) {
        errors.push(`unexpected_table:${tableName}`);
      }
    }
  }

  validateScopedProfiles(pkg, tables, errors);
  validatePermissionCatalog(pkg, tables, errors);

  if (!isObject(pkg.storage)) {
    errors.push("invalid_storage_manifest");
  } else {
    const documentPaths = pkg.storage.documentObjectPaths;
    if (!Array.isArray(documentPaths) || documentPaths.some(path => typeof path !== "string")) {
      errors.push("invalid_document_paths");
    }
    if (pkg.storage.documentsIncluded !== false) {
      errors.push("unsupported_document_embedding");
    } else if (Array.isArray(documentPaths) && documentPaths.length > 0) {
      warnings.push("document_files_not_embedded");
    }
  }

  if (containsForbiddenKey(pkg)) errors.push("forbidden_secret_field");

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    tableCounts,
    snapshotId,
  };
}
