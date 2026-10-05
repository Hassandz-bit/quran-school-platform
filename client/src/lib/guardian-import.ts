import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export type GuardianImportStatus = "ready" | "error" | "duplicate" | "sent" | "delivery_error";
export type GuardianImportRow = {
  rowNumber: number;
  payload: Record<string, string | number>;
  rowStatus: GuardianImportStatus;
  issues: string[];
  studentId: string | null;
  studentName: string | null;
  studentClassName: string | null;
};

const MAX_GUARDIAN_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
  reader.onload = () => {
    const result = String(reader.result ?? "");
    const comma = result.indexOf(",");
    resolve(comma >= 0 ? result.slice(comma + 1) : result);
  };
  reader.readAsDataURL(file);
});

export async function previewGuardianImport(
  schoolId: string,
  file: File,
  client: SupabaseClient = getSupabaseClient(),
): Promise<GuardianImportRow[]> {
  if (file.size === 0 || file.size > MAX_GUARDIAN_IMPORT_FILE_BYTES) {
    throw new Error("guardian_import_file_size");
  }
  const fileBase64 = await fileToBase64(file);
  const { data, error } = await client.functions.invoke("import-students", {
    body: { mode: "guardian-preview", schoolId, fileName: file.name, fileBase64 },
  });
  if (error || !Array.isArray(data?.rows)) throw error ?? new Error("guardian_import_preview_failed");
  return data.rows.map((row: Record<string, unknown>) => ({
    rowNumber: Number(row.rowNumber),
    payload: (row.payload ?? {}) as Record<string, string | number>,
    rowStatus: row.rowStatus as GuardianImportStatus,
    issues: Array.isArray(row.issues) ? row.issues.map(String) : [],
    studentId: row.studentId ? String(row.studentId) : null,
    studentName: row.studentName ? String(row.studentName) : null,
    studentClassName: row.studentClassName ? String(row.studentClassName) : null,
  }));
}

export function downloadGuardianImportErrors(rows: GuardianImportRow[]) {
  const failing = rows.filter(row => row.rowStatus === "error" || row.rowStatus === "duplicate" || row.rowStatus === "delivery_error");
  const headers = ["row_number", "status", "issues", "student_name", "branch_code", "guardian_name", "email", "phone", "relationship_type"];
  const escape = (value: unknown) => {
    const raw = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.split('"').join('""')}"`;
  };
  const lines = [headers.join(",")];
  for (const row of failing) {
    lines.push([
      row.rowNumber,
      row.rowStatus,
      row.issues.join("|"),
      row.payload.student_name,
      row.payload.branch_code,
      row.payload.guardian_name,
      row.payload.email,
      row.payload.phone,
      row.payload.relationship_type,
    ].map(escape).join(","));
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "quranos-guardian-import-report.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
