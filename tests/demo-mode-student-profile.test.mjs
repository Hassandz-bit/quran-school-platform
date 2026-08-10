import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("demo mode tracks created records centrally and requires school.update", async () => {
  const sql = await read("supabase/021_demo_mode_student_profile.sql");
  assert.match(sql, /create table if not exists public\.demo_seed_batches/);
  assert.match(sql, /create table if not exists public\.demo_seed_records/);
  assert.match(sql, /create or replace function public\.create_school_demo_data/);
  assert.match(sql, /create or replace function public\.clear_school_demo_data/);
  assert.match(sql, /has_school_permission\(target_school_id, 'school\.update'\)/);
  assert.doesNotMatch(sql, /add column if not exists is_demo/i);
});

test("demo cleanup fails closed when demo entities are mixed with real relationships", async () => {
  const sql = await read("supabase/021_demo_mode_student_profile.sql");
  for (const marker of [
    "demo_cleanup_blocked_teacher_invitation",
    "demo_cleanup_blocked_guardian_link",
    "demo_cleanup_blocked_real_student_in_demo_class",
    "demo_cleanup_blocked_real_memorization_with_demo_teacher",
  ]) {
    assert.match(sql, new RegExp(marker));
  }
});

test("student education is structured and the photo bucket is private", async () => {
  const [sql, students, student360Data, form, profile] = await Promise.all([
    read("supabase/021_demo_mode_student_profile.sql"),
    read("client/src/lib/students.ts"),
    read("client/src/lib/student-360.ts"),
    read("client/src/pages/AddStudentForm.tsx"),
    read("client/src/pages/Student360.tsx"),
  ]);

  assert.match(sql, /'primary'.*'middle'.*'secondary'.*'university'/s);
  assert.match(sql, /education_year between 1 and 5/);
  assert.match(sql, /education_year between 1 and 4/);
  assert.match(sql, /education_year between 1 and 3/);
  assert.match(sql, /education_year between 1 and 10/);
  assert.match(sql, /'student-photos'[\s\S]*false[\s\S]*5242880/);
  assert.match(students, /crypto\.randomUUID/);
  assert.match(students, /\.storage\.from\(STUDENT_PHOTO_BUCKET\)\.upload/);
  assert.match(student360Data, /client\.storage/);
  assert.match(student360Data, /createSignedUrl/);
  assert.doesNotMatch(student360Data, /getSupabaseClient\(\)\.storage/);
  assert.match(form, /ابتدائي/);
  assert.match(form, /متوسط/);
  assert.match(form, /ثانوي/);
  assert.match(form, /جامعي/);
  assert.match(form, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(profile, /profile\.photoUrl/);
  assert.match(profile, /formatEducation\(profile\.educationLevel, profile\.educationYear\)/);
});

test("student profile privilege migration preserves column-level least privilege", async () => {
  const sql = await read("supabase/022_student_profile_column_privileges.sql");
  assert.match(sql, /grant insert \(education_year\)\s+on public\.students to authenticated/i);
  assert.match(sql, /grant update \(education_year, photo_path\)\s+on public\.students to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+insert\s+on\s+public\.students/i);
  assert.doesNotMatch(sql, /grant\s+update\s+on\s+public\.students/i);
  assert.doesNotMatch(sql, /grant\s+all/i);
});

test("demo controls are school-admin only in the dashboard", async () => {
  const dashboard = await read("client/src/pages/Dashboard.tsx");
  assert.match(dashboard, /isSchoolAdmin && school\?\.id/);
  assert.match(dashboard, /<DemoModeCard schoolId=\{school\.id\}/);
});