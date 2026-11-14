import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/074_teacher_only_memorization_writes.sql", import.meta.url),
  "utf8",
);

test("only the assigned active teacher can manage a memorization class", () => {
  const access = migration.match(
    /create or replace function public\.can_access_memorization_class[\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(access);
  assert.match(access, /target_permission_code = 'memorization\.manage'/);
  assert.match(access, /role\.code = 'teacher'/);
  assert.match(access, /teacher\.profile_id = \(select auth\.uid\(\)\)/);
  assert.match(access, /class_teacher\.class_id = target_class_id/);
  assert.match(access, /class_teacher\.status = 'active'/);
  assert.match(access, /role\.code <> 'teacher'[\s\S]*?or exists/);
});

test("school administrators and branch managers retain view access only", () => {
  const access = migration.match(
    /create or replace function public\.can_access_memorization_class[\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(access);
  assert.match(access, /target_permission_code = 'memorization\.view'/);
  assert.match(access, /permission\.code = 'memorization\.view'/);
  assert.match(access, /target_permission_code = 'memorization\.manage'[\s\S]*?role\.code = 'teacher'/);
  const manage = access.split(/target_permission_code = 'memorization\\.manage'/i).slice(1).join("target_permission_code = 'memorization.manage'");
  assert.ok(manage);
  assert.match(manage, /role\.code = 'teacher'/);
  assert.match(manage, /permission\.code = 'memorization\.manage'/);
  assert.doesNotMatch(manage, /role\.code <> 'teacher'/);
});

test("insert trigger rejects records attributed to another teacher", () => {
  const trigger = migration.match(
    /create or replace function public\.prepare_memorization_record[\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(trigger);
  assert.match(trigger, /resolved_teacher_profile_id is distinct from \(select auth\.uid\(\)\)/);
  assert.match(trigger, /MEMORIZATION_TEACHER_IDENTITY_MISMATCH/);
  assert.doesNotMatch(trigger, /caller_has_non_teacher_manage/);
});

test("update trigger permits only the original assigned teacher", () => {
  const trigger = migration.match(
    /create or replace function public\.prepare_memorization_record[\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(trigger);
  assert.match(trigger, /teacher\.id = old\.teacher_id/);
  assert.match(trigger, /class_teacher\.class_id = old\.class_id/);
  assert.match(trigger, /class_teacher\.status = 'active'/);
  assert.match(trigger, /resolved_teacher_profile_id is distinct from \(select auth\.uid\(\)\)/);
  assert.match(trigger, /MEMORIZATION_TEACHER_UPDATE_FORBIDDEN/);
  assert.doesNotMatch(trigger, /caller_has_non_teacher_manage/);
});

test("security-definer functions keep an empty search path and browser grants", () => {
  for (const name of ["can_access_memorization_class", "prepare_memorization_record"]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${name}[\\s\\S]*?security definer\\s+set search_path = ''`, "i"),
    );
  }
  assert.match(migration, /revoke execute on function public\.prepare_memorization_record\(\) from anon, authenticated/i);
});
