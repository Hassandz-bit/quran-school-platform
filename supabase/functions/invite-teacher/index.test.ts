import {
  assert,
  assertEquals,
  assertFalse,
  assertMatch,
} from "jsr:@std/assert@1.0.14";
import {
  createInviteTeacherHandler,
  type InviteTeacherDependencies,
} from "./handler.ts";
import { SafeInvitationError } from "./logic.ts";

const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SCHOOL_ID = "11111111-1111-4111-8111-111111111112";
const TEACHER_ID = "22222222-2222-4222-8222-222222222222";
const BRANCH_ID = "33333333-3333-4333-8333-333333333333";
const CALLER_ID = "44444444-4444-4444-8444-444444444444";
const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
const CREATED_USER_ID = "66666666-6666-4666-8666-666666666666";
const IDEMPOTENCY_KEY = "77777777-7777-4777-8777-777777777777";
const ORIGIN = "https://quran-school.example";
const EMAIL = "teacher@example.test";

function request(
  body: unknown = { schoolId: SCHOOL_ID, teacherId: TEACHER_ID, email: EMAIL },
  options: {
    method?: string;
    origin?: string | null;
    authorization?: string | null;
    idempotencyKey?: string | null;
    contentType?: string;
  } = {}
): Request {
  const headers = new Headers();
  if (options.origin !== null) headers.set("Origin", options.origin ?? ORIGIN);
  if (options.authorization !== null) {
    headers.set("Authorization", options.authorization ?? "Bearer verified-jwt");
  }
  if (options.idempotencyKey !== null) {
    headers.set("Idempotency-Key", options.idempotencyKey ?? IDEMPOTENCY_KEY);
  }
  headers.set("Content-Type", options.contentType ?? "application/json");
  return new Request("https://project.supabase.co/functions/v1/invite-teacher", {
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" || options.method === "OPTIONS"
      ? undefined
      : JSON.stringify(body),
  });
}

type CallState = {
  permissions: string[];
  provisions: Array<Record<string, unknown>>;
  deleted: string[];
  failed: Array<{ id: string; code: string }>;
  logs: Array<Record<string, unknown>>;
  invites: Array<{ email: string; redirectTo: string }>;
};

