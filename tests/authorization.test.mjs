import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORIZATION_MESSAGES,
  loadCurrentAuthorization,
} from "../client/src/lib/authorization.ts";

const USER_ID = "user-1";
const activeProfile = {
  id: USER_ID,
  full_name: "مدير الاختبار",
  avatar_url: null,
  phone: null,
  locale: "ar",
  status: "active",
};

class Query {
  constructor(table, data, calls) {
    this.table = table;
    this.data = data;
    this.call = { table, filters: [] };
    calls.push(this.call);
  }

  select(columns) {
    this.call.columns = columns;
    return this;
  }

  eq(column, value) {
    this.call.filters.push(["eq", column, value]);
    return this;
  }

  in(column, values) {
    this.call.filters.push(["in", column, values]);
    return this;
  }

  is(column, value) {
    this.call.filters.push(["is", column, value]);
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.data ?? null, error: null });
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.data ?? [], error: null }).then(
      resolve,
      reject
    );
  }
}

function createClient(fixtures) {
  const calls = [];

  return {
    calls,
    from(table) {
      return new Query(table, fixtures[table], calls);
    },
  };
}

function membership(id, schoolId, joinedAt) {
  return {
    id,
    school_id: schoolId,
    profile_id: USER_ID,
    status: "active",
    joined_at: joinedAt,
  };
}

function school(id, status = "active") {
  return {
    id,
    name: `School ${id}`,
    slug: id,
    status,
    currency_code: "DZD",
    contact_phone: null,
    contact_email: null,
    address: null,
    website_url: null,
    logo_path: null,
  };
}

function role(id, schoolId, code = "school_admin") {
  return {
    id,
    school_id: schoolId,
    code,
    name_ar: code,
    status: "active",
  };
}

function assignment(id, membershipId, schoolId, roleId, branchId = null) {
  return {
    id,
    school_id: schoolId,
    membership_id: membershipId,
    role_id: roleId,
    branch_id: branchId,
  };
}

async function authorize(fixtures) {
  const client = createClient({ profiles: activeProfile, ...fixtures });
  const result = await loadCurrentAuthorization(client, USER_ID);
  return { client, result };
}

test("selects a later school_admin membership when the first membership is ordinary", async () => {
  const { client, result } = await authorize({
    school_memberships: [
      membership("membership-ordinary", "school-ordinary", "2024-01-01"),
      membership("membership-admin", "school-admin", "2025-01-01"),
    ],
    schools: [school("school-ordinary"), school("school-admin")],
    membership_roles: [
      assignment(
        "assignment-ordinary",
        "membership-ordinary",
        "school-ordinary",
        "role-teacher"
      ),
      assignment(
        "assignment-admin",
        "membership-admin",
        "school-admin",
        "role-admin"
      ),
    ],
    roles: [
      role("role-teacher", "school-ordinary", "teacher"),
      role("role-admin", "school-admin"),
    ],
  });

  assert.equal(result.isSchoolAdmin, true);
  assert.equal(result.membership?.id, "membership-admin");
  assert.equal(result.school?.id, "school-admin");
  assert.deepEqual(
    client.calls.map(call => call.table),
    [
      "profiles",
      "school_memberships",
      "schools",
      "membership_roles",
      "roles",
    ]
  );
});

test("selects the oldest membership when two school_admin memberships match", async () => {
  const { result } = await authorize({
    school_memberships: [
      membership("membership-new", "school-new", "2025-06-01"),
      membership("membership-old", "school-old", "2023-02-01"),
    ],
    schools: [school("school-new"), school("school-old")],
    membership_roles: [
      assignment(
        "assignment-new",
        "membership-new",
        "school-new",
        "role-new"
      ),
      assignment(
        "assignment-old",
        "membership-old",
        "school-old",
        "role-old"
      ),
    ],
    roles: [
      role("role-new", "school-new"),
      role("role-old", "school-old"),
    ],
  });

  assert.equal(result.isSchoolAdmin, true);
  assert.equal(result.membership?.id, "membership-old");
});

test("rejects a school_admin membership whose school is inactive", async () => {
  const { result } = await authorize({
    school_memberships: [
      membership("membership-admin", "school-inactive", "2024-01-01"),
    ],
    schools: [school("school-inactive", "inactive")],
    membership_roles: [
      assignment(
        "assignment-admin",
        "membership-admin",
        "school-inactive",
        "role-admin"
      ),
    ],
    roles: [role("role-admin", "school-inactive")],
  });

  assert.equal(result.isSchoolAdmin, false);
  assert.equal(result.membership, null);
  assert.equal(result.authorizationError, AUTHORIZATION_MESSAGES.inactiveSchool);
});

test("rejects a branch-scoped school_admin role", async () => {
  const { result } = await authorize({
    school_memberships: [
      membership("membership-admin", "school-active", "2024-01-01"),
    ],
    schools: [school("school-active")],
    membership_roles: [
      assignment(
        "assignment-branch-admin",
        "membership-admin",
        "school-active",
        "role-admin",
        "branch-1"
      ),
    ],
    roles: [role("role-admin", "school-active")],
  });

  assert.equal(result.isSchoolAdmin, false);
  assert.equal(result.membership, null);
  assert.equal(
    result.authorizationError,
    AUTHORIZATION_MESSAGES.missingSchoolAdmin
  );
});

test("loads a branch-scoped finance officer without granting school admin", async () => {
  const { result } = await authorize({
    school_memberships: [
      membership("membership-finance", "school-active", "2024-01-01"),
    ],
    schools: [school("school-active")],
    membership_roles: [
      assignment(
        "assignment-finance",
        "membership-finance",
        "school-active",
        "role-finance",
        "branch-1"
      ),
    ],
    roles: [role("role-finance", "school-active", "finance_officer")],
  });

  assert.equal(result.authorizationError, null);
  assert.equal(result.membership?.id, "membership-finance");
  assert.equal(result.school?.id, "school-active");
  assert.deepEqual(result.activeRoleCodes, ["finance_officer"]);
  assert.equal(result.isSchoolAdmin, false);
});
