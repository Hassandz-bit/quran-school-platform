import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/051_treasury_reconciliation_scope_hardening.sql", import.meta.url),
  "utf8",
);

test("reconciliation hardening proves evidence without requiring linked-account visibility", () => {
  assert.match(migration, /get_treasury_reconciliation_base/);
  assert.match(migration, /exists \([\s\S]*?from public\.treasury_movements m[\s\S]*?m\.source_id = s\.source_id[\s\S]*?m\.status = 'posted'/);
  assert.match(migration, /not has_posted_evidence/);
  assert.doesNotMatch(migration, /evidence as \([\s\S]*?treasury_can_view_account/);
  assert.match(migration, /revoke all on function public\.get_treasury_reconciliation_base\(uuid, integer\)[\s\S]*?authenticated/);
});
