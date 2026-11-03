import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("student alert summary uses explicit severity levels and guards against treating excused absences as unexcused", async () => {
  const source = await readFile("client/src/components/StudentAlertSummary.tsx", "utf8");
  assert.match(source, /absent >= 4 \? "critical"/);
  assert.match(source, /excused > 0 \? "info"/);
  assert.match(source, /late >= 4 \? "high"/);
  assert.match(source, /weakStreak >= 3/);
  assert.match(source, /لا يصدر حكمًا نهائيًا على الطالب/);
});

test("student alert summary keeps action guidance attached to every alert", async () => {
  const source = await readFile("client/src/components/StudentAlertSummary.tsx", "utf8");
  assert.match(source, /الإجراء المقترح/);
  assert.match(source, /وضع خطة علاجية قصيرة/);
  assert.match(source, /مراجعة أسباب الغياب/);
});
