import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [navigation, shell, dashboard] = await Promise.all([
  read("client/src/lib/app-navigation.ts"),
  read("client/src/components/AppShell.tsx"),
  read("client/src/pages/Dashboard.tsx"),
]);

test("app shell keeps role-aware destinations isolated", () => {
  assert.match(navigation, /hasRole\(roles, "teacher"\)/);
  assert.match(navigation, /hasRole\(roles, "academic_supervisor"\)/);
  assert.match(navigation, /hasRole\(roles, "finance_officer"\)/);
  assert.match(navigation, /canViewMembers = false/);
  assert.match(navigation, /canManageSchool = isSchoolAdmin/);
  assert.match(shell, /fetchMembersAccess/);
  assert.match(shell, /canViewMembers/);
  assert.match(navigation, /\.slice\(0, 4\)/);
  assert.doesNotMatch(navigation, /service_role/i);
});

test("app shell provides compact mobile navigation and an accessible drawer", () => {
  assert.match(shell, /aria-label="التنقل السفلي"/);
  assert.match(shell, /aria-label="المزيد"/);
  assert.match(shell, /aria-label="قائمة المزيد"/);
  assert.match(shell, /min-h-12/);
  assert.match(shell, /pb-\\[calc\\(7rem\\+env\\(safe-area-inset-bottom\\)\\)\\]/);\n  assert.match(shell, /overflow-x-clip/);\n  assert.match(shell, /variant\\?: "dark" \\| "light"/);\n  assert.match(shell, /variant="light"/);\n  assert.match(shell, /md:hidden/);
  assert.match(shell, /dir="rtl"/);
});

test("dashboard uses reusable phase-one UI primitives", () => {
  assert.match(dashboard, /PageHeader/);
  assert.match(dashboard, /StatCard/);
  assert.match(dashboard, /QuickActionCard/);
  assert.match(dashboard, /EmptyState/);
});
