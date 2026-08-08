import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MembersPermissionError,
  fetchMembersAccess,
  fetchMembersDirectory,
  filterMembers,
  summarizeMembers,
} from "../client/src/lib/members.ts";

class Query {
  constructor(table, data, calls) {
    this.table = table;
    this.data = data ?? [];
    this.call = { type: "table", table, operations: [] };
    calls.push(this.call);
  }
  select(columns) {
    this.call.operations.push(["select", columns]);
    return this;
  }
  eq(column, value) {
    this.call.operations.push(["eq", column, value]);
    return this;
  }
  neq(column, value) {
    this.call.operations.push(["neq", column, value]);
    return this;
  }
  in(column, values) {
    this.call.operations.push(["in", column, values]);
    return this;
  }
  then(resolve, reject) {
    return Promise.resolve({ data: this.data, error: null }).then(resolve, reject);
  }
}

function createClient(fixtures, permissions = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ type: "rpc", name, args });
      return Promise.resolve({
        data: permissions[args.target_permission_code] === true,
        error: null,
      });
    },
    from(table) {
      return new Query(table, fixtures[table], calls);
    },
  };
}

const fixtures = {
  school_memberships: [
    { id: "m-current", school_id: "school-1", profile_id: "p-current", status: "active", joined_at: "2026-01-10T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
    { id: "m-pending", school_id: "school-1", profile_id: "p-pending", status: "pending", joined_at: null, created_at: "2026-02-01T00:00:00Z" },
    { id: "m-suspended", school_id: "school-1", profile_id: "p-disabled", status: "suspended", joined_at: "2026-03-01T00:00:00Z", created_at: "2026-02-20T00:00:00Z" },
    { id: "m-none", school_id: "school-1", profile_id: "p-none", status: "active", joined_at: "2026-04-01T00:00:00Z", created_at: "2026-03-20T00:00:00Z" },
    { id: "m-revoked", school_id: "school-1", profile_id: "p-revoked", status: "revoked", joined_at: null, created_at: "2026-01-01T00:00:00Z" },
    { id: "m-other", school_id: "school-2", profile_id: "p-other", status: "active", joined_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  ],
  profiles: [
    { id: "p-current", full_name: "أحمد المدير", avatar_url: null, status: "active" },
    { id: "p-pending", full_name: "سارة المسجلة", avatar_url: "https://example.test/avatar.png", status: "active" },
    { id: "p-disabled", full_name: "يوسف المعطل", avatar_url: null, status: "disabled" },
    { id: "p-none", full_name: "ليلى بلا دور", avatar_url: null, status: "active" },
    { id: "p-revoked", full_name: "عضو ملغى", avatar_url: null, status: "active" },
    { id: "p-other", full_name: "عضو مدرسة أخرى", avatar_url: null, status: "active" },
  ],
  membership_roles: [
    { id: "a-admin", school_id: "school-1", membership_id: "m-current", role_id: "r-admin", branch_id: null },
    { id: "a-teacher-1", school_id: "school-1", membership_id: "m-current", role_id: "r-teacher", branch_id: "b-main" },
    { id: "a-teacher-2", school_id: "school-1", membership_id: "m-current", role_id: "r-teacher", branch_id: "b-east" },
    { id: "a-registrar", school_id: "school-1", membership_id: "m-pending", role_id: "r-registrar", branch_id: "b-main" },
    { id: "a-finance", school_id: "school-1", membership_id: "m-suspended", role_id: "r-finance", branch_id: null },
    { id: "a-revoked", school_id: "school-1", membership_id: "m-revoked", role_id: "r-teacher", branch_id: "b-main" },
    { id: "a-other", school_id: "school-2", membership_id: "m-other", role_id: "r-other", branch_id: null },
  ],
  roles: [
    { id: "r-admin", school_id: "school-1", code: "school_admin", name_ar: "مدير المدرسة", status: "active" },
    { id: "r-teacher", school_id: "school-1", code: "teacher", name_ar: "معلم", status: "active" },
    { id: "r-registrar", school_id: "school-1", code: "registrar", name_ar: "مسجل", status: "active" },
    { id: "r-finance", school_id: "school-1", code: "finance_officer", name_ar: "مسؤول المالية", status: "active" },
    { id: "r-other", school_id: "school-2", code: "teacher", name_ar: "دور خارجي", status: "active" },
  ],
  branches: [
    { id: "b-main", school_id: "school-1", name: "الفرع الرئيسي", status: "active" },
    { id: "b-east", school_id: "school-1", name: "الفرع الشرقي", status: "active" },
    { id: "b-other", school_id: "school-2", name: "فرع خارجي", status: "active" },
  ],
};

test("requires members.view and profiles.view together unless school_admin", async () => {
  const onePermission = createClient({}, { "members.view": true, "profiles.view": false });
  const denied = await fetchMembersAccess("school-1", false, onePermission);
  assert.equal(denied.canView, false);
  assert.equal(denied.hasMembersView, true);
  assert.equal(denied.hasProfilesView, false);

  const both = createClient({}, { "members.view": true, "profiles.view": true });
  assert.equal((await fetchMembersAccess("school-1", false, both)).canView, true);

  const admin = createClient({}, {});
  const adminAccess = await fetchMembersAccess("school-1", true, admin);
  assert.equal(adminAccess.canView, true);
  assert.equal(adminAccess.viaSchoolAdmin, true);
  assert.equal(admin.calls.length, 0);
});

test("denies directory reads before table access when either permission is missing", async () => {
  const client = createClient(fixtures, { "members.view": true, "profiles.view": false });
  await assert.rejects(
    () => fetchMembersDirectory({ schoolId: "school-1", currentProfileId: "p-current" }, client),
    MembersPermissionError
  );
  assert.equal(client.calls.some(call => call.type === "table"), false);
});

test("normalizes school and branch roles without leaking revoked or other-school rows", async () => {
  const client = createClient(fixtures, { "members.view": true, "profiles.view": true });
  const directory = await fetchMembersDirectory(
    { schoolId: "school-1", currentProfileId: "p-current" },
    client
  );

  assert.equal(directory.members.length, 4);
  assert.equal(directory.members.some(member => member.profileId === "p-revoked"), false);
  assert.equal(directory.members.some(member => member.profileId === "p-other"), false);

  const current = directory.members.find(member => member.profileId === "p-current");
  assert.equal(current.isCurrent, true);
  assert.equal(current.roles.length, 3);
  assert.equal(current.roles.find(role => role.roleId === "r-admin").scopeLabel, "المدرسة كاملة");
  assert.deepEqual(
    current.roles.filter(role => role.roleId === "r-teacher").map(role => role.scopeLabel).sort(),
    ["الفرع الرئيسي", "الفرع الشرقي"].sort()
  );

  const noRole = directory.members.find(member => member.profileId === "p-none");
  assert.deepEqual(noRole.roles, []);
  assert.equal(
    directory.members.find(member => member.profileId === "p-disabled").profileStatus,
    "disabled"
  );
});

test("summarizes and filters multi-role members by name status role branch and no-role state", async () => {
  const client = createClient(fixtures, { "members.view": true, "profiles.view": true });
  const { members } = await fetchMembersDirectory(
    { schoolId: "school-1", currentProfileId: "p-current" },
    client
  );
  assert.deepEqual(summarizeMembers(members), {
    total: 4,
    active: 2,
    suspended: 1,
    pending: 1,
  });

  const base = { search: "", membershipStatus: "all", roleId: "all", branchId: "all", withoutRolesOnly: false };
  assert.deepEqual(filterMembers(members, { ...base, search: "سارة" }).map(member => member.profileId), ["p-pending"]);
  assert.deepEqual(filterMembers(members, { ...base, membershipStatus: "suspended" }).map(member => member.profileId), ["p-disabled"]);
  assert.deepEqual(filterMembers(members, { ...base, roleId: "r-teacher" }).map(member => member.profileId), ["p-current"]);
  assert.deepEqual(filterMembers(members, { ...base, branchId: "b-east" }).map(member => member.profileId), ["p-current"]);
  assert.deepEqual(filterMembers(members, { ...base, branchId: "school-wide" }).map(member => member.profileId).sort(), ["p-current", "p-disabled"].sort());
  assert.deepEqual(filterMembers(members, { ...base, withoutRolesOnly: true }).map(member => member.profileId), ["p-none"]);
});

test("uses only read operations and explicit school filters in the members data layer", async () => {
  const client = createClient(fixtures, { "members.view": true, "profiles.view": true });
  await fetchMembersDirectory(
    { schoolId: "school-1", currentProfileId: "p-current" },
    client
  );
  const tableCalls = client.calls.filter(call => call.type === "table");
  assert.deepEqual(tableCalls.map(call => call.table), [
    "school_memberships",
    "profiles",
    "membership_roles",
    "roles",
    "branches",
  ]);
  for (const call of tableCalls) {
    assert.equal(call.operations.some(operation => ["insert", "update", "upsert", "delete"].includes(operation[0])), false);
  }
  const tenantTables = tableCalls.filter(call => call.table !== "profiles");
  assert.equal(
    tenantTables.every(call => call.operations.some(operation => operation[0] === "eq" && operation[1] === "school_id" && operation[2] === "school-1")),
    true
  );
});

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, route, page, data, dashboard, appShell] = await Promise.all([
  read("client/src/App.tsx"),
  read("client/src/components/MembersRoute.tsx"),
  read("client/src/pages/Members.tsx"),
  read("client/src/lib/members.ts"),
  read("client/src/pages/Dashboard.tsx"),
  read("client/src/components/AppShell.tsx"),
]);

test("registers a lazy protected members route with a dedicated fallback", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/pages\/Members"\)\)/);
  assert.match(app, /<Route path="\/members">/);
  assert.match(app, /<MembersRoute>/);
  assert.match(app, /<MembersPageFallback \/>/);
  assert.match(app, /جارٍ تحميل دليل أعضاء المدرسة/);
  assert.match(route, /fetchMembersAccess/);
  assert.match(route, /الوصول غير مسموح/);
});

