import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";
import type { AppLocale } from "./locale.ts";

const SHEETJS_MODULE_URL =
  "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
const MAX_IMPORT_ROWS = 2000;
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export type StudentImportStatus = "ready" | "warning" | "duplicate" | "error";

export type StudentImportInputRow = {
  row_number: number;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  national_id: string;
  phone: string;
  email: string;
  address: string;
  previous_school: string;
  education_level: string;
  education_year: string;
  guardian_name: string;
  guardian_relation: string;
  guardian_phone: string;
  guardian_email: string;
  guardian_job: string;
  branch_code: string;
  class_code: string;
  start_date: string;
  birth_certificate_provided: boolean;
  photos_provided: boolean;
  medical_report_provided: boolean;
  previous_certificate_provided: boolean;
};

export type ParsedStudentImportRow = {
  row: StudentImportInputRow;
  localErrors: string[];
};

export type StudentImportPreviewRow = {
  rowNumber: number;
  status: StudentImportStatus;
  errorCodes: string[];
  warningCodes: string[];
  existingStudentId: string | null;
  resolvedBranchId: string | null;
  resolvedClassId: string | null;
};

export type StudentImportPreview = {
  rows: StudentImportPreviewRow[];
  ready: number;
  warning: number;
  duplicate: number;
  error: number;
};

export type StudentImportCommitResult = {
  batchId: string;
  totalRows: number;
  importedRows: number;
  warningRows: number;
  duplicateRows: number;
  errorRows: number;
};

export type StudentImportBatch = StudentImportCommitResult & {
  sourceFilename: string;
  status: "processing" | "completed" | "rollback_partial" | "rolled_back" | "failed";
  createdBy: string;
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
  rolledBackAt: string | null;
  canRollback: boolean;
};

export type StudentImportRollbackResult = {
  batchId: string;
  rolledBackStudents: number;
  blockedStudents: number;
  status: "rollback_partial" | "rolled_back";
};

export type StudentManagementAccess = {
  canView: boolean;
  canManage: boolean;
  maxImportRows: number;
};

export type StudentImportLookup = {
  branches: Array<{ id: string; code: string; name: string }>;
  classes: Array<{ id: string; branchId: string; code: string; name: string }>;
};

type Sheet = Record<string, unknown> & {
  "!cols"?: Array<{ wch?: number }>;
};

type Workbook = {
  SheetNames: string[];
  Sheets: Record<string, Sheet>;
};

type SheetJsModule = {
  read(data: ArrayBuffer, options?: Record<string, unknown>): Workbook;
  writeFile(workbook: Workbook, filename: string, options?: Record<string, unknown>): void;
  utils: {
    sheet_to_json<T = unknown[]>(sheet: Sheet, options?: Record<string, unknown>): T[];
    aoa_to_sheet(rows: unknown[][]): Sheet;
    book_new(): Workbook;
    book_append_sheet(workbook: Workbook, sheet: Sheet, name: string): void;
  };
  SSF?: {
    parse_date_code(value: number):
      | { y: number; m: number; d: number; H?: number; M?: number; S?: number }
      | null;
  };
};

let sheetJsPromise: Promise<SheetJsModule> | null = null;

async function loadSheetJs(): Promise<SheetJsModule> {
  if (!sheetJsPromise) {
    sheetJsPromise = import(/* @vite-ignore */ SHEETJS_MODULE_URL) as Promise<SheetJsModule>;
  }
  return sheetJsPromise;
}

export class StudentImportFileError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "StudentImportFileError";
  }
}

export const STUDENT_IMPORT_HEADERS = [
  "first_name",
  "last_name",
  "birth_date",
  "gender",
  "national_id",
  "phone",
  "email",
  "address",
  "previous_school",
  "education_level",
  "education_year",
  "guardian_name",
  "guardian_relation",
  "guardian_phone",
  "guardian_email",
  "guardian_job",
  "branch_code",
  "class_code",
  "start_date",
  "birth_certificate_provided",
  "photos_provided",
  "medical_report_provided",
  "previous_certificate_provided",
] as const;

