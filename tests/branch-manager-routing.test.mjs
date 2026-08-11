import assert from "node:assert/strict";
import test from "node:test";
import { getAppNavigation } from "../client/src/lib/app-navigation.ts";
import { getDefaultAuthenticatedRoute } from "../client/src/lib/default-route.ts";

test("branch manager gets a usable scoped default route", () => {
  assert.deepEqual(
    getDefaultAuthenticatedRoute({
      isSchoolAdmin: false,
      activeRoleCodes: ["branch_manager"],
    }),
    { path: "/attendance", label: "الحضور" }
  );
});

test("branch manager sees scoped modules and exact-access CRM without admin-only school pages", () => {
  const navigation = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["branch_manager"],
    canViewAcademicReports: true,
    canViewMembers: true,
    canViewRegistrations: true,
  });
  const ids = navigation.map(item => item.id);

  assert.deepEqual(ids, [
    "attendance",
    "memorization",
    "academic-reports",
    "finance",
    "receipts",
    "registrations",
    "notifications",
    "members",
    "settings",
  ]);

  for (const adminOnly of ["dashboard", "students", "teachers", "classes", "guardians"]) {
    assert.equal(ids.includes(adminOnly), false);
  }
});

test("registration navigation follows exact access instead of role names", () => {
  const branchManagerWithoutAccess = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["branch_manager"],
    canViewRegistrations: false,
  });
  assert.equal(
    branchManagerWithoutAccess.some(item => item.id === "registrations"),
    false
  );

  const teacherWithExplicitAccess = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["teacher"],
    canViewRegistrations: true,
  });
  assert.equal(
    teacherWithExplicitAccess.some(item => item.id === "registrations"),
    true
  );
});

test("navigation labels switch to English without changing authorization", () => {
  const navigation = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["teacher"],
    locale: "en",
  });

  assert.deepEqual(
    navigation.map(item => [item.id, item.label]),
    [
      ["attendance", "Attendance"],
      ["memorization", "Memorization"],
      ["notifications", "Notifications"],
      ["settings", "Settings"],
    ]
  );
});
