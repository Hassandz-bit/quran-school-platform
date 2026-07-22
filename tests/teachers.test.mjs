import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildTeacherInsert,
  getTeacherSaveErrorMessage,
  translateTeacherGender,
  translateTeacherStatus,
} from "../client/src/lib/teachers.ts";

const completeForm = {
  branchId: " branch-1 ",
  firstName: "  محمد  ",
  lastName: "  بن سالم  ",
  gender: "male",
  phone: "   ",
  email: "",
  specialization: "   ",
  qualification: "",
  hireDate: "2026-07-22",
  status: "active",
  notes: "   ",
};

test("converts optional empty teacher fields to null", () => {
  const payload = buildTeacherInsert("school-1", completeForm);

  assert.equal(payload.phone, null);
  assert.equal(payload.email, null);
  assert.equal(payload.specialization, null);
  assert.equal(payload.qualification, null);
  assert.equal(payload.notes, null);
});

test("trims teacher first and last names", () => {
  const payload = buildTeacherInsert("school-1", completeForm);

  assert.equal(payload.first_name, "محمد");
  assert.equal(payload.last_name, "بن سالم");
});

test("does not send generated, profile, or audit columns", () => {
  const payload = buildTeacherInsert("school-1", completeForm);

  for (const field of [
    "id",
    "profile_id",
    "created_by",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(Object.hasOwn(payload, field), false);
  }
});

test("translates every teacher status in Arabic and English", () => {
  const statuses = ["active", "inactive", "on_leave", "archived"];

  assert.deepEqual(
    statuses.map(status => translateTeacherStatus(status, "ar")),
    ["نشط", "غير نشط", "في إجازة", "مؤرشف"]
  );
  assert.deepEqual(
    statuses.map(status => translateTeacherStatus(status, "en")),
    ["Active", "Inactive", "On leave", "Archived"]
  );
});

test("translates teacher gender in Arabic and English", () => {
  assert.deepEqual(
    ["male", "female"].map(gender => translateTeacherGender(gender, "ar")),
    ["ذكر", "أنثى"]
  );
  assert.deepEqual(
    ["male", "female"].map(gender => translateTeacherGender(gender, "en")),
    ["Male", "Female"]
  );
});

test("maps an RLS error to a safe permission message", () => {
  assert.equal(
    getTeacherSaveErrorMessage({
      code: "42501",
      message: "new row violates row-level security policy",
    }),
    "لا تملك صلاحية إضافة المعلمين."
  );
});

test("maps a foreign key error to a safe branch message", () => {
  assert.equal(
    getTeacherSaveErrorMessage({
      code: "23503",
      message: "insert or update violates foreign key constraint",
    }),
    "تعذر التحقق من الفرع المختار."
  );
});

test("maps a check constraint error to a safe validation message", () => {
  assert.equal(
    getTeacherSaveErrorMessage({
      code: "23514",
      message: "new row violates check constraint",
    }),
    "بعض بيانات المعلم غير صحيحة."
  );
});

test("uses the teachers route in every current application sidebar", async () => {
  const files = [
    "../client/src/pages/Dashboard.tsx",
    "../client/src/pages/StudentsList.tsx",
    "../client/src/pages/ClassesList.tsx",
    "../client/src/pages/TeachersList.tsx",
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /path:\s*["']\/teachers["']/);
  }

  const appSource = await readFile(
    new URL("../client/src/App.tsx", import.meta.url),
    "utf8"
  );
  assert.match(appSource, /<Route path=["']\/teachers["']>/);
});

test("teachers data queries never select every column", async () => {
  const source = await readFile(
    new URL("../client/src/lib/teachers.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /\.select\s*\(\s*["']\*["']\s*\)/);
  assert.equal(source.match(/\.insert\s*\(/g)?.length, 1);
});
