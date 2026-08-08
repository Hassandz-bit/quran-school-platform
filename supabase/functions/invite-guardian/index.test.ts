import nodeAssert from "node:assert/strict";
import {
  createInviteGuardianHandler,
  type InviteGuardianDependencies,
} from "./handler.ts";
import { SafeGuardianInvitationError } from "./logic.ts";

const assert = (value: unknown) => nodeAssert.ok(value);
const assertEquals = (actual: unknown, expected: unknown) =>
  nodeAssert.deepStrictEqual(actual, expected);
const assertFalse = (value: unknown) => nodeAssert.equal(value, false);
const assertMatch = (value: string, pattern: RegExp) =>
  nodeAssert.match(value, pattern);

const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SCHOOL_ID = "11111111-1111-4111-8111-111111111112";
const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const GUARDIAN_ID = "33333333-3333-4333-8333-333333333333";
const RELATIONSHIP_ID = "44444444-4444-4444-8444-444444444444";
const CALLER_ID = "55555555-5555-4555-8555-555555555555";
const INVITATION_ID = "66666666-6666-4666-8666-666666666666";
const IDEMPOTENCY_KEY = "guardian-invite-request-00000001";
const ORIGIN = "https://quran-school.example";
const EMAIL = "guardian@example.test";
const TOKEN = "verified-staff-jwt";

const body = {
  schoolId: SCHOOL_ID,
  studentId: STUDENT_ID,
  email: EMAIL,
  fullName: "ولي أمر الاختبار",
  relationshipType: "father",
  isPrimary: true,
};

function request(
  payload: unknown = body,
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
    headers.set("Authorization", options.authorization ?? `Bearer ${TOKEN}`);
  }
  if (options.idempotencyKey !== null) {
    headers.set(
      "Idempotency-Key",
      options.idempotencyKey ?? IDEMPOTENCY_KEY
    );
  }
  headers.set("Content-Type", options.contentType ?? "application/json");
  return new Request(
    "https://project.supabase.co/functions/v1/invite-guardian",
    {
      method: options.method ?? "POST",
      headers,
      body:
        options.method === "GET" || options.method === "OPTIONS"
          ? undefined
          : JSON.stringify(payload),
    }
  );
}

type Calls = {
  authorization: Array<{ schoolId: string; studentId: string }>;
  accountKinds: boolean[];
  relationships: Array<Record<string, unknown>>;
  preparations: Array<Record<string, unknown>>;
  claims: string[];
  deliveries: Array<{ email: string; redirectTo: string }>;
  failures: Array<{ id: string; code: string }>;
  logs: Array<Record<string, unknown>>;
};

