import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentInsert,
  getStudentSaveErrorMessage,
  translateStudentStatus,
} from "../client/src/lib/students.ts";

const completeForm = {
  branchId: "branch-1",
  classId: "",
  firstName: "  محمد  ",
  lastName: "  بن سالم  ",
  birthDate: "2014-03-02",
  gender: "male",
  nationalId: "  12345  ",
  phone: "   ",
  email: "",
  address: "  حي النور  ",
  previousSchool: "",
  educationLevel: "   ",
  guardianName: "  أحمد بن سالم  ",
  guardianRelation: "father",
  guardianPhone: " 0550000000 ",
  guardianEmail: " ",
  guardianJob: "",
  startDate: "2026-07-21",
  birthCertificateProvided: true,
  photosProvided: false,
  medicalReportProvided: false,
  previousCertificateProvided: false,
};

test("normalizes optional empty fields to null and trims identity fields", () => {
  const payload = buildStudentInsert("school-1", completeForm);

  assert.equal(payload.first_name, "محمد");
  assert.equal(payload.last_name, "بن سالم");
  assert.equal(payload.national_id, "12345");
  assert.equal(payload.guardian_name, "أحمد بن سالم");
  assert.equal(payload.guardian_phone, "0550000000");
  assert.equal(payload.phone, null);
  assert.equal(payload.email, null);
  assert.equal(payload.previous_school, null);
  assert.equal(payload.education_level, null);
  assert.equal(payload.guardian_email, null);
  assert.equal(payload.guardian_job, null);
  assert.equal(payload.address, "حي النور");
});

test("does not send generated identity or timestamp columns", () => {
  const payload = buildStudentInsert("school-1", completeForm);

  for (const field of [
    "id",
    "created_by",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(Object.hasOwn(payload, field), false);
  }
});

test("keeps class_id optional", () => {
  const withoutClass = buildStudentInsert("school-1", completeForm);
  const withClass = buildStudentInsert("school-1", {
    ...completeForm,
    classId: "  class-1  ",
  });

  assert.equal(withoutClass.class_id, null);
  assert.equal(withClass.class_id, "class-1");
});

test("translates every student status", () => {
  assert.deepEqual(
    ["active", "suspended", "transferred", "graduated", "withdrawn"].map(
      status => translateStudentStatus(status)
    ),
    ["نشط", "موقوف", "منقول", "متخرج", "منسحب"]
  );
});

test("maps a national ID unique violation to a safe message", () => {
  assert.equal(
    getStudentSaveErrorMessage({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    }),
    "رقم الهوية مستخدم لطالب آخر."
  );
});
