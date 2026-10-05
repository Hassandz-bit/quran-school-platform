import ExcelJS from "npm:exceljs@4.4.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";
import assert from "node:assert/strict";
import { parseGuardianWorkbook, previewGuardianRows } from "./guardian-import.ts";

const assertEquals = (actual: unknown, expected: unknown) => assert.deepEqual(actual, expected);

const BRANCH_ID = "branch-1";
const STUDENT_ID = "student-1";
const COLUMNS = ["اسم الطالب", "رمز الطالب الوطني", "اسم ولي الأمر", "البريد الإلكتروني", "الهاتف", "صلة القرابة", "ولي أساسي", "رمز الفرع"];

async function workbookBytes(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Guardians");
  sheet.addRow(COLUMNS);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function fakeClients(students: Array<{ id: string; studentName: string; branchId: string; nationalId?: string; className?: string | null }>) {
  const userClient = {
    rpc: async (name: string) => {
      assertEquals(name, "list_guardian_invite_students");
      return {
        data: students.map(student => ({ student_id: student.id, student_name: student.studentName, branch_id: student.branchId, class_name: student.className ?? null })),
        error: null,
      };
    },
  };
  const adminClient = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          in: (_column: string, ids: string[]) => Promise.resolve({
            data: table === "branches"
              ? ids.includes(BRANCH_ID) ? [{ id: BRANCH_ID, code: "NORTH", status: "active" }] : []
              : students.filter(student => ids.includes(student.id)).map(student => ({ id: student.id, national_id: student.nationalId ?? "" })),
            error: null,
          }),
        }),
      }),
    }),
  };
  return {
    userClient: userClient as unknown as SupabaseClient,
    adminClient: adminClient as unknown as SupabaseClient,
  };
}

Deno.test("guardian workbook reads Arabic headers and normalizes email, relation, and primary flag", async () => {
  const rows = await parseGuardianWorkbook(await workbookBytes([
    ["أحمد علي", "12345", "فاطمة علي", "PARENT@EXAMPLE.TEST", "+213 555 123 456", "أم", "نعم", "north"],
  ]));
  assertEquals(rows.length, 1);
  assertEquals(rows[0].row_number, 2);
  assertEquals(rows[0].student_name, "أحمد علي");
  assertEquals(rows[0].email, "parent@example.test");
  assertEquals(rows[0].relationship_type, "mother");
  assertEquals(rows[0].is_primary, "true");
  assertEquals(rows[0].branch_code, "NORTH");
});

Deno.test("guardian import matches a unique permitted student by branch, name, and optional national ID", async () => {
  const workbook = await parseGuardianWorkbook(await workbookBytes([
    ["أحمد علي", "12345", "فاطمة علي", "parent@example.test", "0555123456", "أم", "لا", "NORTH"],
  ]));
  const { userClient, adminClient } = fakeClients([
    { id: STUDENT_ID, studentName: "أحمد علي", branchId: BRANCH_ID, nationalId: "12345", className: "الحلقة الأولى" },
  ]);
  const preview = await previewGuardianRows(userClient, adminClient, "school-1", workbook);
  assertEquals(preview[0].rowStatus, "ready");
  assertEquals(preview[0].studentId, STUDENT_ID);
  assertEquals(preview[0].studentClassName, "الحلقة الأولى");
  assertEquals(preview[0].issues, []);
});

Deno.test("guardian import reports duplicate relations and ambiguous student names without making them eligible", async () => {
  const workbook = await parseGuardianWorkbook(await workbookBytes([
    ["أحمد علي", "", "فاطمة علي", "parent@example.test", "", "أم", "لا", "NORTH"],
    ["أحمد علي", "", "فاطمة علي", "PARENT@example.test", "", "أم", "لا", "NORTH"],
  ]));
  const { userClient, adminClient } = fakeClients([
    { id: "student-1", studentName: "أحمد علي", branchId: BRANCH_ID },
    { id: "student-2", studentName: "أحمد علي", branchId: BRANCH_ID },
  ]);
  const preview = await previewGuardianRows(userClient, adminClient, "school-1", workbook);
  assertEquals(preview.every(row => row.rowStatus === "error"), true);
  assertEquals(preview.every(row => row.issues.includes("student_ambiguous")), true);
});