function dependencies(
  overrides: Partial<InviteTeacherDependencies> = {}
): { deps: InviteTeacherDependencies; calls: CallState } {
  const calls: CallState = {
    permissions: [],
    provisions: [],
    deleted: [],
    failed: [],
    logs: [],
    invites: [],
  };
  const deps: InviteTeacherDependencies = {
    allowedOrigins: new Set([ORIGIN]),
    publicSiteUrl: ORIGIN,
    authenticate: async () => CALLER_ID,
    hasPermission: async (_token, _school, code) => {
      calls.permissions.push(code);
      return true;
    },
    findAttemptByIdempotency: async () => null,
    findEligibleTeacher: async () => ({
      id: TEACHER_ID,
      schoolId: SCHOOL_ID,
      branchId: BRANCH_ID,
      fullName: "معلم الاختبار",
      branchName: "الفرع الرئيسي",
      classNames: ["حلقة الاختبار"],
    }),
    hasActiveInvitation: async () => false,
    isTeacherEmailUnavailable: async () => false,
    createProcessingAttempt: async () => ATTEMPT_ID,
    authUserExists: async () => false,
    inviteAuthUser: async (email, redirectTo) => {
      calls.invites.push({ email, redirectTo });
      return CREATED_USER_ID;
    },
    provisionInvitation: async input => {
      calls.provisions.push(input);
    },
    markAttemptFailed: async (id, code) => {
      calls.failed.push({ id, code });
    },
    deleteCreatedAuthUser: async id => {
      calls.deleted.push(id);
    },
    log: event => calls.logs.push(event),
    ...overrides,
  };
  return { deps, calls };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

Deno.test("rejects a request without a JWT", async () => {
  const { deps } = dependencies();
  const response = await createInviteTeacherHandler(deps)(
    request(undefined, { authorization: null })
  );
  assertEquals(response.status, 401);
  assertEquals((await json(response)).error, "not_authorized");
});

Deno.test("rejects methods other than POST and handles OPTIONS without invitation logic", async () => {
  const { deps, calls } = dependencies();
  const getResponse = await createInviteTeacherHandler(deps)(
    request(undefined, { method: "GET" })
  );
  assertEquals(getResponse.status, 405);

  const optionsResponse = await createInviteTeacherHandler(deps)(
    request(undefined, { method: "OPTIONS" })
  );
  assertEquals(optionsResponse.status, 204);
  assertEquals(calls.invites.length, 0);
});

Deno.test("rejects an origin outside the configured allowlist", async () => {
  const { deps } = dependencies();
  const response = await createInviteTeacherHandler(deps)(
    request(undefined, { origin: "https://attacker.example" })
  );
  assertEquals(response.status, 403);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(response.headers.get("Vary"), "Origin");
});

Deno.test("rejects malformed bodies and administrative fields", async () => {
  const forbiddenBodies = [
    { schoolId: SCHOOL_ID, teacherId: TEACHER_ID },
    { schoolId: "not-a-uuid", teacherId: TEACHER_ID, email: EMAIL },
    { schoolId: SCHOOL_ID, teacherId: TEACHER_ID, email: "bad" },
    { schoolId: SCHOOL_ID, teacherId: TEACHER_ID, email: EMAIL, role: "teacher" },
    { schoolId: SCHOOL_ID, teacherId: TEACHER_ID, email: EMAIL, branchId: BRANCH_ID },
    { schoolId: SCHOOL_ID, teacherId: TEACHER_ID, email: EMAIL, redirectTo: ORIGIN },
    { schoolId: SCHOOL_ID, teacherId: TEACHER_ID, email: EMAIL, permissions: [] },
  ];
  for (const body of forbiddenBodies) {
    const { deps } = dependencies();
    const response = await createInviteTeacherHandler(deps)(request(body));
    assertEquals(response.status, 400);
    assertEquals((await json(response)).error, "invalid_request");
  }
});

for (const missingPermission of [
  "members.manage",
  "members.assign_roles",
  "teachers.manage",
]) {
  Deno.test(`rejects when ${missingPermission} is missing`, async () => {
    const { deps, calls } = dependencies({
      hasPermission: async (_token, _school, code) => {
        calls.permissions.push(code);
        return code !== missingPermission;
      },
    });
    const response = await createInviteTeacherHandler(deps)(request());
    assertEquals(response.status, 403);
    assertEquals((await json(response)).error, "not_authorized");
    assertEquals(calls.invites.length, 0);
  });
}

for (const condition of [
  "teacher from another school",
  "inactive teacher",
  "already linked teacher",
]) {
  Deno.test(`rejects ${condition}`, async () => {
    const { deps, calls } = dependencies({
      findEligibleTeacher: async () => null,
    });
    const response = await createInviteTeacherHandler(deps)(request());
    assertEquals(response.status, 422);
    assertEquals((await json(response)).error, "teacher_not_eligible");
    assertEquals(calls.invites.length, 0);
  });
}

Deno.test("rejects active duplicate invitations", async () => {
  const { deps } = dependencies({ hasActiveInvitation: async () => true });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 409);
  assertEquals((await json(response)).error, "invitation_already_exists");
});

Deno.test("does not let another school's invitation block the same email", async () => {
  const { deps, calls } = dependencies({
    hasActiveInvitation: async (schoolId, _teacherId, email) =>
      schoolId === OTHER_SCHOOL_ID && email === EMAIL,
  });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 200);
  assertEquals(calls.invites.length, 1);
});

Deno.test("rejects an invalid profile full name before sending email", async () => {
  const { deps, calls } = dependencies({
    findEligibleTeacher: async () => ({
      id: TEACHER_ID,
      schoolId: SCHOOL_ID,
      branchId: BRANCH_ID,
      fullName: "أ".repeat(151),
      branchName: "الفرع الرئيسي",
      classNames: [],
    }),
  });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 422);
  assertEquals((await json(response)).error, "teacher_not_eligible");
  assertEquals(calls.invites.length, 0);
  assertEquals(calls.provisions.length, 0);
});