type ImportHeader = (typeof STUDENT_IMPORT_HEADERS)[number];

const REQUIRED_HEADERS = new Set<ImportHeader>([
  "first_name",
  "last_name",
  "birth_date",
  "gender",
  "guardian_name",
  "guardian_relation",
  "guardian_phone",
  "branch_code",
  "start_date",
]);

const HEADER_ALIASES = new Map<string, ImportHeader>([
  ["first_name", "first_name"], ["firstname", "first_name"], ["الاسم", "first_name"], ["الاسم_الأول", "first_name"],
  ["last_name", "last_name"], ["lastname", "last_name"], ["اللقب", "last_name"], ["اسم_العائلة", "last_name"],
  ["birth_date", "birth_date"], ["birthdate", "birth_date"], ["تاريخ_الميلاد", "birth_date"],
  ["gender", "gender"], ["الجنس", "gender"],
  ["national_id", "national_id"], ["nationalid", "national_id"], ["رقم_الهوية", "national_id"],
  ["phone", "phone"], ["الهاتف", "phone"], ["هاتف_الطالب", "phone"],
  ["email", "email"], ["البريد", "email"], ["البريد_الإلكتروني", "email"],
  ["address", "address"], ["العنوان", "address"],
  ["previous_school", "previous_school"], ["previousschool", "previous_school"], ["المؤسسة_السابقة", "previous_school"],
  ["education_level", "education_level"], ["educationlevel", "education_level"], ["المرحلة", "education_level"], ["المرحلة_الدراسية", "education_level"],
  ["education_year", "education_year"], ["educationyear", "education_year"], ["السنة", "education_year"], ["السنة_الدراسية", "education_year"],
  ["guardian_name", "guardian_name"], ["guardianname", "guardian_name"], ["اسم_الولي", "guardian_name"], ["ولي_الأمر", "guardian_name"],
  ["guardian_relation", "guardian_relation"], ["guardianrelation", "guardian_relation"], ["صلة_القرابة", "guardian_relation"],
  ["guardian_phone", "guardian_phone"], ["guardianphone", "guardian_phone"], ["هاتف_الولي", "guardian_phone"],
  ["guardian_email", "guardian_email"], ["guardianemail", "guardian_email"], ["بريد_الولي", "guardian_email"],
  ["guardian_job", "guardian_job"], ["guardianjob", "guardian_job"], ["مهنة_الولي", "guardian_job"],
  ["branch_code", "branch_code"], ["branchcode", "branch_code"], ["رمز_الفرع", "branch_code"],
  ["class_code", "class_code"], ["classcode", "class_code"], ["رمز_الحلقة", "class_code"],
  ["start_date", "start_date"], ["startdate", "start_date"], ["تاريخ_التسجيل", "start_date"], ["تاريخ_البدء", "start_date"],
  ["birth_certificate_provided", "birth_certificate_provided"], ["شهادة_الميلاد", "birth_certificate_provided"],
  ["photos_provided", "photos_provided"], ["الصور", "photos_provided"],
  ["medical_report_provided", "medical_report_provided"], ["تقرير_طبي", "medical_report_provided"],
  ["previous_certificate_provided", "previous_certificate_provided"], ["شهادة_سابقة", "previous_certificate_provided"],
]);

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_");
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function normalizeDate(value: unknown, xlsx: SheetJsModule): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const decoded = xlsx.SSF?.parse_date_code(value);
    if (decoded?.y && decoded?.m && decoded?.d) {
      return `${decoded.y}-${pad2(decoded.m)}-${pad2(decoded.d)}`;
    }
  }
  const raw = cellText(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  const dayFirst = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dayFirst) return `${dayFirst[3]}-${pad2(Number(dayFirst[2]))}-${pad2(Number(dayFirst[1]))}`;
  return raw;
}

