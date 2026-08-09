import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAppNavigation } from "../client/src/lib/app-navigation.ts";
import { getDefaultAuthenticatedRoute } from "../client/src/lib/default-route.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("branch managers get a usable scoped default route", () => {
  const route = getDefaultAuthenticatedRoute({
    isSchoolAdmin: false,
    activeRoleCodes: ["branch_manager"],
  });

  assert.deepEqual(route, { path: "/attendance", label: "الحضور" });
});

test("branch managers see scoped learning and finance modules without admin pages", () => {
  const navigation = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["branch_manager"],
    canViewAcademicReports: true,
    canViewMembers: false,
  });
  const ids = navigation.map(item => item.id);

  assert.deepEqual(ids, [
    "attendance",
    "memorization",
    "academic-reports",
    "finance",
  ]);
  for (const adminOnly of ["dashboard", "students", "teachers", "classes"]) {
    assert.equal(ids.includes(adminOnly), false);
  }
});

test("Vitest blocks accidental live Supabase traffic from runtime tests", async () => {
  const [config, guard] = await Promise.all([
    read("vitest.config.ts"),
    read("tests/vitest-network-guard.ts"),
  ]);

  assert.match(config, /setupFiles: \[path\.resolve\(root, "tests\/vitest-network-guard\.ts"\)\]/);
  assert.match(guard, /VITE_SUPABASE_URL/);
  assert.match(guard, /\.supabase\.co/);
  assert.match(guard, /\.supabase\.net/);
  assert.match(guard, /Vitest network isolation blocked a live Supabase request/);
});
