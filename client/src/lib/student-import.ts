import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type StudentImportStatus = "staged" | "committed" | "rolled_back" | "failed";
export type StudentImportRowStatus = "ready" | "warning" | "duplicate" | "error" | "created";

export type StudentImportBatch = {
  batchId: string;
  schoolId: string;
  fileName: string;
  status: StudentImportStatus;
  totalCount: number;
  readyCount: number;
  warningCount: number;
  duplicateCount: number;
  errorCount: number;
  createdCount: number;
  createdAt: string;
  committedAt: string | null;
  rolledBackAt: string | null;
};

export type StudentImportRow = {
  rowNumber: number;
  payload: Record<string, string | number>;
  rowStatus: StudentImportRowStatus;
  issues: string[];
  duplicateStudentId: string | null;
  createdStudentId: string | null;
};

const MAX_STUDENT_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

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

const downloadBase64 = (fileName: string, mimeType: string, base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export async function downloadStudentImportTemplate(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient(),
) {
  const { data, error } = await client.functions.invoke("import-students", {
    body: { mode: "template", schoolId },
  });
  if (error || !data?.fileBase64) throw error ?? new Error("template_failed");
  downloadBase64(
    String(data.fileName ?? "quranos-student-import-template.xlsx"),
    String(data.mimeType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    String(data.fileBase64),
  );
}

export async function previewStudentImport(
  schoolId: string,
  file: File,
  client: SupabaseClient = getSupabaseClient(),
) {
  if (file.size === 0 || file.size > MAX_STUDENT_IMPORT_FILE_BYTES) {
    throw new Error("student_import_file_size");
  }
  const fileBase64 = await fileToBase64(file);
  const { data, error } = await client.functions.invoke("import-students", {
    body: { mode: "preview", schoolId, fileName: file.name, fileBase64 },
  });
  if (error || !data?.batchId) throw error ?? new Error("preview_failed");
  return String(data.batchId);
}

export async function fetchStudentImportBatch(
  batchId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<StudentImportBatch> {
  const { data, error } = await client.rpc("get_student_import_batch", { target_batch_id: batchId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("student_import_batch_not_found");
  return {
    batchId: String(row.batch_id), schoolId: String(row.school_id), fileName: String(row.file_name),
    status: row.status as StudentImportStatus, totalCount: Number(row.total_count),
    readyCount: Number(row.ready_count), warningCount: Number(row.warning_count),
    duplicateCount: Number(row.duplicate_count), errorCount: Number(row.error_count),
    createdCount: Number(row.created_count), createdAt: String(row.created_at),
    committedAt: row.committed_at ? String(row.committed_at) : null,
    rolledBackAt: row.rolled_back_at ? String(row.rolled_back_at) : null,
  };
}

export async function listStudentImportRows(
  batchId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<StudentImportRow[]> {
  const { data, error } = await client.rpc("list_student_import_rows", { target_batch_id: batchId });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    rowNumber: Number(row.row_number),
    payload: (row.payload ?? {}) as Record<string, string | number>,
    rowStatus: row.row_status as StudentImportRowStatus,
    issues: Array.isArray(row.issues) ? row.issues.map(String) : [],
    duplicateStudentId: row.duplicate_student_id ? String(row.duplicate_student_id) : null,
    createdStudentId: row.created_student_id ? String(row.created_student_id) : null,
  }));
}

export async function commitStudentImport(batchId: string, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("commit_student_import_batch", { target_batch_id: batchId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function rollbackStudentImport(batchId: string, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("rollback_student_import_batch", { target_batch_id: batchId });
  if (error) throw error;
  return Number(data ?? 0);
}

export function downloadStudentImportErrors(rows: StudentImportRow[]) {
  const failing = rows.filter(row => row.rowStatus === "error" || row.rowStatus === "duplicate" || row.rowStatus === "warning");
  const headers = ["row_number", "status", "issues", "first_name", "last_name", "birth_date", "branch_code", "class_code", "guardian_name", "guardian_phone"];
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
      row.payload.first_name,
      row.payload.last_name,
      row.payload.birth_date,
      row.payload.branch_code,
      row.payload.class_code,
      row.payload.guardian_name,
      row.payload.guardian_phone,
    ].map(escape).join(","));
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "quranos-student-import-report.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