function normalizeGender(value: unknown): string {
  const raw = cellText(value).toLocaleLowerCase();
  if (["male", "m", "ذكر", "ولد"].includes(raw)) return "male";
  if (["female", "f", "أنثى", "انثى", "بنت"].includes(raw)) return "female";
  return raw;
}

function normalizeEducationLevel(value: unknown): string {
  const raw = cellText(value).toLocaleLowerCase();
  const aliases: Record<string, string> = {
    primary: "primary", ابتدائي: "primary", ابتدائية: "primary",
    middle: "middle", متوسط: "middle", متوسطة: "middle",
    secondary: "secondary", ثانوي: "secondary", ثانوية: "secondary",
    university: "university", جامعي: "university", جامعة: "university",
  };
  return aliases[raw] ?? raw;
}

function normalizeGuardianRelation(value: unknown): string {
  const raw = cellText(value).toLocaleLowerCase();
  const aliases: Record<string, string> = {
    father: "father", أب: "father", اب: "father", والد: "father",
    mother: "mother", أم: "mother", ام: "mother", والدة: "mother",
    brother: "brother", أخ: "brother", اخ: "brother",
    sister: "sister", أخت: "sister", اخت: "sister",
    uncle: "uncle", عم: "uncle", خال: "uncle",
    aunt: "aunt", عمة: "aunt", خالة: "aunt",
    grandfather: "grandfather", جد: "grandfather",
    grandmother: "grandmother", جدة: "grandmother",
    other: "other", أخرى: "other", اخرى: "other", ولي: "other", وصي: "other",
  };
  return aliases[raw] ?? raw;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const raw = cellText(value).toLocaleLowerCase();
  return ["true", "1", "yes", "y", "نعم", "متوفر", "موجود"].includes(raw);
}

