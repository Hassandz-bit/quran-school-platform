import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "npm:exceljs@4.4.0";
import { handleStudentImport } from "./handler.ts";
import {
  buildStudentTemplate,
  MAX_FILE_BASE64_CHARS,
  MAX_FILE_BYTES,
  MAX_ROWS,
  parseStudentWorkbook,
} from "./services.ts";

async function workbookBytes(headers: string[], values: unknown[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Students");
  sheet.addRow(headers);
  sheet.addRow(values);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

Deno.test("student import answers browser CORS preflight without authentication", async () => {
  const response = await handleStudentImport(new Request(
    "https://example.test/functions/v1/import-students",
    {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, apikey, content-type, x-client-info",
      },
    },
  ));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), "*");
  const allowedHeaders = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
  for (const header of ["authorization", "apikey", "content-type", "x-client-info"]) {
    if (!allowedHeaders.includes(header)) throw new Error(`CORS preflight is missing ${header}`);
  }
});

Deno.test("student import parses English workbook and normalizes values", async () => {
  const bytes = await workbookBytes(
    ["first_name", "last_name", "birth_date", "gender", "guardian_name", "guardian_relation", "guardian_phone", "branch_code", "class_code"],
    ["Ahmed", "Test", new Date("2014-03-04T00:00:00Z"), "ذكر", "Parent Test", "الأب", "+213555000010", "main", "import_a"],
  );
  const rows = await parseStudentWorkbook(bytes);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].row_number, 2);
  assertEquals(rows[0].birth_date, "2014-03-04");
  assertEquals(rows[0].gender, "male");
  assertEquals(rows[0].guardian_relation, "father");
  assertEquals(rows[0].branch_code, "MAIN");
  assertEquals(rows[0].class_code, "IMPORT_A");
});

Deno.test("student import accepts Arabic headers", async () => {
  const bytes = await workbookBytes(
    ["الاسم", "اللقب", "تاريخ الميلاد", "الجنس", "اسم الولي", "صلة الولي", "هاتف الولي", "رمز الفرع"],
    ["آمنة", "اختبار", "2014-05-06", "أنثى", "ولية اختبار", "الأم", "+213555000011", "MAIN"],
  );
  const rows = await parseStudentWorkbook(bytes);
  assertEquals(rows[0].first_name, "آمنة");
  assertEquals(rows[0].gender, "female");
  assertEquals(rows[0].guardian_relation, "mother");
});

Deno.test("student import refuses missing required headers", async () => {
  const bytes = await workbookBytes(["first_name", "last_name"], ["A", "B"]);
  await assertRejects(() => parseStudentWorkbook(bytes), Error, "student_import_missing_header");
});

Deno.test("student import rejects corrupt xlsx content as an input error", async () => {
  await assertRejects(
    () => parseStudentWorkbook(new TextEncoder().encode("not-an-xlsx")),
    Error,
    "student_import_invalid_workbook",
  );
});

Deno.test("student import encoded-size ceiling matches the 5 MiB binary limit", () => {
  assertEquals(MAX_FILE_BYTES, 5 * 1024 * 1024);
  assertEquals(MAX_FILE_BASE64_CHARS, Math.ceil(MAX_FILE_BYTES / 3) * 4);
});

Deno.test("student import stops as soon as the workbook exceeds the row limit", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Students");
  sheet.addRow(["first_name", "last_name", "birth_date", "gender", "guardian_name", "guardian_relation", "guardian_phone", "branch_code"]);
  for (let index = 0; index <= MAX_ROWS; index += 1) {
    sheet.addRow(["Student", `Test${index}`, "2014-05-06", "male", "Guardian", "father", "+213555000011", "MAIN"]);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  await assertRejects(
    () => parseStudentWorkbook(new Uint8Array(buffer)),
    Error,
    "student_import_too_many_rows",
  );
});

Deno.test("generated template is a readable xlsx with required headers", async () => {
  const bytes = await buildStudentTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("Students");
  if (!sheet) throw new Error("Students sheet missing");
  const headers: string[] = [];
  sheet.getRow(1).eachCell(cell => headers.push(String(cell.value)));
  for (const expected of ["first_name", "last_name", "birth_date", "gender", "guardian_name", "guardian_relation", "guardian_phone", "branch_code"]) {
    if (!headers.includes(expected)) throw new Error(`template missing ${expected}`);
  }
});
