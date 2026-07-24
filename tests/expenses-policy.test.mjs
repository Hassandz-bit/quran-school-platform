import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSource = await readFile(
  new URL("../supabase/012_expenses_visibility.sql", import.meta.url),
  "utf8"
);

test("expense visibility requires the dedicated finance.expenses permission", () => {
  assert.match(
    migrationSource,
    /has_school_permission\(school_id,\s*'finance\.expenses'\)/
  );
  assert.match(
    migrationSource,
    /has_branch_permission\(\s*school_id,\s*branch_id,\s*'finance\.expenses'\s*\)/
  );
  assert.equal(migrationSource.includes("'finance.view'"), false);
  assert.equal(migrationSource.includes("'finance.manage'"), false);
});

test("expense visibility preserves school and branch scoping", () => {
  assert.match(migrationSource, /branch_id is null/);
  assert.match(migrationSource, /branch_id is not null/);
  assert.match(
    migrationSource,
    /drop policy if exists expenses_select_authorized on public\.expenses/
  );
  assert.match(
    migrationSource,
    /create policy expenses_select_authorized[\s\S]*for select to authenticated/
  );
});

test("expense visibility migration does not add delete access or bypass RLS", () => {
  assert.equal(/\bdelete\b/i.test(migrationSource), false);
  assert.equal(/service_role/i.test(migrationSource), false);
  assert.equal(/security\s+definer/i.test(migrationSource), false);
});
