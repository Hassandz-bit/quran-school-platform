import {
  buildGuardianPushPayload,
  createGuardianNotificationHandler,
  type GuardianNotificationDependencies,
  type GuardianPushDelivery,
  type GuardianPushOutcome,
} from "./handler.ts";

const scope = {
  schoolId: "10000000-0000-4000-8000-000000000001",
  branchId: "20000000-0000-4000-8000-000000000001",
  classId: "30000000-0000-4000-8000-000000000001",
  sessionId: "90000000-0000-4000-8000-000000000001",
};

const absenceDelivery: GuardianPushDelivery = {
  deliveryId: "a1000000-0000-4000-8000-000000000001",
  eventId: "a2000000-0000-4000-8000-000000000001",
  subscriptionId: "a3000000-0000-4000-8000-000000000001",
  guardianProfileId: "60000000-0000-4000-8000-000000000006",
  studentId: "50000000-0000-4000-8000-000000000001",
  endpoint: "https://push.example.test/device",
  p256dh: "A".repeat(64),
  authKey: "B".repeat(24),
  eventType: "absence_confirmed",
  schoolName: "مدرسة القرآن",
  studentName: "أحمد محمد",
  className: "حلقة الفجر",
  sessionDate: "2026-08-10",
  newStatus: "absent",
  attemptNumber: 1,
};

function request(body: unknown = scope): Request {
  return new Request("https://example.test/functions/v1/dispatch-guardian-notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
    },
    body: JSON.stringify(body),
  });
}

function dependencies(
  overrides: Partial<GuardianNotificationDependencies> = {}
): GuardianNotificationDependencies {
  return {
    authorizeScope: async () => true,
    authorizeCron: async () => false,
    requeueStale: async () => {},
    claimDeliveries: async () => [absenceDelivery],
    claimDueDeliveries: async () => [],
    sendPush: async () => ({ outcome: "delivered" }),
    finishDelivery: async () => {},
    ...overrides,
  };
}

Deno.test("browser CORS preflight bypasses auth and delivery work", async () => {
  let authorized = false;
  let claimed = false;
  const handler = createGuardianNotificationHandler(dependencies({
    authorizeScope: async () => {
      authorized = true;
      return true;
    },
    claimDeliveries: async () => {
      claimed = true;
      return [];
    },
  }));
  const response = await handler(new Request(
    "https://example.test/functions/v1/dispatch-guardian-notifications",
    {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, apikey, content-type, x-client-info",
      },
    },
  ));
  if (response.status !== 204) throw new Error("CORS preflight should succeed");
  if (response.headers.get("access-control-allow-origin") !== "*") {
    throw new Error("CORS preflight did not allow browser origin");
  }
  const allowedHeaders = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
  for (const header of ["authorization", "apikey", "content-type", "x-client-info"]) {
    if (!allowedHeaders.includes(header)) throw new Error(`CORS preflight is missing ${header}`);
  }
  if (authorized || claimed) throw new Error("CORS preflight reached protected dispatch work");
});

Deno.test("rejects requests outside the scoped authenticated dispatch contract", async () => {
  const handler = createGuardianNotificationHandler(dependencies());
  const methodResponse = await handler(new Request("https://example.test", { method: "GET" }));
  if (methodResponse.status !== 405) throw new Error("GET should be rejected");

  const invalidResponse = await handler(request({ ...scope, sessionId: "bad" }));
  if (invalidResponse.status !== 400) throw new Error("invalid scope should fail");

  let claimed = false;
  let requeued = false;
  const deniedHandler = createGuardianNotificationHandler(
    dependencies({
      authorizeScope: async () => false,
      requeueStale: async () => {
        requeued = true;
      },
      claimDeliveries: async () => {
        claimed = true;
        return [];
      },
    })
  );
  const deniedResponse = await deniedHandler(request());
  if (deniedResponse.status !== 403) throw new Error("unauthorized scope should fail");
  if (claimed) throw new Error("unauthorized request reached service claim");
  if (requeued) throw new Error("unauthorized request touched outbox maintenance");
});

