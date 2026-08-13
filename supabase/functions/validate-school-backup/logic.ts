export const BACKUP_FORMAT = "quranos-school-backup";
export const BACKUP_FORMAT_VERSION = 1;

export type BackupValidationResult = {
  valid: boolean;
  errors: string[];
  tableCounts: Record<string, number>;
};

const FORBIDDEN_KEYS = new Set([
  "password",
  "password_hash",
  "access_token",
  "refresh_token",
  "service_role",
  "secret_key",
  "recovery_token",
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

export function validateSchoolBackupPackage(
  value: unknown,
  expectedSchoolId: string
): BackupValidationResult {
  const errors: string[] = [];
  const tableCounts: Record<string, number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["invalid_package"], tableCounts };
  }

  const pkg = value as Record<string, unknown>;
  if (pkg.format !== BACKUP_FORMAT) errors.push("invalid_format");
  if (pkg.formatVersion !== BACKUP_FORMAT_VERSION) errors.push("unsupported_version");

  const school = pkg.school as Record<string, unknown> | undefined;
  if (!school || school.id !== expectedSchoolId) errors.push("school_mismatch");

  const tables = pkg.tables;
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    errors.push("invalid_tables");
  } else {
    for (const [tableName, rowsValue] of Object.entries(tables as Record<string, unknown>)) {
      if (!Array.isArray(rowsValue)) {
        errors.push(`invalid_table:${tableName}`);
        continue;
      }
      tableCounts[tableName] = rowsValue.length;
      for (const rowValue of rowsValue) {
        if (!rowValue || typeof rowValue !== "object" || Array.isArray(rowValue)) {
          errors.push(`invalid_row:${tableName}`);
          continue;
        }
        const row = rowValue as Record<string, unknown>;
        if (row.school_id !== expectedSchoolId) errors.push(`tenant_mismatch:${tableName}`);
      }
    }
  }

  if (containsForbiddenKey(pkg)) errors.push("forbidden_secret_field");
  return { valid: errors.length === 0, errors: [...new Set(errors)], tableCounts };
}
