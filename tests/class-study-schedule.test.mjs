import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/068_class_study_schedule.sql");
const classes = read("../client/src/lib/classes.ts");
const form = read("../client/src/pages/AddClassForm.tsx");
const list = read("../client/src/pages/ClassesList.tsx");
test("migration adds weekdays and validates paired time values", () => {
  assert.match(migration, /study_days text\[\] not null default '\{\}'/i);
  assert.match(migration, /add column if not exists start_time time/i);
  assert.match(migration, /add column if not exists end_time time/i);
  assert.match(migration, /start_time < end_time/i);
  assert.doesNotMatch(migration, /drop column.*schedule_label/i);
});
test("class creation persists schedule and provides duwam grouping helpers", () => {
  assert.match(classes, /study_days: \[\.\.\.values\.studyDays\]/);
  assert.match(classes, /start_time: values\.startTime \|\| null/);
  assert.match(classes, /getDuwamKey/);
  assert.match(classes, /getDuwamLabel/);
});
test("class form offers weekday selection and validates time range", () => {
  assert.match(form, /STUDY_DAY_KEYS\.map/);
  assert.match(form, /formData\.startTime >= formData\.endTime/);
  assert.match(form, /Study days/);
});
test("class list groups classes that share the same duwam", () => {
  assert.match(list, /duwamGroups/);
  assert.match(list, /group\.classes\.map/);
  assert.match(list, /getDuwamKey/);
});
