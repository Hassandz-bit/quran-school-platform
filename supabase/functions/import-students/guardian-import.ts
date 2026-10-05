import ExcelJS from "npm:exceljs@4.4.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";

const ALIASES: Record<string, string> = {
  student_name: "student_name", "اسم الطالب": "student_name",
  student_national_id: "student_national_id", "رمز الطالب الوطني": "student_national_id", "رقم الطالب الوطني": "student_national_id",
  guardian_name: "guardian_name", "اسم ولي الأمر": "guardian_name", "اسم الولي": "guardian_name",
  email: "email", "البريد الإلكتروني": "email", "البريد الالكتروني": "email",
  phone: "phone", "الهاتف": "phone", "رقم الهاتف": "phone",
  relationship_type: "relationship_type", "صلة القرابة": "relationship_type",
  is_primary: "is_primary", "ولي أساسي": "is_primary", "ولي أساسي؟": "is_primary",
  branch_code: "branch_code", "رمز الفرع": "branch_code",
};
const RELATIONS: Record<string, string> = {
  father: "father", "أب": "father", "الأب": "father", mother: "mother", "أم": "mother", "الأم": "mother",
  legal_guardian: "legal_guardian", "الولي الشرعي": "legal_guardian", "ولي شرعي": "legal_guardian",
  relative: "relative", "قريب": "relative", other: "other", "أخرى": "other", "أخرى/آخر": "other", "آخر": "other",
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{4,39}$/;
const MAX_GUARDIAN_ROWS = 500;

type ParsedRow = Record<string, string | number>;
type AvailableStudent = { id: string; studentName: string; branchId: string; className: string | null };

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null) {
    const cell = value as { text?: unknown; result?: unknown };
    if (cell.text !== undefined) return String(cell.text).trim();
    if (cell.result !== undefined) return cellText(cell.result);
  }
  return String(value).trim();
}
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ar");
}
function normalizePrimary(value: string): string {
  const text = value.trim().toLocaleLowerCase("ar");
  if (!text || ["no", "n", "false", "0", "لا", "ليس", "غير أساسي"].includes(text)) return "false";
  if (["yes", "y", "true", "1", "نعم", "ن", "أساسي"].includes(text)) return "true";
  return text;
}
export async function parseGuardianWorkbook(bytes: Uint8Array): Promise<ParsedRow[]> {
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error("guardian_import_file_size");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);
  } catch {
    throw new Error("guardian_import_invalid_workbook");
  }
  const sheet = workbook.getWorksheet("Guardians") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("guardian_import_sheet_missing");
  const columns = new Map<number, string>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const heading = cellText(cell.value);
    const canonical = ALIASES[heading.toLowerCase()] ?? ALIASES[heading];
    if (canonical) columns.set(column, canonical);
  });
  for (const required of ["student_name", "guardian_name", "email", "relationship_type", "branch_code"]) {
    if (![...columns.values()].includes(required)) throw new Error(`guardian_import_missing_header:${required}`);
  }
  const rows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const payload: ParsedRow = { row_number: rowNumber };
    let hasContent = false;
    for (const [column, key] of columns) {
      let value = cellText(row.getCell(column).value);
      if (key === "branch_code") value = value.toUpperCase();
      if (key === "email") value = value.toLowerCase();
      if (key === "relationship_type") value = RELATIONS[value.toLowerCase()] ?? RELATIONS[value] ?? value.toLowerCase();
      if (key === "is_primary") value = normalizePrimary(value);
      if (value !== "") hasContent = true;
      payload[key] = value;
    }
    if (hasContent) {
      if (rows.length >= MAX_GUARDIAN_ROWS) throw new Error("guardian_import_too_many_rows");
      if (!payload.is_primary) payload.is_primary = "false";
      rows.push(payload);
    }
  });
  if (rows.length === 0) throw new Error("guardian_import_no_rows");
  return rows;
}

