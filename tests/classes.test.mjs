import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassInsert,
  getClassSaveErrorMessage,
  normalizeClassCode,
  translateClassStatus,
} from "../client/src/lib/classes.ts";

const completeForm = {
  branchId: " branch-1 ",
  name: "  حلقة الفجر  ",
  code: " fajr_01 ",
  scheduleLabel: "   ",
  status: "active",
};

test("normalizes the class code to uppercase", () => {
  assert.equal(normalizeClassCode(" fajr_01 "), "FAJR_01");
  assert.equal(buildClassInsert("school-1", completeForm).code, "FAJR_01");
});

test("converts an empty schedule label to null", () => {
  assert.equal(buildClassInsert("school-1", completeForm).schedule_label, null);
});

test("does not send generated identity or timestamp columns", () => {
  const payload = buildClassInsert("school-1", completeForm);

  for (const field of [
    "id",
    "created_by",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(Object.hasOwn(payload, field), false);
  }
});

test("translates every class status", () => {
  assert.deepEqual(
    ["active", "inactive", "archived"].map(status =>
      translateClassStatus(status)
    ),
    ["نشطة", "غير نشطة", "مؤرشفة"]
  );
});

test("maps a duplicate class code to a safe message", () => {
  assert.equal(
    getClassSaveErrorMessage({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    }),
    "رمز الحلقة مستخدم من قبل."
  );
});

test("maps an RLS error to a safe permission message", () => {
  assert.equal(
    getClassSaveErrorMessage({
      code: "42501",
      message: "new row violates row-level security policy",
    }),
    "لا تملك صلاحية إضافة الحلقات."
  );
});