test("keeps the dashboard link conditional instead of rendering then denying it", () => {
  assert.match(dashboard, /fetchMembersAccess/);
  assert.match(dashboard, /canViewMembers/);
  assert.match(dashboard, /path: "\/members"/);
  assert.match(dashboard, /\.\.\.\(canViewMembers/);
});

test("covers all required visible states without mutation controls", () => {
  for (const text of [
    "جارٍ تحميل أعضاء المدرسة",
    "تعذر تحميل دليل الأعضاء",
    "الوصول غير مسموح",
    "لا توجد عضويات متاحة",
    "لا توجد نتائج مطابقة",
    "لا توجد أدوار مسندة",
    "المدرسة كاملة",
    "الملف معطل",
    "قيد الانتظار",
    "معلق",
    "إدارة الدعوات والأدوار ستتوفر في مرحلة مستقلة",
  ]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /dir="rtl"/);
  assert.match(page, /lg:hidden/);
  assert.match(page, /hidden overflow-hidden[\s\S]*lg:block/);
});

test("contains no forbidden data or account-management patterns", () => {
  const sources = [app, route, page, data, dashboard].join("\n");
  for (const forbidden of [
    ".delete(".split("").join(""),
    ["service", "role"].join("_"),
    ["SUPABASE", "SERVICE"].join("_"),
    ["auth", "admin"].join("."),
    ["invite", "UserByEmail"].join(""),
  ]) {
    assert.equal(sources.includes(forbidden), false);
  }
  for (const writeMethod of ["insert", "update", "upsert"]) {
    assert.equal(data.includes(`.${writeMethod}(`), false);
  }
});
