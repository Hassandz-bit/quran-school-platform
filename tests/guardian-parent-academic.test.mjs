import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/019_guardian_parent_academic_reads.sql";
const parentLibPath = "client/src/lib/parent-portal.ts";
const appPath = "client/src/App.tsx";
const postLoginPath = "client/src/pages/PostLoginRedirect.tsx";

const [migration, parentLib, app, postLogin] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(parentLibPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(postLoginPath, "utf8"),
]);

test("Migration 019 exposes dedicated guardian academic RPCs only", () => {
  for (const name of [
    "list_my_guardian_students",
    "get_my_guardian_student_attendance_summary",
    "list_my_guardian_student_attendance",
    "get_my_guardian_student_memorization_summary",
    "list_my_guardian_student_memorization",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`, "i"));
  }

  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /alter\s+table\s+public\.(students|attendance_sessions|attendance_records|memorization_records)/i);
  assert.doesNotMatch(migration, /student_charges|payments|expenses|finance\.view/i);
});

test("Guardian academic RPCs use active relationship checks and hardened definer settings", () => {
  assert.match(migration, /public\.is_active_guardian_of_student\(/);
  assert.equal((migration.match(/security definer/gi) ?? []).length, 5);
  assert.equal((migration.match(/set search_path = ''/gi) ?? []).length, 5);
  assert.match(migration, /from public, anon;/i);
  assert.match(migration, /to authenticated;/i);
});

test("Parent data client uses RPCs instead of direct core table reads", () => {
  assert.doesNotMatch(parentLib, /\.from\(\s*["'](students|attendance_sessions|attendance_records|memorization_records)["']\s*\)/);
  assert.match(parentLib, /rpc\("list_my_guardian_students"\)/);
  assert.match(parentLib, /rpc\("get_my_guardian_student_attendance_summary"/);
  assert.match(parentLib, /rpc\("list_my_guardian_student_attendance"/);
  assert.match(parentLib, /rpc\("get_my_guardian_student_memorization_summary"/);
  assert.match(parentLib, /rpc\("list_my_guardian_student_memorization"/);
});

test("Parent portal stays outside the administrative AppShell", () => {
  assert.match(app, /<Route path="\/parent\/students\/:studentId">/);
  assert.match(app, /<Route path="\/parent">/);
  assert.match(app, /<ParentRoute>[\s\S]*?<ParentShell>/);
  assert.doesNotMatch(app, /<Route path="\/parent">[\s\S]{0,300}<Shell>/);
});

test("Post-login preserves staff precedence and supports parent-only accounts", () => {
  assert.match(postLogin, /school && !authorizationError && defaultRoutePath/);
  assert.match(postLogin, /listMyGuardianStudents\(\)/);
  assert.match(postLogin, /setLocation\("\/parent"\)/);
});
