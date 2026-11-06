import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/081_school_admin_full_permissions.sql", import.meta.url), "utf8");

test("school-wide school_admin bypasses individual school permission catalogue entries", () => {
  assert.match(migration, /public\.is_active_school_member\(target_school_id\)/);
  assert.match(migration, /mr\.branch_id is null\s+and r\.code = 'school_admin'/);
  assert.match(migration, /create or replace function public\.has_school_permission/i);
});

test("school-wide school_admin can manage every valid branch, including creating classes and duwams", () => {
  assert.match(migration, /create or replace function public\.has_branch_permission/i);
  assert.match(migration, /b\.school_id = target_school_id\s+and b\.id = target_branch_id/);
  assert.match(migration, /mr\.branch_id is null\s+and r\.code = 'school_admin'/);
});

test("branch-scoped users still require explicit permission grants", () => {
  assert.match(migration, /mr\.branch_id is null or mr\.branch_id = target_branch_id/);
  assert.match(migration, /join public\.role_permissions rp/);
  assert.match(migration, /join public\.permissions p on p\.id = rp\.permission_id/);
});

test("inactive profiles, memberships, and roles do not gain administrator access", () => {
  assert.match(migration, /public\.is_active_school_member\(target_school_id\)/);
  assert.match(migration, /sm\.status = 'active'/);
  assert.match(migration, /r\.status = 'active'/);
});
