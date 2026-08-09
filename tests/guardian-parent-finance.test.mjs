import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/020_guardian_parent_finance_reads.sql";
const parentLibPath = "client/src/lib/parent-portal.ts";
const parentPagePath = "client/src/pages/ParentStudent.tsx";

const [migration, parentLib, parentPage] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(parentLibPath, "utf8"),
  readFile(parentPagePath, "utf8"),
]);

test("Migration 020 exposes dedicated guardian finance RPCs only", () => {
  for (const name of [
    "get_my_guardian_student_finance_summary",
    "list_my_guardian_student_charges",
    "list_my_guardian_student_payments",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${name}\\(`, "i")
    );
  }

  assert.equal((migration.match(/security definer/gi) ?? []).length, 3);
  assert.equal((migration.match(/set search_path = ''/gi) ?? []).length, 3);
  assert.equal((migration.match(/public\.is_active_guardian_of_student\(/g) ?? []).length, 3);
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(
    migration,
    /alter\s+table\s+public\.(student_charges|payments|student_discounts|expenses)/i
  );
  assert.doesNotMatch(migration, /finance\.(view|manage|expenses)/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(permissions|role_permissions|school_memberships|membership_roles)/i);
});

test("Parent finance contracts omit internal accounting metadata", () => {
  assert.doesNotMatch(
    migration,
    /returns table[\s\S]*?\b(notes|received_by|reference_number|created_by)\b[\s\S]*?\)\s*language/gi
  );
  assert.doesNotMatch(migration, /guardian_email|guardian_phone|national_id/i);
});

test("Parent finance data client uses RPCs instead of direct finance tables", () => {
  assert.doesNotMatch(
    parentLib,
    /\.from\(\s*["'](student_charges|payments|student_discounts|expenses)["']\s*\)/
  );
  assert.match(parentLib, /rpc\("get_my_guardian_student_finance_summary"/);
  assert.match(parentLib, /rpc\("list_my_guardian_student_charges"/);
  assert.match(parentLib, /rpc\("list_my_guardian_student_payments"/);
});

test("Parent student page renders read-only finance without admin finance routes", () => {
  assert.match(parentPage, /fetchParentStudentFinance/);
  assert.match(parentPage, />المالية</);
  assert.match(parentPage, /إجمالي الرسوم/);
  assert.match(parentPage, /سجل المدفوعات/);
  assert.doesNotMatch(parentPage, /\/finance\//);
  assert.doesNotMatch(parentPage, /insert\(|update\(|delete\(/);
});