function validateLocally(row: StudentImportInputRow): string[] {
  const errors: string[] = [];
  if (row.first_name.length < 2 || row.first_name.length > 100) errors.push("first_name_invalid");
  if (row.last_name.length < 2 || row.last_name.length > 100) errors.push("last_name_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date)) errors.push("birth_date_invalid");
  if (!new Set(["male", "female"]).has(row.gender)) errors.push("gender_invalid");
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("email_invalid");
  if (row.guardian_name.length < 2) errors.push("guardian_name_invalid");
  if (!new Set(["father", "mother", "brother", "sister", "uncle", "aunt", "grandfather", "grandmother", "other"]).has(row.guardian_relation)) {
    errors.push("guardian_relation_invalid");
  }
  if (row.guardian_phone.length < 3) errors.push("guardian_phone_invalid");
  if (row.guardian_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.guardian_email)) errors.push("guardian_email_invalid");
  if (!/^[A-Z0-9_]+$/.test(row.branch_code)) errors.push("branch_code_invalid");
  if (row.class_code && !/^[A-Z0-9_]+$/.test(row.class_code)) errors.push("class_code_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.start_date)) errors.push("start_date_invalid");
  if (row.education_level && !new Set(["primary", "middle", "secondary", "university"]).has(row.education_level)) {
    errors.push("education_level_invalid");
  }
  if (row.education_level && !row.education_year) errors.push("education_year_required");
  if (!row.education_level && row.education_year) errors.push("education_year_without_level");
  if (row.education_year && !/^\d{1,2}$/.test(row.education_year)) errors.push("education_year_invalid");
  return [...new Set(errors)];
}

export async function parseStudentImportFile(file: File): Promise<ParsedStudentImportRow[]> {
  const lowerName = file.name.toLocaleLowerCase();
  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls") && !lowerName.endsWith(".csv")) {
    throw new StudentImportFileError("unsupported_file_type");
  }
  if (file.size <= 0 || file.size > MAX_IMPORT_FILE_BYTES) {
    throw new StudentImportFileError("file_too_large");
  }

  const xlsx = await loadSheetJs();
  const workbook = xlsx.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames.find(name => name.toLocaleUpperCase() === "STUDENTS") ?? workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new StudentImportFileError("missing_students_sheet");
  }

  const matrix = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  if (matrix.length < 1) throw new StudentImportFileError("empty_file");

  const headerRow = matrix[0] ?? [];
  const headerByIndex = new Map<number, ImportHeader>();
  const foundHeaders = new Set<ImportHeader>();
  headerRow.forEach((value, index) => {
    const alias = HEADER_ALIASES.get(normalizeHeader(value));
    if (alias && !foundHeaders.has(alias)) {
      headerByIndex.set(index, alias);
      foundHeaders.add(alias);
    }
  });

  if ([...REQUIRED_HEADERS].some(header => !foundHeaders.has(header))) {
    throw new StudentImportFileError("missing_required_columns");
  }

  const dataRows = matrix
    .slice(1)
    .map((values, index) => ({ values, sourceRowNumber: index + 2 }))
    .filter(item => item.values.some(value => cellText(value) !== ""));

  if (dataRows.length < 1) throw new StudentImportFileError("empty_file");
  if (dataRows.length > MAX_IMPORT_ROWS) throw new StudentImportFileError("too_many_rows");

  return dataRows.map(item => {
    const raw: Partial<Record<ImportHeader, unknown>> = {};
    for (const [columnIndex, header] of headerByIndex) {
      raw[header] = item.values[columnIndex];
    }

    const row: StudentImportInputRow = {
      row_number: item.sourceRowNumber,
      first_name: cellText(raw.first_name),
      last_name: cellText(raw.last_name),
      birth_date: normalizeDate(raw.birth_date, xlsx),
      gender: normalizeGender(raw.gender),
      national_id: cellText(raw.national_id),
      phone: cellText(raw.phone),
      email: cellText(raw.email).toLocaleLowerCase(),
      address: cellText(raw.address),
      previous_school: cellText(raw.previous_school),
      education_level: normalizeEducationLevel(raw.education_level),
      education_year: cellText(raw.education_year),
      guardian_name: cellText(raw.guardian_name),
      guardian_relation: normalizeGuardianRelation(raw.guardian_relation),
      guardian_phone: cellText(raw.guardian_phone),
      guardian_email: cellText(raw.guardian_email).toLocaleLowerCase(),
      guardian_job: cellText(raw.guardian_job),
      branch_code: cellText(raw.branch_code).toLocaleUpperCase(),
      class_code: cellText(raw.class_code).toLocaleUpperCase(),
      start_date: normalizeDate(raw.start_date, xlsx),
      birth_certificate_provided: normalizeBoolean(raw.birth_certificate_provided),
      photos_provided: normalizeBoolean(raw.photos_provided),
      medical_report_provided: normalizeBoolean(raw.medical_report_provided),
      previous_certificate_provided: normalizeBoolean(raw.previous_certificate_provided),
    };

    return { row, localErrors: validateLocally(row) };
  });
}

export async function fetchStudentManagementAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentManagementAccess> {
  const { data, error } = await client.rpc("get_student_management_access", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    canView: row?.can_view === true,
    canManage: row?.can_manage === true,
    maxImportRows: Number(row?.max_import_rows ?? MAX_IMPORT_ROWS),
  };
}

