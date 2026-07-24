import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getDashboardScheduleLabel,
  normalizeDashboardCount,
} from "../client/src/lib/dashboard.ts";

const dashboardSource = await readFile(
  new URL("../client/src/pages/Dashboard.tsx", import.meta.url),
  "utf8"
);

test("converts a null dashboard count to zero", () => {
  assert.equal(normalizeDashboardCount(null), 0);
});

test("keeps a real integer dashboard count", () => {
  assert.equal(normalizeDashboardCount(27), 27);
});

test("uses the localized fallback for an empty schedule", () => {
  assert.equal(getDashboardScheduleLabel(null), "غير محدد");
  assert.equal(getDashboardScheduleLabel("   "), "غير محدد");
  assert.equal(getDashboardScheduleLabel("", "en"), "Not set");
});

test("keeps attendance unavailable and links the finance dashboard", () => {
  assert.match(dashboardSource, /unavailable: "غير متاح بعد"/);
  assert.match(dashboardSource, /attendanceHint: "يُفعّل بعد إنشاء وحدة الحضور"/);
  assert.match(dashboardSource, /path: "\/finance"/);
});

test("does not contain the old mock dashboard values", () => {
  for (const oldValue of [
    'value: "145"',
    'value: "92%"',
    'value: "8"',
    'value: "12"',
  ]) {
    assert.equal(dashboardSource.includes(oldValue), false);
  }
});

test("does not contain the mock absentee names", () => {
  for (const mockName of [
    "أحمد محمد",
    "فاطمة علي",
    "يوسف بن عمر",
    "Ahmed Mohammed",
    "Fatima Ali",
    "Youssef Ben Omar",
  ]) {
    assert.equal(dashboardSource.includes(mockName), false);
  }
});
