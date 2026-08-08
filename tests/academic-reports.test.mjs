import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [app, shell, navigation, helper, page, packageJson] = await Promise.all([
  read("client/src/App.tsx"),
  read("client/src/components/AppShell.tsx"),
  read("client/src/lib/app-navigation.ts"),
  read("client/src/lib/academic-reports.ts"),
  read("client/src/pages/AcademicReports.tsx"),
  read("package.json"),
]);

test("registers Academic Reports inside the protected AppShell", () => {
  assert.match(app, /path="\/academic-reports"/);
  assert.match(app, /<ProtectedRoute>[\s\S]*?<Shell>[\s\S]*?<AcademicReports \/>/);
  assert.match(navigation, /label: "التقارير التعليمية"/);
});

test("shows navigation from actual academic access rather than finance roles", () => {
  assert.match(shell, /fetchAcademicReportsAccess/);
  assert.match(shell, /hasAnyAcademicReportsAccess/);
  assert.match(navigation, /canViewAcademicReports/);
  assert.match(
    navigation,
    /\.\.\.\(canViewAcademicReports[\s\S]*?path: "\/academic-reports"/
  );
});

test("reuses current scoped permission helpers and tenant/date filters", () => {
  assert.match(helper, /fetchAttendanceScope\(schoolId, client\)/);
  assert.match(helper, /fetchMemorizationScope\(schoolId, client\)/);
  assert.match(helper, /\.eq\("school_id", schoolId\)/);
  assert.match(helper, /\.in\("class_id", classIds\)/);
  assert.match(helper, /\.gte\("session_date", filters\.dateFrom\)/);
  assert.match(helper, /\.lte\("record_date", filters\.dateTo\)/);
  assert.doesNotMatch(helper, /activeRoleCodes|finance\.view|finance_officer/);
});

test("supports filtered Arabic CSV, browser print, and Student 360 links", () => {
  assert.match(helper, /"\\uFEFF"/);
  assert.match(helper, /buildAcademicReportsCsv/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /\/students\/" \+ studentId/);
  assert.match(page, /تاريخ الطباعة/);
  assert.match(page, /كل الفروع/);
  assert.match(page, /كل الحلقات/);
});

test("keeps Academic Reports read-only and free of privileged access", () => {
  const source = helper + "\n" + page;
  assert.doesNotMatch(source, /service_role/i);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
  assert.match(packageJson, /academic-reports-runtime\.test\.ts/);
});