async function selectInChunks(client: SupabaseClient, table: string, columns: string, schoolId: string, ids: string[]) {
  const values: Record<string, unknown>[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await client.from(table).select(columns).eq("school_id", schoolId).in("id", ids.slice(offset, offset + 200));
    if (error) throw new Error("guardian_import_lookup_failed");
    values.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return values;
}

export async function previewGuardianRows(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  schoolId: string,
  sourceRows: ParsedRow[],
) {
  const { data: availableData, error: availableError } = await userClient.rpc("list_guardian_invite_students", { target_school_id: schoolId });
  if (availableError) throw new Error("guardian_import_authorization_failed");
  const availableStudents: AvailableStudent[] = (availableData ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.student_id), studentName: String(row.student_name ?? ""), branchId: String(row.branch_id), className: row.class_name ? String(row.class_name) : null,
  }));
  const allowedIds = [...new Set(availableStudents.map(student => student.id))];
  const branchIds = [...new Set(availableStudents.map(student => student.branchId))];
  const [branchRows, studentRows] = await Promise.all([
    selectInChunks(adminClient, "branches", "id,code,status", schoolId, branchIds),
    selectInChunks(adminClient, "students", "id,national_id", schoolId, allowedIds),
  ]);
  const branchCodes = new Map(branchRows.filter(row => row.status === "active").map(row => [String(row.id), String(row.code).toUpperCase()]));
  const nationalIds = new Map(studentRows.map(row => [String(row.id), String(row.national_id ?? "").trim()]));
  const studentCandidates = availableStudents.map(student => ({ ...student, branchCode: branchCodes.get(student.branchId) ?? "", nationalId: nationalIds.get(student.id) ?? "" }));
  const result = sourceRows.map(payload => {
    const issues: string[] = [];
    const fullName = String(payload.guardian_name ?? "").trim().replace(/\s+/g, " ");
    const email = String(payload.email ?? "").trim().toLowerCase();
    const phone = String(payload.phone ?? "").trim();
    const relationship = String(payload.relationship_type ?? "");
    const primary = String(payload.is_primary ?? "false");
    const branchCode = String(payload.branch_code ?? "").trim().toUpperCase();
    const studentName = String(payload.student_name ?? "").trim().replace(/\s+/g, " ");
    const nationalId = String(payload.student_national_id ?? "").trim();
    if (Array.from(fullName).length < 2 || Array.from(fullName).length > 150) issues.push("guardian_name_invalid");
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) issues.push("guardian_email_invalid");
    if (phone && !PHONE_PATTERN.test(phone)) issues.push("guardian_phone_invalid");
    if (!["father", "mother", "legal_guardian", "relative", "other"].includes(relationship)) issues.push("relationship_invalid");
    if (primary !== "true" && primary !== "false") issues.push("is_primary_invalid");
    if (!branchCode) issues.push("branch_not_found");
    if (Array.from(studentName).length < 2) issues.push("student_not_found");
    const matching = studentCandidates.filter(student => student.branchCode === branchCode && normalize(student.studentName) === normalize(studentName) && (!nationalId || student.nationalId === nationalId));
    let matched: (typeof studentCandidates)[number] | undefined;
    if (matching.length === 1) matched = matching[0];
    else if (matching.length > 1) issues.push("student_ambiguous");
    else if (branchCode && studentName) issues.push("student_not_found");
    return {
      rowNumber: Number(payload.row_number), payload, rowStatus: "ready" as "ready" | "error" | "duplicate",
      issues, studentId: matched?.id ?? null, studentName: matched?.studentName ?? null, studentClassName: matched?.className ?? null,
    };
  });
  const relationshipCounts = new Map<string, number>();
  const primaryCounts = new Map<string, number>();
  for (const row of result) {
    if (!row.studentId) continue;
    const identity = `${row.studentId}:${String(row.payload.email ?? "").trim().toLowerCase()}`;
    relationshipCounts.set(identity, (relationshipCounts.get(identity) ?? 0) + 1);
    if (String(row.payload.is_primary) === "true") primaryCounts.set(row.studentId, (primaryCounts.get(row.studentId) ?? 0) + 1);
  }
  for (const row of result) {
    if (row.studentId) {
      const identity = `${row.studentId}:${String(row.payload.email ?? "").trim().toLowerCase()}`;
      if ((relationshipCounts.get(identity) ?? 0) > 1) row.issues.push("duplicate_relationship");
      if ((primaryCounts.get(row.studentId) ?? 0) > 1 && String(row.payload.is_primary) === "true") row.issues.push("multiple_primary_guardians");
    }
    row.rowStatus = row.issues.includes("duplicate_relationship") ? "duplicate" : row.issues.length ? "error" : "ready";
  }
  return result;
}
