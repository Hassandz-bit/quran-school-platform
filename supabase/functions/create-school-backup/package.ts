export const SCHOOL_BACKUP_TABLES = [
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

export const SCHOOL_BACKUP_EXCLUSIONS = [
  "auth.users",
  "passwords_and_auth_tokens",
  "teacher_invitations",
  "guardian_invitations",
  "guardian_push_subscriptions",
  "guardian_notification_deliveries",
  "platform_secrets",
] as const;

export type SchoolBackupPackageInput = {
  snapshotId: string;
  generatedAt: string;
  school: Record<string, unknown>;
  profiles: unknown[];
  permissionCatalog: unknown[];
  tables: Record<string, unknown[]>;
  documentObjectPaths: string[];
};

export type SerializedSchoolBackupPackage = {
  packageData: Record<string, unknown>;
  serialized: string;
  checksumSha256: string;
  byteSize: number;
};

export function buildSchoolBackupPackage(input: SchoolBackupPackageInput) {
  return {
    format: "quranos-school-backup",
    formatVersion: 1,
    snapshotId: input.snapshotId,
    generatedAt: input.generatedAt,
    school: input.school,
    profiles: input.profiles,
    permissionCatalog: input.permissionCatalog,
    tables: input.tables,
    storage: {
      documentsIncluded: false,
      documentObjectPaths: input.documentObjectPaths,
    },
    exclusions: [...SCHOOL_BACKUP_EXCLUSIONS],
  };
}

async function sha256Hex(text: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function serializeSchoolBackupPackage(
  input: SchoolBackupPackageInput
): Promise<SerializedSchoolBackupPackage> {
  const packageData = buildSchoolBackupPackage(input);
  const serialized = JSON.stringify(packageData);
  return {
    packageData,
    serialized,
    checksumSha256: await sha256Hex(serialized),
    byteSize: new TextEncoder().encode(serialized).byteLength,
  };
}