function dependencies(
  overrides: Partial<InviteGuardianDependencies> = {}
): { deps: InviteGuardianDependencies; calls: Calls } {
  const calls: Calls = {
    authorization: [],
    accountKinds: [],
    relationships: [],
    preparations: [],
    claims: [],
    deliveries: [],
    failures: [],
    logs: [],
  };
  const deps: InviteGuardianDependencies = {
    allowedOrigins: new Set([ORIGIN]),
    publicSiteUrl: ORIGIN,
    authenticate: async token => {
      if (token !== TOKEN) {
        throw new SafeGuardianInvitationError("not_authorized", 401);
      }
      return CALLER_ID;
    },
    authorize: async (_token, schoolId, studentId) => {
      calls.authorization.push({ schoolId, studentId });
      return schoolId === SCHOOL_ID && studentId === STUDENT_ID;
    },
    findRetry: async () => null,
    resolveAccount: async () => {
      calls.accountKinds.push(true);
      return { userId: GUARDIAN_ID, requiresPasswordSetup: true };
    },
    prepareRelationship: async (_token, input) => {
      calls.relationships.push(input);
      return RELATIONSHIP_ID;
    },
    prepareInvitation: async input => {
      calls.preparations.push(input);
      return { id: INVITATION_ID, status: "prepared" };
    },
    claimDelivery: async id => {
      calls.claims.push(id);
      return {
        id,
        status: "sent",
        email: EMAIL,
        deliveryClaimed: true,
      };
    },
    deliverAuthLink: async (email, redirectTo) => {
      calls.deliveries.push({ email, redirectTo });
    },
    markDeliveryFailed: async (id, code) => {
      calls.failures.push({ id, code });
    },
    log: event => calls.logs.push(event),
    ...overrides,
  };
  return { deps, calls };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

Deno.test("handles OPTIONS and valid CORS without running invitation logic", async () => {
  const { deps, calls } = dependencies();
  const response = await createInviteGuardianHandler(deps)(
    request(undefined, { method: "OPTIONS" })
  );
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assertEquals(calls.deliveries.length, 0);
});

Deno.test("rejects an Origin outside ALLOWED_ORIGINS", async () => {
  const { deps } = dependencies();
  const response = await createInviteGuardianHandler(deps)(
    request(undefined, { origin: "https://attacker.example" })
  );
  assertEquals(response.status, 403);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(response.headers.get("Vary"), "Origin");
});

Deno.test("rejects missing and invalid JWT values", async () => {
  for (const authorization of [null, "Bearer invalid-jwt"]) {
    const { deps, calls } = dependencies();
    const response = await createInviteGuardianHandler(deps)(
      request(undefined, { authorization })
    );
    assertEquals(response.status, 401);
    assertEquals((await json(response)).error, "not_authorized");
    assertEquals(calls.deliveries.length, 0);
  }
});

for (const deniedContext of [
  "teacher",
  "academic_supervisor",
  "finance_officer",
  "guardian",
  "school mismatch",
  "registrar branch mismatch",
]) {
  Deno.test(`denies ${deniedContext} before account lookup`, async () => {
    const { deps, calls } = dependencies({ authorize: async () => false });
    const response = await createInviteGuardianHandler(deps)(request());
    assertEquals(response.status, 403);
    assertEquals((await json(response)).error, "not_authorized");
    assertEquals(calls.accountKinds.length, 0);
    assertEquals(calls.deliveries.length, 0);
  });
}

for (const allowedStaff of ["school_admin", "registrar in scope"]) {
  Deno.test(`allows ${allowedStaff} with guardian invite and link scope`, async () => {
    const { deps, calls } = dependencies();
    const response = await createInviteGuardianHandler(deps)(request());
    assertEquals(response.status, 200);
    assertEquals((await json(response)).status, "sent");
    assertEquals(calls.deliveries.length, 1);
  });
}

Deno.test("rejects missing and malformed Idempotency-Key headers", async () => {
  for (const idempotencyKey of [null, "short", "bad key with space", "x".repeat(129)]) {
    const { deps, calls } = dependencies();
    const response = await createInviteGuardianHandler(deps)(
      request(undefined, { idempotencyKey })
    );
    assertEquals(response.status, 400);
    assertEquals((await json(response)).error, "invalid_request");
    assertEquals(calls.accountKinds.length, 0);
  }
});

Deno.test("rejects malformed payloads and browser-controlled authorization fields", async () => {
  const invalidBodies = [
    { ...body, schoolId: "not-a-uuid" },
    { ...body, email: "invalid" },
    { ...body, fullName: "x".repeat(151) },
    { ...body, relationshipType: "owner" },
    { ...body, isPrimary: "yes" },
    { ...body, guardianProfileId: GUARDIAN_ID },
    { ...body, redirectTo: "https://attacker.example" },
    { ...body, role: "guardian" },
    { ...body, permissions: ["students.view"] },
  ];
  for (const invalidBody of invalidBodies) {
    const { deps, calls } = dependencies();
    const response = await createInviteGuardianHandler(deps)(
      request(invalidBody)
    );
    assertEquals(response.status, 400);
    assertEquals(calls.deliveries.length, 0);
  }
});

Deno.test("returns an exact sent retry without account lookup or duplicate delivery", async () => {
  const { deps, calls } = dependencies({
    findRetry: async () => ({ id: INVITATION_ID, status: "sent" }),
  });
  const response = await createInviteGuardianHandler(deps)(request());
  assertEquals(response.status, 200);
  assertEquals((await json(response)).status, "sent");
  assertEquals(calls.accountKinds.length, 0);
  assertEquals(calls.claims.length, 0);
  assertEquals(calls.deliveries.length, 0);
});

Deno.test("rejects the same idempotency key with a different payload before Auth work", async () => {
  const { deps, calls } = dependencies({
    findRetry: async () => {
      throw new SafeGuardianInvitationError("idempotency_conflict", 409);
    },
  });
  const response = await createInviteGuardianHandler(deps)(request());
  assertEquals(response.status, 409);
  assertEquals((await json(response)).error, "idempotency_conflict");
  assertEquals(calls.accountKinds.length, 0);
  assertEquals(calls.deliveries.length, 0);
});

Deno.test("resumes a prepared retry but delivery claim prevents duplicate mail", async () => {
  const { deps, calls } = dependencies({
    findRetry: async () => ({ id: INVITATION_ID, status: "prepared" }),
    claimDelivery: async id => ({
      id,
      status: "sent",
      email: EMAIL,
      deliveryClaimed: false,
    }),
  });
  const response = await createInviteGuardianHandler(deps)(request());
  assertEquals(response.status, 200);
  assertEquals(calls.accountKinds.length, 0);
  assertEquals(calls.deliveries.length, 0);
});

Deno.test("new and existing Auth users receive the same outward response", async () => {
  const responses: Array<Record<string, unknown>> = [];
  for (const requiresPasswordSetup of [true, false]) {
    const { deps, calls } = dependencies({
      resolveAccount: async () => ({
        userId: GUARDIAN_ID,
        requiresPasswordSetup,
      }),
    });
    const response = await createInviteGuardianHandler(deps)(request());
    const result = await json(response);
    responses.push(result);
    assertEquals(response.status, 200);
    assertEquals(calls.deliveries.length, 1);
  }
  assertEquals(responses[0].ok, responses[1].ok);
  assertEquals(responses[0].status, responses[1].status);
  assertFalse("accountExists" in responses[0]);
  assertFalse("requiresPasswordSetup" in responses[0]);
  assertFalse("guardianProfileId" in responses[0]);
});

Deno.test("uses only the trusted PUBLIC_SITE_URL for Auth delivery", async () => {
  const { deps, calls } = dependencies();
  const response = await createInviteGuardianHandler(deps)(request());
  assertEquals(response.status, 200);
  assertEquals(calls.deliveries, [
    {
      email: EMAIL,
      redirectTo: `${ORIGIN}/accept-guardian-invite?invitation=${INVITATION_ID}`,
    },
  ]);
});

Deno.test("rejects an invalid redirect configuration before claiming delivery", async () => {
  const { deps, calls } = dependencies({
    publicSiteUrl: "https://preview.example/path?token=bad",
  });
  const response = await createInviteGuardianHandler(deps)(request());
  assertEquals(response.status, 503);
  assertEquals((await json(response)).error, "delivery_unavailable");
  assertEquals(calls.claims.length, 0);
  assertEquals(calls.deliveries.length, 0);
});

Deno.test("maps Auth Admin account resolution failure without enumeration", async () => {
  const { deps } = dependencies({
    resolveAccount: async () => {
      throw new Error("auth admin internal detail for an existing email");
    },
  });
  const response = await createInviteGuardianHandler(deps)(request());
  const text = await response.text();
  assertEquals(response.status, 500);
  assertMatch(text, /provisioning_failed/);
  assertFalse(text.includes("existing email"));
  assertFalse(text.includes(EMAIL));
});

Deno.test("maps database preparation failure without internal details", async () => {
  const { deps, calls } = dependencies({
    prepareInvitation: async () => {
      throw new Error("cross-tenant row and SQL text");
    },
  });
  const response = await createInviteGuardianHandler(deps)(request());
  const text = await response.text();
  assertEquals(response.status, 500);
  assertMatch(text, /provisioning_failed/);
  assertFalse(text.includes("cross-tenant"));
  assertEquals(calls.deliveries.length, 0);
});

Deno.test("records a generic terminal failure when Auth delivery fails", async () => {
  const { deps, calls } = dependencies({
    deliverAuthLink: async () => {
      throw new Error("smtp provider secret response");
    },
  });
  const response = await createInviteGuardianHandler(deps)(request());
  const text = await response.text();
  assertEquals(response.status, 503);
  assertMatch(text, /delivery_unavailable/);
  assertFalse(text.includes("smtp provider"));
  assertEquals(calls.failures, [
    { id: INVITATION_ID, code: "auth_delivery_failed" },
  ]);
});

Deno.test("never logs email, JWT, raw idempotency keys, tokens or service credentials", async () => {
  const { deps, calls } = dependencies();
  await createInviteGuardianHandler(deps)(request());
  const serialized = JSON.stringify(calls.logs);
  assert(serialized.includes(SCHOOL_ID));
  assert(serialized.includes(STUDENT_ID));
  assert(serialized.includes(CALLER_ID));
  for (const forbidden of [
    EMAIL,
    TOKEN,
    IDEMPOTENCY_KEY,
    "Authorization",
    "access_token",
    "refresh_token",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assertFalse(serialized.includes(forbidden));
  }
});

Deno.test("the request school cannot disclose another school's account data", async () => {
  const { deps, calls } = dependencies({
    authorize: async (_token, schoolId) => schoolId !== OTHER_SCHOOL_ID,
  });
  const response = await createInviteGuardianHandler(deps)(
    request({ ...body, schoolId: OTHER_SCHOOL_ID })
  );
  assertEquals(response.status, 403);
  assertEquals((await json(response)).error, "not_authorized");
  assertEquals(calls.accountKinds.length, 0);
});
