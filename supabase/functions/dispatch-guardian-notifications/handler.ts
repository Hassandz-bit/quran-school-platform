export type GuardianNotificationScope = {
  schoolId: string;
  branchId: string;
  classId: string;
  sessionId: string;
};

export type GuardianPushDelivery = {
  deliveryId: string;
  eventId: string;
  subscriptionId: string;
  guardianProfileId: string;
  studentId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
  eventType: "absence_confirmed" | "absence_corrected";
  schoolName: string;
  studentName: string;
  className: string;
  sessionDate: string;
  newStatus: "present" | "absent" | "late" | "excused_absence";
  attemptNumber: number;
};

export type GuardianPushPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

export type GuardianPushOutcome = {
  outcome: "delivered" | "retry" | "invalid_subscription" | "failed";
  errorCode?: string;
  retryAfterSeconds?: number;
};

export type GuardianNotificationDependencies = {
  authorizeScope: (
    request: Request,
    scope: GuardianNotificationScope
  ) => Promise<boolean>;
  authorizeCron: (request: Request) => Promise<boolean>;
  requeueStale: () => Promise<void>;
  claimDeliveries: (
    scope: GuardianNotificationScope,
    limit: number
  ) => Promise<GuardianPushDelivery[]>;
  claimDueDeliveries: (limit: number) => Promise<GuardianPushDelivery[]>;
  sendPush: (
    delivery: GuardianPushDelivery,
    payload: GuardianPushPayload
  ) => Promise<GuardianPushOutcome>;
  finishDelivery: (
    deliveryId: string,
    result: GuardianPushOutcome
  ) => Promise<void>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isJsonRequest(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  return type === "application/json";
}

function parseScope(value: unknown): GuardianNotificationScope | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const scope = {
    schoolId: candidate.schoolId,
    branchId: candidate.branchId,
    classId: candidate.classId,
    sessionId: candidate.sessionId,
  };

  if (
    typeof scope.schoolId !== "string" ||
    typeof scope.branchId !== "string" ||
    typeof scope.classId !== "string" ||
    typeof scope.sessionId !== "string" ||
    !UUID_RE.test(scope.schoolId) ||
    !UUID_RE.test(scope.branchId) ||
    !UUID_RE.test(scope.classId) ||
    !UUID_RE.test(scope.sessionId)
  ) {
    return null;
  }
  return scope as GuardianNotificationScope;
}

function isRetrySweep(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).mode === "retry_sweep"
  );
}

function bounded(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

export function buildGuardianPushPayload(
  delivery: GuardianPushDelivery
): GuardianPushPayload {
  const student = bounded(delivery.studentName, 100);
  const className = bounded(delivery.className, 100);
  const school = bounded(delivery.schoolName, 100);
  const date = delivery.sessionDate;

  if (delivery.eventType === "absence_confirmed") {
    return {
      title: bounded(`تنبيه حضور — ${school}`, 120),
      body: bounded(
        `لم يُسجَّل حضور ${student} في ${className} بتاريخ ${date}. يرجى التأكد من سلامته.`,
        240
      ),
      tag: `attendance-${delivery.eventId}`,
      url: `/parent/students/${delivery.studentId}`,
    };
  }

  const correction =
    delivery.newStatus === "late"
      ? `تم تسجيل حضور ${student} متأخرًا في ${className} بتاريخ ${date}.`
      : delivery.newStatus === "present"
        ? `تم تصحيح الحضور: سُجّل ${student} حاضرًا في ${className} بتاريخ ${date}.`
        : `تم تحديث حالة ${student} إلى غياب بعذر في ${className} بتاريخ ${date}.`;

  return {
    title: bounded(`تحديث الحضور — ${school}`, 120),
    body: bounded(correction, 240),
    tag: `attendance-${delivery.eventId}`,
    url: `/parent/students/${delivery.studentId}`,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function dispatchClaimed(
  dependencies: GuardianNotificationDependencies,
  deliveries: GuardianPushDelivery[]
): Promise<Response> {
  let delivered = 0;
  let retried = 0;
  let invalid = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const result = await dependencies.sendPush(
      delivery,
      buildGuardianPushPayload(delivery)
    );
    await dependencies.finishDelivery(delivery.deliveryId, result);

    if (result.outcome === "delivered") delivered += 1;
    else if (result.outcome === "retry") retried += 1;
    else if (result.outcome === "invalid_subscription") invalid += 1;
    else failed += 1;
  }

  return jsonResponse(
    { ok: true, claimed: deliveries.length, delivered, retried, invalid, failed },
    200
  );
}

export function createGuardianNotificationHandler(
  dependencies: GuardianNotificationDependencies
): (request: Request) => Promise<Response> {
  return async request => {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }
    if (!isJsonRequest(request)) {
      return jsonResponse({ error: "invalid_content_type" }, 415);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    try {
      if (isRetrySweep(body)) {
        if (!(await dependencies.authorizeCron(request))) {
          return jsonResponse({ error: "not_authorized" }, 403);
        }
        await dependencies.requeueStale();
        return await dispatchClaimed(
          dependencies,
          await dependencies.claimDueDeliveries(50)
        );
      }

      const scope = parseScope(body);
      if (!scope) return jsonResponse({ error: "invalid_scope" }, 400);
      if (!(await dependencies.authorizeScope(request, scope))) {
        return jsonResponse({ error: "not_authorized" }, 403);
      }

      return await dispatchClaimed(
        dependencies,
        await dependencies.claimDeliveries(scope, 25)
      );
    } catch {
      // Never expose endpoints, subscription keys, database details, secrets,
      // or provider errors to either attendance clients or Cron callers.
      return jsonResponse({ error: "notification_dispatch_failed" }, 500);
    }
  };
}
