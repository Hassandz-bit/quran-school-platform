import ExcelJS from "npm:exceljs@4.4.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4;
export const MAX_ROWS = 5000;

const HEADER_ALIASES: Record<string, string> = {
  first_name: "first_name", "الاسم": "first_name", "الاسم الأول": "first_name",
  last_name: "last_name", "اللقب": "last_name", "اسم العائلة": "last_name",
  birth_date: "birth_date", "تاريخ الميلاد": "birth_date",
  gender: "gender", "الجنس": "gender",
  national_id: "national_id", "رقم التعريف": "national_id", "الرقم الوطني": "national_id",
  phone: "phone", "الهاتف": "phone",
  email: "email", "البريد الإلكتروني": "email",
  address: "address", "العنوان": "address",
  previous_school: "previous_school", "المدرسة السابقة": "previous_school",
  education_level: "education_level", "المستوى الدراسي": "education_level",
  guardian_name: "guardian_name", "اسم الولي": "guardian_name", "ولي الأمر": "guardian_name",
  guardian_relation: "guardian_relation", "صلة الولي": "guardian_relation", "صلة القرابة": "guardian_relation",
  guardian_phone: "guardian_phone", "هاتف الولي": "guardian_phone",
  guardian_email: "guardian_email", "بريد الولي": "guardian_email",
  guardian_job: "guardian_job", "مهنة الولي": "guardian_job",
  branch_code: "branch_code", "رمز الفرع": "branch_code",
  class_code: "class_code", "رمز الحلقة": "class_code", "رمز القسم": "class_code",
  start_date: "start_date", "تاريخ التسجيل": "start_date",
};

const RELATION_ALIASES: Record<string, string> = {
  father: "father", "أب": "father", "الأب": "father",
  mother: "mother", "أم": "mother", "الأم": "mother",
  brother: "brother", "أخ": "brother", "الأخ": "brother",
  sister: "sister", "أخت": "sister", "الأخت": "sister",
  uncle: "uncle", "عم": "uncle", "خال": "uncle",
  aunt: "aunt", "عمة": "aunt", "خالة": "aunt",
  grandfather: "grandfather", "جد": "grandfather", "الجد": "grandfather",
  grandmother: "grandmother", "جدة": "grandmother", "الجدة": "grandmother",
  other: "other", "آخر": "other", "أخرى": "other",
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value !== null) {
    const maybe = value as { text?: unknown; result?: unknown };
    if (maybe.text !== undefined) return String(maybe.text).trim();
    if (maybe.result !== undefined) return cellText(maybe.result);
  }
  return String(value).trim();
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  if (!text) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  if (iso) return iso;
  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    return `${slash[3]}-${month}-${day}`;
  }
  return text;
}

function normalizeGender(value: unknown): string {
  const text = cellText(value).toLowerCase();
  if (["male", "m", "ذكر", "ولد"].includes(text)) return "male";
  if (["female", "f", "أنثى", "انثى", "بنت"].includes(text)) return "female";
  return text;
}

function normalizeRelation(value: unknown): string {
  const text = cellText(value).toLowerCase();
  return RELATION_ALIASES[text] ?? text;
}

function excelLoadInput(bytes: Uint8Array): Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0] {
  return bytes as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];
}

