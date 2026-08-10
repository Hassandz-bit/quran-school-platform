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

test("branch manager sees scoped modules, own notifications, and personal settings without admin-only school pages", () => {
  const navigation = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["branch_manager"],
    canViewAcademicReports: true,
    canViewMembers: true,
  });
  const ids = navigation.map(item => item.id);

  assert.deepEqual(ids, [
    "attendance",
    "memorization",
    "academic-reports",
    "finance",
    "notifications",
    "members",
    "settings",
  ]);

  for (const adminOnly of ["dashboard", "students", "teachers", "classes", "guardians"]) {
    assert.equal(ids.includes(adminOnly), false);
  }
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
