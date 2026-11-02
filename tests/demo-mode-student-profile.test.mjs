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

test("student photos are private and appear in the directory, class list, and profile", async () => {
  const [sql, students, student360Data, form, profile, studentList, classList] = await Promise.all([
    read("supabase/021_demo_mode_student_profile.sql"),
    read("client/src/lib/students.ts"),
    read("client/src/lib/student-360.ts"),
    read("client/src/pages/AddStudentForm.tsx"),
    read("client/src/pages/Student360.tsx"),
    read("client/src/pages/StudentsList.tsx"),
    read("client/src/pages/Memorization.tsx"),
  ]);

  assert.match(sql, /'primary'.*'middle'.*'secondary'.*'university'/s);
  assert.match(sql, /education_year between 1 and 5/);
  assert.match(sql, /education_year between 1 and 4/);
  assert.match(sql, /education_year between 1 and 3/);
  assert.match(sql, /education_year between 1 and 10/);
  assert.match(sql, /'student-photos'[\s\S]*false[\s\S]*5242880/);
  assert.match(students, /crypto\.randomUUID/);
  assert.match(students, /\.storage\.from\(STUDENT_PHOTO_BUCKET\)\.upload/);
  assert.match(students, /createStudentPhotoUrlMap/);
  assert.match(students, /createSignedUrls/);
  assert.match(student360Data, /createStudentPhotoUrlMap/);
  assert.match(student360Data, /photoUrl/);
  assert.match(form, /ابتدائي/);
  assert.match(form, /متوسط/);
  assert.match(form, /ثانوي/);
  assert.match(form, /جامعي/);
  assert.match(form, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(profile, /profile\.photoUrl/);
  assert.match(studentList, /StudentAvatar/);
  assert.match(classList, /StudentAvatar/);
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

test("demo status lookup fails closed instead of exposing demo creation", async () => {
  const [card, helper] = await Promise.all([
    read("client/src/components/DemoModeCard.tsx"),
    read("client/src/lib/demo-mode.ts"),
  ]);
  assert.match(card, /const \[loadError, setLoadError\] = useState\(false\)/);
  assert.match(card, /catch \{\s*\/\/ Fail closed:[\s\S]*?setLoadError\(true\)/);
  assert.match(card, /if \(loadError\)/);
  assert.match(card, /إعادة المحاولة/);
  assert.doesNotMatch(card, /catch \{\s*\/\/ Migration may not have been applied[\s\S]*?setStatus\(EMPTY_STATUS\)/);
  assert.match(helper, /if \(error\) throw error/);
});

test("demo cleanup errors expose actionable SQLSTATEs without logging backend payloads", async () => {
  const helper = await read("client/src/lib/demo-mode.ts");
  for (const code of ["42501", "23503", "23505", "23514", "57014"]) {
    assert.ok(helper.includes(code), "missing SQLSTATE handling: " + code);
  }
  assert.match(helper, /console\.error\([^\n]+\{ code: code \|\| "unknown" \}\)/);
  assert.doesNotMatch(helper, /console\.error\([^\n]*(message|details|hint)/i);
  assert.match(helper, /demo_cleanup_blocked_guardian_link/);
  assert.match(helper, /demo_cleanup_blocked_real_student_in_demo_class/);
});

test("demo controls are school-admin only in the dashboard", async () => {
  const dashboard = await read("client/src/pages/Dashboard.tsx");
  assert.match(dashboard, /isSchoolAdmin && school\?\.id/);
  assert.match(dashboard, /<DemoModeCard schoolId=\{school\.id\}/);
});
