import { getSupabaseClient } from "@/lib/supabase";

const BACKUP_FORMAT = "quranos-school-backup";
const BACKUP_FORMAT_VERSION = 1;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
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

export type BackupDryRunResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tableCounts: Record<string, number>;
  totalRecords: number;
  snapshotId: string | null;
  checksumSha256: string | null;
  integrity: "verified" | "unregistered" | "registry_unavailable" | "unchecked";
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isObject(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return true;
    if (containsForbiddenKey(nested)) return true;
  }
  return false;
}

async function sha256Hex(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validatePackage(value: unknown, expectedSchoolId: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tableCounts: Record<string, number> = {};
  let snapshotId: string | null = null;

  if (!isObject(value)) {
    return { errors: ["invalid_package"], warnings, tableCounts, snapshotId };
  }

  if (value.format !== BACKUP_FORMAT) errors.push("invalid_format");
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) errors.push("unsupported_version");

  if (typeof value.snapshotId === "string" && UUID_RE.test(value.snapshotId)) {
    snapshotId = value.snapshotId;
  } else {
    errors.push("invalid_snapshot_id");
  }

  const generatedAt = typeof value.generatedAt === "string" ? Date.parse(value.generatedAt) : NaN;
  if (!Number.isFinite(generatedAt)) errors.push("invalid_generated_at");

  const school = isObject(value.school) ? value.school : null;
  if (!school || school.id !== expectedSchoolId) errors.push("school_mismatch");

  const tables: Record<string, unknown[]> = {};
  if (!isObject(value.tables)) {
    errors.push("invalid_tables");
  } else {
    for (const tableName of BACKUP_TABLES) {
      const rows = value.tables[tableName];
      if (!Array.isArray(rows)) {
        errors.push(`missing_table:${tableName}`);
        continue;
      }
      tables[tableName] = rows;
      tableCounts[tableName] = rows.length;
      for (const rowValue of rows) {
        if (!isObject(rowValue)) {
          errors.push(`invalid_row:${tableName}`);
          continue;
        }
        if (rowValue.school_id !== expectedSchoolId) {
          errors.push(`tenant_mismatch:${tableName}`);
        }
      }
    }

    for (const tableName of Object.keys(value.tables)) {
      if (!BACKUP_TABLE_SET.has(tableName)) errors.push(`unexpected_table:${tableName}`);
    }
  }

  const allowedProfileIds = new Set<string>();
  for (const [tableName, column] of [
    ["school_memberships", "profile_id"],
    ["teachers", "profile_id"],
    ["student_guardians", "guardian_profile_id"],
    ["employees", "linked_profile_id"],
  ] as const) {
    for (const rowValue of tables[tableName] ?? []) {
      if (!isObject(rowValue)) continue;
      const id = rowValue[column];
      if (typeof id === "string") allowedProfileIds.add(id);
    }
  }

  if (!Array.isArray(value.profiles)) {
    errors.push("invalid_profiles");
  } else {
    for (const profileValue of value.profiles) {
      if (!isObject(profileValue) || typeof profileValue.id !== "string") {
        errors.push("invalid_profile");
      } else if (!allowedProfileIds.has(profileValue.id)) {
        errors.push("unscoped_profile");
      }
    }
  }

  const allowedPermissionIds = new Set<string>();
  for (const rowValue of tables.role_permissions ?? []) {
    if (!isObject(rowValue)) continue;
    if (typeof rowValue.permission_id === "string") {
      allowedPermissionIds.add(rowValue.permission_id);
    }
  }

  if (!Array.isArray(value.permissionCatalog)) {
    errors.push("invalid_permission_catalog");
  } else {
    for (const permissionValue of value.permissionCatalog) {
      if (!isObject(permissionValue) || typeof permissionValue.id !== "string") {
        errors.push("invalid_permission");
      } else if (!allowedPermissionIds.has(permissionValue.id)) {
        errors.push("unscoped_permission");
      }
    }
  }

  if (!isObject(value.storage)) {
    errors.push("invalid_storage_manifest");
  } else {
    const paths = value.storage.documentObjectPaths;
    if (!Array.isArray(paths) || paths.some(path => typeof path !== "string")) {
      errors.push("invalid_document_paths");
    }
    if (value.storage.documentsIncluded !== false) {
      errors.push("unsupported_document_embedding");
    } else if (Array.isArray(paths) && paths.length > 0) {
      warnings.push("document_files_not_embedded");
    }
  }

  if (containsForbiddenKey(value)) errors.push("forbidden_secret_field");

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    tableCounts,
    snapshotId,
  };
}

export async function dryRunSchoolBackupFile(
  file: File,
  schoolId: string
): Promise<BackupDryRunResult> {
  if (file.size <= 0 || file.size > MAX_BACKUP_BYTES) {
    return {
      valid: false,
      errors: [file.size <= 0 ? "invalid_package" : "backup_too_large"],
      warnings: [],
      tableCounts: {},
      totalRecords: 0,
      snapshotId: null,
      checksumSha256: null,
      integrity: "unchecked",
    };
  }

  const text = await file.text();
  const checksumSha256 = await sha256Hex(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      valid: false,
      errors: ["invalid_package"],
      warnings: [],
      tableCounts: {},
      totalRecords: 0,
      snapshotId: null,
      checksumSha256,
      integrity: "unchecked",
    };
  }

  const structural = validatePackage(parsed, schoolId);
  const errors = [...structural.errors];
  const warnings = [...structural.warnings];
  let integrity: BackupDryRunResult["integrity"] = "unchecked";

  if (structural.snapshotId) {
    const { data, error } = await getSupabaseClient()
      .from("school_backup_snapshots")
      .select("id,status,checksum_sha256")
      .eq("id", structural.snapshotId)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (error) {
      integrity = "registry_unavailable";
      warnings.push("integrity_registry_unavailable");
    } else if (!data) {
      integrity = "unregistered";
      warnings.push("snapshot_not_registered");
    } else if (data.status !== "ready" || !data.checksum_sha256) {
      errors.push("snapshot_not_ready");
    } else if (data.checksum_sha256 !== checksumSha256) {
      errors.push("checksum_mismatch");
    } else {
      integrity = "verified";
    }
  }

  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set(warnings)];
  const totalRecords = Object.values(structural.tableCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    tableCounts: structural.tableCounts,
    totalRecords,
    snapshotId: structural.snapshotId,
    checksumSha256,
    integrity,
  };
}
