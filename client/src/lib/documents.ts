import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const DOCUMENT_BUCKET = "school-documents";
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type DocumentSubjectType = "student" | "registration_lead";
export type DocumentCategory =
  | "birth_certificate"
  | "personal_photos"
  | "medical_report"
  | "previous_certificate"
  | "guardian_identity"
  | "registration_form"
  | "other";
export type DocumentStatus = "missing" | "uploaded" | "verified" | "rejected" | "expired";

export type DocumentsAccess = {
  canView: boolean;
  canManage: boolean;
};

export type DocumentSubject = {
  subjectType: DocumentSubjectType;
  subjectId: string;
  branchId: string;
  branchName: string;
  subjectName: string;
  secondaryName: string | null;
  canManage: boolean;
};

export type DocumentRecord = {
  documentId: string;
  branchId: string;
  branchName: string;
  subjectType: DocumentSubjectType;
  subjectId: string;
  subjectName: string;
  category: DocumentCategory;
  customLabel: string | null;
  status: DocumentStatus;
  objectPath: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  issuedOn: string | null;
  expiresOn: string | null;
  notes: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
};

export type CreateDocumentSlotInput = {
  schoolId: string;
  subjectType: DocumentSubjectType;
  subjectId: string;
  category: DocumentCategory;
  customLabel?: string | null;
  notes?: string | null;
};

export type UploadDocumentInput = CreateDocumentSlotInput & {
  file: File;
  issuedOn?: string | null;
  expiresOn?: string | null;
};

export type UpdateDocumentStatusInput = {
  documentId: string;
  status: Exclude<DocumentStatus, "missing">;
  expiresOn?: string | null;
  notes?: string | null;
};

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extensionForFile(file: File): string {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function validateDocumentFile(file: File): string | null {
  if (!DOCUMENT_TYPES.has(file.type)) {
    return "الملف يجب أن يكون PDF أو JPG أو PNG أو WebP.";
  }
  if (file.size < 1) return "الملف فارغ.";
  if (file.size > DOCUMENT_MAX_BYTES) {
    return "حجم الوثيقة يجب ألا يتجاوز 10 ميغابايت.";
  }
  return null;
}

function mapSubject(row: Record<string, unknown>): DocumentSubject {
  return {
    subjectType: row.subject_type as DocumentSubjectType,
    subjectId: String(row.subject_id),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    subjectName: String(row.subject_name),
    secondaryName: row.secondary_name ? String(row.secondary_name) : null,
    canManage: row.can_manage === true,
  };
}

function mapRecord(row: Record<string, unknown>): DocumentRecord {
  return {
    documentId: String(row.document_id),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    subjectType: row.subject_type as DocumentSubjectType,
    subjectId: String(row.subject_id),
    subjectName: String(row.subject_name),
    category: row.category as DocumentCategory,
    customLabel: row.custom_label ? String(row.custom_label) : null,
    status: row.document_status as DocumentStatus,
    objectPath: row.object_path ? String(row.object_path) : null,
    originalFileName: row.original_file_name ? String(row.original_file_name) : null,
    mimeType: row.mime_type ? String(row.mime_type) : null,
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : row.size_bytes ? Number(row.size_bytes) : null,
    issuedOn: row.issued_on ? String(row.issued_on) : null,
    expiresOn: row.expires_on ? String(row.expires_on) : null,
    notes: row.notes ? String(row.notes) : null,
    verifiedByName: row.verified_by_name ? String(row.verified_by_name) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    canManage: row.can_manage === true,
  };
}

export async function fetchDocumentsAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<DocumentsAccess> {
  const { data, error } = await client.rpc("get_documents_access", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return { canView: row?.can_view === true, canManage: row?.can_manage === true };
}

export async function listDocumentSubjects(
  schoolId: string,
  subjectType: DocumentSubjectType | null = null,
  client: SupabaseClient = getSupabaseClient()
): Promise<DocumentSubject[]> {
  const { data, error } = await client.rpc("list_document_subjects", {
    target_school_id: schoolId,
    target_subject_type: subjectType,
    target_limit: 1000,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapSubject(row));
}

export async function listDocumentRecords(
  schoolId: string,
  subjectType: DocumentSubjectType | null = null,
  subjectId: string | null = null,
  client: SupabaseClient = getSupabaseClient()
): Promise<DocumentRecord[]> {
  const { data, error } = await client.rpc("list_document_records", {
    target_school_id: schoolId,
    target_subject_type: subjectType,
    target_subject_id: subjectId,
    target_limit: 1000,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapRecord(row));
}

export async function createDocumentSlot(
  input: CreateDocumentSlotInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<string> {
  const { data, error } = await client.rpc("create_document_slot", {
    target_school_id: input.schoolId,
    target_subject_type: input.subjectType,
    target_subject_id: input.subjectId,
    target_category: input.category,
    target_custom_label: input.customLabel || null,
    target_notes: input.notes || null,
  });
  if (error) throw error;
  if (!data) throw new Error("document_slot_create_failed");
  return String(data);
}

export async function uploadDocument(
  input: UploadDocumentInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<string> {
  const validationError = validateDocumentFile(input.file);
  if (validationError) throw new Error(validationError);

  const documentId = await createDocumentSlot(input, client);
  const path = `${input.schoolId}/${input.subjectType}/${input.subjectId}/${documentId}/document-${crypto.randomUUID()}.${extensionForFile(input.file)}`;

  const upload = await client.storage.from(DOCUMENT_BUCKET).upload(path, input.file, {
    cacheControl: "3600",
    contentType: input.file.type,
    upsert: false,
  });
  if (upload.error) throw upload.error;

  try {
    const { data: previousPath, error } = await client.rpc("finalize_document_upload", {
      target_document_id: documentId,
      target_object_path: path,
      target_original_file_name: input.file.name.slice(0, 255),
      target_mime_type: input.file.type,
      target_size_bytes: input.file.size,
      target_issued_on: input.issuedOn || null,
      target_expires_on: input.expiresOn || null,
      target_notes: input.notes || null,
    });
    if (error) throw error;

    if (previousPath && String(previousPath) !== path) {
      await client.storage.from(DOCUMENT_BUCKET).remove([String(previousPath)]);
    }
    return documentId;
  } catch (error) {
    await client.storage.from(DOCUMENT_BUCKET).remove([path]);
    throw error;
  }
}

export async function updateDocumentStatus(
  input: UpdateDocumentStatusInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client.rpc("update_document_status", {
    target_document_id: input.documentId,
    target_status: input.status,
    target_expires_on: input.expiresOn || null,
    target_notes: input.notes || null,
  });
  if (error) throw error;
  if (data !== true) throw new Error("document_status_update_failed");
}

export async function downloadDocument(
  objectPath: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<Blob> {
  const { data, error } = await client.storage.from(DOCUMENT_BUCKET).download(objectPath);
  if (error) throw error;
  return data;
}