export function decodeBase64(value: string): Uint8Array {
  if (value.length === 0 || value.length > MAX_FILE_BASE64_CHARS) {
    throw new Error("student_import_file_size");
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new Error("student_import_invalid_base64");
  }
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const owned = Uint8Array.from(bytes);
  const hash = await crypto.subtle.digest("SHA-256", owned.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function parseStudentWorkbook(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) throw new Error("student_import_file_size");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelLoadInput(bytes));
  const sheet = workbook.getWorksheet("Students") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("student_import_sheet_missing");

  const headerRow = sheet.getRow(1);
  const columns = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, column) => {
    const raw = cellText(cell.value).toLowerCase();
    const canonical = HEADER_ALIASES[raw] ?? HEADER_ALIASES[cellText(cell.value)];
    if (canonical) columns.set(column, canonical);
  });

  const required = ["first_name", "last_name", "birth_date", "gender", "guardian_name", "guardian_relation", "guardian_phone", "branch_code"];
  for (const key of required) {
    if (![...columns.values()].includes(key)) throw new Error(`student_import_missing_header:${key}`);
  }

  const rows: Record<string, string | number>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const payload: Record<string, string | number> = { row_number: rowNumber };
    let hasContent = false;
    for (const [column, key] of columns) {
      const value = row.getCell(column).value;
      let normalized = key === "birth_date" || key === "start_date"
        ? normalizeDate(value)
        : key === "gender"
          ? normalizeGender(value)
          : key === "guardian_relation"
            ? normalizeRelation(value)
            : cellText(value);
      if (key === "branch_code" || key === "class_code") normalized = normalized.toUpperCase();
      if (normalized !== "") hasContent = true;
      payload[key] = normalized;
    }
    if (hasContent) {
      if (rows.length >= MAX_ROWS) throw new Error("student_import_too_many_rows");
      rows.push(payload);
    }
  });

  if (rows.length === 0) throw new Error("student_import_no_rows");
  return rows;
}

export async function buildStudentTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QuranOS";
  const sheet = workbook.addWorksheet("Students");
  const headers = [
    "first_name", "last_name", "birth_date", "gender", "national_id", "phone", "email", "address",
    "previous_school", "education_level", "guardian_name", "guardian_relation", "guardian_phone",
    "guardian_email", "guardian_job", "branch_code", "class_code", "start_date",
  ];
  sheet.addRow(headers);
  sheet.columns = headers.map(header => ({ header, key: header, width: Math.max(15, header.length + 3) }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "R1" };

  const instructions = workbook.addWorksheet("Instructions");
  instructions.addRows([
    ["Field", "Required", "Accepted values / note"],
    ["first_name", "Yes", "Student first name"],
    ["last_name", "Yes", "Student family name"],
    ["birth_date", "Yes", "YYYY-MM-DD"],
    ["gender", "Yes", "male / female or ذكر / أنثى"],
    ["guardian_name", "Yes", "Guardian full name"],
    ["guardian_relation", "Yes", "father/mother/brother/sister/uncle/aunt/grandfather/grandmother/other"],
    ["guardian_phone", "Yes", "Guardian phone"],
    ["branch_code", "Yes", "Existing active QuranOS branch code"],
    ["class_code", "No", "Existing active class code in the same branch; blank = warning only"],
    ["start_date", "No", "YYYY-MM-DD; blank = import date"],
  ]);
  instructions.columns = [{ width: 24 }, { width: 14 }, { width: 72 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function getClients(bearer: string) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!url || !anonKey || !serviceKey) throw new Error("student_import_server_config");
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } });
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  return { userClient, adminClient };
}

export async function authorizeImporter(userClient: SupabaseClient, schoolId: string) {
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult.user) throw new Error("student_import_unauthorized");
  const { data: branches, error: branchError } = await userClient
    .from("branches")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active");
  if (branchError) throw new Error("student_import_unauthorized");
  let allowed = false;
  for (const branch of branches ?? []) {
    const { data, error } = await userClient.rpc("has_branch_permission", {
      target_school_id: schoolId,
      target_branch_id: branch.id,
      target_permission_code: "students.manage",
    });
    if (!error && data === true) {
      allowed = true;
      break;
    }
  }
  if (!allowed) throw new Error("student_import_unauthorized");
  return userResult.user.id;
}

export async function stageImport(
  adminClient: SupabaseClient,
  schoolId: string,
  actorId: string,
  fileName: string,
  sha256: string,
  rows: Record<string, string | number>[],
) {
  const { data, error } = await adminClient.rpc("stage_student_import_batch", {
    target_school_id: schoolId,
    target_actor_id: actorId,
    target_file_name: fileName,
    target_file_sha256: sha256,
    target_rows: rows,
  });
  if (error || !data) throw new Error(error?.message ?? "student_import_stage_failed");
  return String(data);
}