Deno.test("returns a prior sent attempt for the same idempotency key", async () => {
  const { deps, calls } = dependencies({
    findAttemptByIdempotency: async () => ({
      id: ATTEMPT_ID,
      status: "sent",
      failureCode: null,
    }),
  });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 200);
  assertEquals((await json(response)).invitationId, ATTEMPT_ID);
  assertEquals(calls.invites.length, 0);
});

Deno.test("success uses only server-derived caller, teacher branch and fixed role", async () => {
  const { deps, calls } = dependencies();
  const response = await createInviteTeacherHandler(deps)(
    request({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_ID,
      email: `  ${EMAIL.toUpperCase()}  `,
    })
  );
  const body = await json(response);
  assertEquals(response.status, 200);
  assertEquals(body.status, "sent");
  assertEquals(calls.invites, [
    { email: EMAIL, redirectTo: `${ORIGIN}/accept-invite` },
  ]);
  assertEquals(calls.provisions, [
    {
      invitationId: ATTEMPT_ID,
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_ID,
      invitedUserId: CREATED_USER_ID,
      email: EMAIL,
      invitedBy: CALLER_ID,
    },
  ]);
  const teacher = body.teacher as Record<string, unknown>;
  assertEquals(teacher.role, "teacher");
  assertEquals(teacher.branch, "الفرع الرئيسي");
});

Deno.test("compensates only the Auth user created by this attempt when provisioning fails", async () => {
  const { deps, calls } = dependencies({
    provisionInvitation: async () => {
      throw new Error("internal database detail");
    },
  });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 500);
  assertEquals((await json(response)).error, "provisioning_failed");
  assertEquals(calls.deleted, [CREATED_USER_ID]);
  assertEquals(calls.failed, [
    { id: ATTEMPT_ID, code: "provisioning_failed" },
  ]);
});

Deno.test("does not delete an Auth user that existed before the request", async () => {
  const { deps, calls } = dependencies({ authUserExists: async () => true });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 409);
  assertEquals((await json(response)).error, "email_unavailable");
  assertEquals(calls.deleted, []);
  assertEquals(calls.invites, []);
});

Deno.test("maps email delivery failure without exposing provider details", async () => {
  const { deps, calls } = dependencies({
    inviteAuthUser: async () => {
      throw new Error("smtp internal response");
    },
  });
  const response = await createInviteTeacherHandler(deps)(request());
  const bodyText = await response.text();
  assertEquals(response.status, 503);
  assertMatch(bodyText, /email_delivery_unavailable/);
  assertFalse(bodyText.includes("smtp internal response"));
  assertEquals(calls.deleted, []);
});

Deno.test("logs only safe identifiers and general outcomes", async () => {
  const { deps, calls } = dependencies();
  await createInviteTeacherHandler(deps)(request());
  const serialized = JSON.stringify(calls.logs);
  assert(serialized.includes(SCHOOL_ID));
  assert(serialized.includes(TEACHER_ID));
  assert(serialized.includes(CALLER_ID));
  assertFalse(serialized.includes("verified-jwt"));
  assertFalse(serialized.includes(EMAIL));
  assertFalse(serialized.includes("Authorization"));
  assertFalse(serialized.includes("access_token"));
});

Deno.test("rejects invalid production redirect configuration before sending", async () => {
  const { deps, calls } = dependencies({
    publicSiteUrl: "https://preview.example/path?token=bad",
  });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 503);
  assertEquals((await json(response)).error, "email_delivery_unavailable");
  assertEquals(calls.invites.length, 0);
});

Deno.test("does not expose arbitrary exception messages", async () => {
  const { deps } = dependencies({
    authenticate: async () => {
      throw new Error("stack trace and secret value");
    },
  });
  const response = await createInviteTeacherHandler(deps)(request());
  const text = await response.text();
  assertFalse(text.includes("stack trace"));
  assertFalse(text.includes("secret value"));
  assertEquals(JSON.parse(text).error, "provisioning_failed");
});

Deno.test("preserves explicit safe authorization errors", async () => {
  const { deps } = dependencies({
    authenticate: async () => {
      throw new SafeInvitationError("not_authorized", 401);
    },
  });
  const response = await createInviteTeacherHandler(deps)(request());
  assertEquals(response.status, 401);
  assertEquals((await json(response)).error, "not_authorized");
});