Deno.test("cron retry sweep requires its independent server secret path", async () => {
  let globalClaimed = false;
  let requeued = false;
  const denied = createGuardianNotificationHandler(
    dependencies({
      authorizeCron: async () => false,
      requeueStale: async () => {
        requeued = true;
      },
      claimDueDeliveries: async () => {
        globalClaimed = true;
        return [];
      },
    })
  );
  const deniedResponse = await denied(request({ mode: "retry_sweep" }));
  if (deniedResponse.status !== 403) throw new Error("cron without secret should fail");
  if (globalClaimed) throw new Error("unauthorized cron reached global claim");
  if (requeued) throw new Error("unauthorized cron touched outbox maintenance");

  const allowed = createGuardianNotificationHandler(
    dependencies({
      authorizeCron: async () => true,
      requeueStale: async () => {
        requeued = true;
      },
      claimDueDeliveries: async limit => {
        if (limit !== 50) throw new Error("cron claim limit mismatch");
        globalClaimed = true;
        return [absenceDelivery];
      },
    })
  );
  const allowedResponse = await allowed(request({ mode: "retry_sweep" }));
  if (allowedResponse.status !== 200 || !globalClaimed || !requeued) {
    throw new Error("authorized cron did not maintain and dispatch due work");
  }
});

Deno.test("builds bounded parent-only absence and correction payloads", () => {
  const absence = buildGuardianPushPayload(absenceDelivery);
  if (!absence.body.includes("لم يُسجَّل حضور أحمد محمد")) {
    throw new Error("absence copy is missing safe attendance wording");
  }
  if (absence.url !== "/parent/students/50000000-0000-4000-8000-000000000001") {
    throw new Error("absence notification route escaped the parent portal");
  }
  if (absence.title.length > 120 || absence.body.length > 240) {
    throw new Error("absence payload is not bounded");
  }

  const correction = buildGuardianPushPayload({
    ...absenceDelivery,
    eventId: "a2000000-0000-4000-8000-000000000002",
    eventType: "absence_corrected",
    newStatus: "late",
  });
  if (!correction.body.includes("متأخرًا")) throw new Error("late correction copy is missing");
});

Deno.test("dispatches claimed work and persists each provider outcome", async () => {
  const correctionDelivery: GuardianPushDelivery = {
    ...absenceDelivery,
    deliveryId: "a1000000-0000-4000-8000-000000000002",
    eventId: "a2000000-0000-4000-8000-000000000002",
    eventType: "absence_corrected",
    newStatus: "present",
  };
  const finished: Array<{ id: string; result: GuardianPushOutcome }> = [];
  let sendCount = 0;

  const handler = createGuardianNotificationHandler(
    dependencies({
      claimDeliveries: async (receivedScope, limit) => {
        if (receivedScope.sessionId !== scope.sessionId || limit !== 25) {
          throw new Error("claim scope mismatch");
        }
        return [absenceDelivery, correctionDelivery];
      },
      sendPush: async () => {
        sendCount += 1;
        return sendCount === 1
          ? { outcome: "delivered" }
          : { outcome: "retry", errorCode: "push_http_503", retryAfterSeconds: 120 };
      },
      finishDelivery: async (id, result) => {
        finished.push({ id, result });
      },
    })
  );

  const response = await handler(request());
  if (response.status !== 200) throw new Error("dispatch should succeed");
  const body = await response.json() as Record<string, number | boolean>;
  if (body.claimed !== 2 || body.delivered !== 1 || body.retried !== 1) {
    throw new Error("dispatch summary is incorrect");
  }
  if (finished.length !== 2 || finished[1]?.result.outcome !== "retry") {
    throw new Error("provider outcomes were not persisted");
  }
});

Deno.test("returns a generic failure without leaking provider or subscription data", async () => {
  const handler = createGuardianNotificationHandler(
    dependencies({
      claimDeliveries: async () => {
        throw new Error("https://push.secret.example/device auth=secret");
      },
    })
  );
  const response = await handler(request());
  if (response.status !== 500) throw new Error("internal failure should be generic");
  const text = await response.text();
  if (text.includes("push.secret") || text.includes("auth=secret")) {
    throw new Error("sensitive worker details leaked to the client");
  }
});