export async function fetchStudentImportLookups(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentImportLookup> {
  const [branchResult, classResult] = await Promise.all([
    client
      .from("branches")
      .select("id, code, name")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("is_main", { ascending: false })
      .order("name"),
    client
      .from("classes")
      .select("id, branch_id, code, name")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("name"),
  ]);
  if (branchResult.error) throw branchResult.error;
  if (classResult.error) throw classResult.error;
  return {
    branches: (branchResult.data ?? []).map(row => ({
      id: String(row.id), code: String(row.code), name: String(row.name),
    })),
    classes: (classResult.data ?? []).map(row => ({
      id: String(row.id), branchId: String(row.branch_id), code: String(row.code), name: String(row.name),
    })),
  };
}

export async function previewStudentImport(
  schoolId: string,
  parsedRows: ParsedStudentImportRow[],
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentImportPreview> {
  const { data, error } = await client.rpc("preview_student_import", {
    target_school_id: schoolId,
    target_rows: parsedRows.map(item => item.row),
  });
  if (error) throw error;

  const localByOrdinal = parsedRows.map(item => item.localErrors);
  const sourceRowByOrdinal = parsedRows.map(item => item.row.row_number);
  const rows = (data ?? []).map((raw: Record<string, unknown>, index: number): StudentImportPreviewRow => {
    const sourceRowNumber = sourceRowByOrdinal[index] ?? Number(raw.row_number);
    const localErrors = localByOrdinal[index] ?? [];
    const serverErrors = Array.isArray(raw.error_codes) ? raw.error_codes.map(String) : [];
    const warnings = Array.isArray(raw.warning_codes) ? raw.warning_codes.map(String) : [];
    const errorCodes = [...new Set([...localErrors, ...serverErrors])];
    const serverStatus = String(raw.validation_status) as StudentImportStatus;
    const status: StudentImportStatus = localErrors.length > 0 ? "error" : serverStatus;
    return {
      rowNumber: sourceRowNumber,
      status,
      errorCodes,
      warningCodes: warnings,
      existingStudentId: raw.existing_student_id ? String(raw.existing_student_id) : null,
      resolvedBranchId: raw.resolved_branch_id ? String(raw.resolved_branch_id) : null,
      resolvedClassId: raw.resolved_class_id ? String(raw.resolved_class_id) : null,
    };
  });

  return {
    rows,
    ready: rows.filter(row => row.status === "ready").length,
    warning: rows.filter(row => row.status === "warning").length,
    duplicate: rows.filter(row => row.status === "duplicate").length,
    error: rows.filter(row => row.status === "error").length,
  };
}

export async function commitStudentImport(
  schoolId: string,
  filename: string,
  parsedRows: ParsedStudentImportRow[],
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentImportCommitResult> {
  const { data, error } = await client.rpc("commit_student_import", {
    target_school_id: schoolId,
    target_source_filename: filename,
    target_rows: parsedRows.map(item => item.row),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.batch_id) throw new Error("student_import_commit_missing_batch");
  return {
    batchId: String(row.batch_id),
    totalRows: Number(row.total_rows ?? 0),
    importedRows: Number(row.imported_rows ?? 0),
    warningRows: Number(row.warning_rows ?? 0),
    duplicateRows: Number(row.duplicate_rows ?? 0),
    errorRows: Number(row.error_rows ?? 0),
  };
}

export async function listStudentImportBatches(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentImportBatch[]> {
  const { data, error } = await client.rpc("list_student_import_batches", {
    target_school_id: schoolId,
    target_limit: 20,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    batchId: String(row.batch_id),
    sourceFilename: String(row.source_filename),
    status: String(row.batch_status) as StudentImportBatch["status"],
    totalRows: Number(row.total_rows ?? 0),
    importedRows: Number(row.imported_rows ?? 0),
    warningRows: Number(row.warning_rows ?? 0),
    duplicateRows: Number(row.duplicate_rows ?? 0),
    errorRows: Number(row.error_rows ?? 0),
    createdBy: String(row.created_by),
    createdByName: String(row.created_by_name),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    rolledBackAt: row.rolled_back_at ? String(row.rolled_back_at) : null,
    canRollback: row.can_rollback === true,
  }));
}

export async function rollbackStudentImport(
  batchId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentImportRollbackResult> {
  const { data, error } = await client.rpc("rollback_student_import", {
    target_batch_id: batchId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.batch_id) throw new Error("student_import_rollback_missing_batch");
  return {
    batchId: String(row.batch_id),
    rolledBackStudents: Number(row.rolled_back_students ?? 0),
    blockedStudents: Number(row.blocked_students ?? 0),
    status: String(row.batch_status) as StudentImportRollbackResult["status"],
  };
}

export async function downloadStudentImportTemplate(
  lookups: StudentImportLookup,
  locale: AppLocale
): Promise<void> {
  const xlsx = await loadSheetJs();
  const workbook = xlsx.utils.book_new();
  const headers = [...STUDENT_IMPORT_HEADERS];
  const studentSheet = xlsx.utils.aoa_to_sheet([headers]);
  studentSheet["!cols"] = headers.map(header => ({
    wch: ["address", "previous_school", "guardian_name", "guardian_job"].includes(header) ? 24 : 18,
  }));
  xlsx.utils.book_append_sheet(workbook, studentSheet, "STUDENTS");

  const exampleBranch = lookups.branches[0]?.code ?? "MAIN";
  const exampleClass = lookups.classes.find(item => item.branchId === lookups.branches[0]?.id)?.code ?? "";
  const exampleSheet = xlsx.utils.aoa_to_sheet([
    headers,
    [
      locale === "ar" ? "أحمد" : "Ahmed",
      locale === "ar" ? "بن علي" : "Benali",
      "2015-05-10", "male", "", "", "", "", "", "primary", "5",
      locale === "ar" ? "محمد بن علي" : "Mohamed Benali",
      "father", "0550000000", "", "", exampleBranch, exampleClass,
      new Date().toISOString().slice(0, 10), "no", "no", "no", "no",
    ],
  ]);
  exampleSheet["!cols"] = studentSheet["!cols"];
  xlsx.utils.book_append_sheet(workbook, exampleSheet, "EXAMPLE");

  const lookupRows: unknown[][] = [["branch_code", "branch_name", "class_code", "class_name"]];
  for (const branch of lookups.branches) {
    const branchClasses = lookups.classes.filter(item => item.branchId === branch.id);
    if (branchClasses.length === 0) lookupRows.push([branch.code, branch.name, "", ""]);
    for (const classItem of branchClasses) {
      lookupRows.push([branch.code, branch.name, classItem.code, classItem.name]);
    }
  }
  const lookupSheet = xlsx.utils.aoa_to_sheet(lookupRows);
  lookupSheet["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 28 }];
  xlsx.utils.book_append_sheet(workbook, lookupSheet, "LOOKUPS");

  const instructions = locale === "ar"
    ? [
        ["تعليمات استيراد الطلاب — QuranOS"],
        ["1", "اكتب البيانات في ورقة STUDENTS فقط ولا تغيّر أسماء الأعمدة."],
        ["2", "التواريخ بصيغة YYYY-MM-DD مثل 2026-09-01."],
        ["3", "gender: male أو female. ويمكن للمنصة فهم ذكر/أنثى عند الرفع."],
        ["4", "education_level: primary / middle / secondary / university، وعند تحديدها يجب تحديد education_year."],
        ["5", "guardian_relation: father / mother / brother / sister / uncle / aunt / grandfather / grandmother / other."],
        ["6", "استخدم branch_code وclass_code كما يظهران في ورقة LOOKUPS. class_code اختياري."],
        ["7", "حقول المستندات تقبل yes/no أو نعم/لا."],
        ["8", `الحد الأقصى ${MAX_IMPORT_ROWS} طالب في الدفعة الواحدة.`],
        ["9", "ستظهر معاينة كاملة قبل كتابة أي طالب في قاعدة البيانات."],
      ]
    : [
        ["QuranOS Student Import Instructions"],
        ["1", "Enter data only in STUDENTS and keep the column names unchanged."],
        ["2", "Use YYYY-MM-DD dates, for example 2026-09-01."],
        ["3", "gender: male or female."],
        ["4", "education_level: primary / middle / secondary / university. education_year is required when a level is set."],
        ["5", "guardian_relation: father / mother / brother / sister / uncle / aunt / grandfather / grandmother / other."],
        ["6", "Use branch_code and class_code from LOOKUPS. class_code is optional."],
        ["7", "Document fields accept yes/no."],
        ["8", `Maximum ${MAX_IMPORT_ROWS} students per batch.`],
        ["9", "A validation preview is shown before any student is written to the database."],
      ];
  const instructionSheet = xlsx.utils.aoa_to_sheet(instructions);
  instructionSheet["!cols"] = [{ wch: 8 }, { wch: 90 }];
  xlsx.utils.book_append_sheet(workbook, instructionSheet, "INSTRUCTIONS");

  xlsx.writeFile(workbook, "QuranOS_students_import_template.xlsx", { compression: true });
}

export async function downloadStudentImportIssues(
  parsedRows: ParsedStudentImportRow[],
  preview: StudentImportPreview,
  locale: AppLocale
): Promise<void> {
  const xlsx = await loadSheetJs();
  const previewByRow = new Map(preview.rows.map(item => [item.rowNumber, item]));
  const rows = parsedRows
    .map(item => ({ parsed: item, preview: previewByRow.get(item.row.row_number) }))
    .filter(item => item.preview && item.preview.status !== "ready");
  if (rows.length === 0) return;

  const headers = [...STUDENT_IMPORT_HEADERS, "import_status", "issues"];
  const matrix: unknown[][] = [headers];
  for (const item of rows) {
    const row = item.parsed.row;
    const result = item.preview!;
    matrix.push([
      row.first_name, row.last_name, row.birth_date, row.gender, row.national_id,
      row.phone, row.email, row.address, row.previous_school, row.education_level,
      row.education_year, row.guardian_name, row.guardian_relation, row.guardian_phone,
      row.guardian_email, row.guardian_job, row.branch_code, row.class_code, row.start_date,
      row.birth_certificate_provided ? "yes" : "no",
      row.photos_provided ? "yes" : "no",
      row.medical_report_provided ? "yes" : "no",
      row.previous_certificate_provided ? "yes" : "no",
      translateStudentImportStatus(result.status, locale),
      [...result.errorCodes, ...result.warningCodes]
        .map(code => translateStudentImportIssue(code, locale))
        .join(" | "),
    ]);
  }

  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(matrix);
  sheet["!cols"] = headers.map(header => ({ wch: header === "issues" ? 60 : 18 }));
  xlsx.utils.book_append_sheet(workbook, sheet, "ISSUES");
  xlsx.writeFile(workbook, "QuranOS_student_import_issues.xlsx", { compression: true });
}

export function translateStudentImportStatus(status: StudentImportStatus, locale: AppLocale): string {
  const labels = locale === "ar"
    ? { ready: "جاهز", warning: "تحذير", duplicate: "مكرر", error: "خطأ" }
    : { ready: "Ready", warning: "Warning", duplicate: "Duplicate", error: "Error" };
  return labels[status];
}

export function translateStudentImportIssue(code: string, locale: AppLocale): string {
  const ar: Record<string, string> = {
    first_name_invalid: "الاسم الأول مفقود أو طوله غير صالح",
    last_name_invalid: "اسم العائلة مفقود أو طوله غير صالح",
    birth_date_invalid: "تاريخ الميلاد غير صالح",
    gender_invalid: "الجنس يجب أن يكون ذكرًا أو أنثى",
    national_id_too_long: "رقم الهوية طويل جدًا",
    phone_too_long: "رقم هاتف الطالب طويل جدًا",
    email_invalid: "بريد الطالب غير صالح",
    address_too_long: "العنوان طويل جدًا",
    previous_school_too_long: "اسم المؤسسة السابقة طويل جدًا",
    education_level_invalid: "المرحلة الدراسية غير صالحة",
    education_year_invalid: "السنة الدراسية غير صالحة للمرحلة",
    education_year_required: "السنة الدراسية مطلوبة عند تحديد المرحلة",
    education_year_without_level: "حدد المرحلة قبل السنة الدراسية",
    guardian_name_invalid: "اسم ولي الأمر مفقود أو غير صالح",
    guardian_relation_invalid: "صلة القرابة غير صالحة",
    guardian_phone_invalid: "هاتف ولي الأمر مطلوب وغير صالح",
    guardian_email_invalid: "بريد ولي الأمر غير صالح",
    guardian_job_too_long: "مهنة ولي الأمر طويلة جدًا",
    branch_code_invalid: "رمز الفرع غير صالح",
    branch_not_found: "الفرع غير موجود أو غير نشط",
    branch_not_allowed: "لا تملك صلاحية إضافة طلاب إلى هذا الفرع",
    class_code_invalid: "رمز الحلقة غير صالح",
    class_not_found_in_branch: "الحلقة غير موجودة أو لا تنتمي إلى الفرع",
    start_date_invalid: "تاريخ التسجيل غير صالح",
    possible_duplicate_name_birthdate: "يوجد طالب بنفس الاسم وتاريخ الميلاد؛ راجع السطر قبل الاعتماد",
    duplicate_in_file: "هذا الطالب مكرر داخل ملف الاستيراد",
  };
  const en: Record<string, string> = {
    first_name_invalid: "First name is missing or invalid",
    last_name_invalid: "Last name is missing or invalid",
    birth_date_invalid: "Birth date is invalid",
    gender_invalid: "Gender must be male or female",
    national_id_too_long: "National ID is too long",
    phone_too_long: "Student phone is too long",
    email_invalid: "Student email is invalid",
    address_too_long: "Address is too long",
    previous_school_too_long: "Previous school is too long",
    education_level_invalid: "Education level is invalid",
    education_year_invalid: "Education year is invalid for the selected level",
    education_year_required: "Education year is required when a level is selected",
    education_year_without_level: "Select an education level before the year",
    guardian_name_invalid: "Guardian name is missing or invalid",
    guardian_relation_invalid: "Guardian relation is invalid",
    guardian_phone_invalid: "Guardian phone is required and invalid",
    guardian_email_invalid: "Guardian email is invalid",
    guardian_job_too_long: "Guardian job is too long",
    branch_code_invalid: "Branch code is invalid",
    branch_not_found: "Branch was not found or is inactive",
    branch_not_allowed: "You cannot add students to this branch",
    class_code_invalid: "Class code is invalid",
    class_not_found_in_branch: "Class was not found in the selected branch",
    start_date_invalid: "Registration date is invalid",
    possible_duplicate_name_birthdate: "A student with the same name and birth date exists; review before commit",
    duplicate_in_file: "This student is duplicated inside the import file",
  };
  const dictionary = locale === "ar" ? ar : en;
  return dictionary[code] ?? code;
}

export function getStudentImportFileErrorMessage(error: unknown, locale: AppLocale): string {
  const code = error instanceof StudentImportFileError ? error.code : "unknown";
  const ar: Record<string, string> = {
    unsupported_file_type: "اختر ملف Excel بصيغة XLSX أو XLS أو CSV.",
    file_too_large: "حجم الملف يجب ألا يتجاوز 5 ميغابايت.",
    missing_students_sheet: "لم يتم العثور على ورقة بيانات الطلاب.",
    empty_file: "الملف لا يحتوي على صفوف طلاب.",
    missing_required_columns: "الملف لا يحتوي على جميع الأعمدة الإلزامية. نزّل النموذج الرسمي واستخدمه دون تغيير أسماء الأعمدة.",
    too_many_rows: `الحد الأقصى هو ${MAX_IMPORT_ROWS} طالب في الدفعة الواحدة.`,
    unknown: "تعذر قراءة ملف Excel. تحقق من الملف وحاول مرة أخرى.",
  };
  const en: Record<string, string> = {
    unsupported_file_type: "Choose an XLSX, XLS, or CSV file.",
    file_too_large: "The file must not exceed 5 MB.",
    missing_students_sheet: "The student worksheet could not be found.",
    empty_file: "The file does not contain student rows.",
    missing_required_columns: "Required columns are missing. Download the official template and keep the column names unchanged.",
    too_many_rows: `A maximum of ${MAX_IMPORT_ROWS} students is allowed per batch.`,
    unknown: "The spreadsheet could not be read. Check the file and try again.",
  };
  return (locale === "ar" ? ar : en)[code] ?? (locale === "ar" ? ar.unknown : en.unknown);
}
