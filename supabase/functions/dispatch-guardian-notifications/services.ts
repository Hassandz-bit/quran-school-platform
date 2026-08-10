import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { sendNotification } from "npm:web-push@3.6.7";
import type {
  GuardianNotificationDependencies,
  GuardianNotificationScope,
  GuardianPushDelivery,
  GuardianPushOutcome,
  GuardianPushPayload,
} from "./handler.ts";

function getMappedEnvironmentValue(name: string): string | null {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed.default === "string" ? parsed.default : null;
  } catch {
    return null;
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_environment_${name}`);
  return value;
}

function createUserClient(url: string, publishableKey: string, token: string) {
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

type ClaimRow = {
  delivery_id: string;
  event_id: string;
  subscription_id: string;
  guardian_profile_id: string;
  student_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  event_type: GuardianPushDelivery["eventType"];
  school_name: string;
  student_name: string;
  class_name: string;
  session_date: string;
  new_status: GuardianPushDelivery["newStatus"];
  attempt_number: number;
};

function mapClaim(row: ClaimRow): GuardianPushDelivery {
  return {
    deliveryId: row.delivery_id,
    eventId: row.event_id,
    subscriptionId: row.subscription_id,
    guardianProfileId: row.guardian_profile_id,
    studentId: row.student_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    authKey: row.auth_key,
    eventType: row.event_type,
    schoolName: row.school_name,
    studentName: row.student_name,
    className: row.class_name,
    sessionDate: row.session_date,
    newStatus: row.new_status,
    attemptNumber: row.attempt_number,
  };
}

function providerStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}

function retryDelaySeconds(attemptNumber: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attemptNumber - 1));
}

export function createSupabaseGuardianNotificationDependencies(): GuardianNotificationDependencies {
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const publishableKey =
    getMappedEnvironmentValue("SUPABASE_PUBLISHABLE_KEYS") ??
    requiredEnvironment("SUPABASE_ANON_KEY");
  const secretKey =
    getMappedEnvironmentValue("SUPABASE_SECRET_KEYS") ??
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const vapidSubject = requiredEnvironment("GUARDIAN_PUSH_VAPID_SUBJECT");
  const vapidPublicKey = requiredEnvironment("GUARDIAN_PUSH_PUBLIC_VAPID_KEY");
  const vapidPrivateKey = requiredEnvironment("GUARDIAN_PUSH_PRIVATE_VAPID_KEY");

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function authorizeScope(
    request: Request,
    scope: GuardianNotificationScope
  ): Promise<boolean> {
    const token = bearerToken(request);
    if (!token) return false;

    const userClient = createUserClient(supabaseUrl, publishableKey, token);
    const { data: access, error: accessError } = await userClient.rpc(
      "can_access_attendance_class",
      {
        target_school_id: scope.schoolId,
        target_branch_id: scope.branchId,
        target_class_id: scope.classId,
        target_permission_code: "attendance.manage",
      }
    );
    if (accessError || access !== true) return false;

    const { data: session, error: sessionError } = await userClient
      .from("attendance_sessions")
      .select("id")
      .eq("id", scope.sessionId)
      .eq("school_id", scope.schoolId)
      .eq("branch_id", scope.branchId)
      .eq("class_id", scope.classId)
      .maybeSingle();

    return !sessionError && session?.id === scope.sessionId;
  }

  async function requeueStale(): Promise<void> {
    const { error } = await admin.rpc("requeue_stale_guardian_push_deliveries");
    if (error) throw error;
  }

  async function claimDeliveries(
    scope: GuardianNotificationScope,
    limit: number
  ): Promise<GuardianPushDelivery[]> {
    const { data, error } = await admin.rpc("claim_guardian_push_deliveries", {
      target_school_id: scope.schoolId,
      target_session_id: scope.sessionId,
      target_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as ClaimRow[]).map(mapClaim);
  }

  async function sendPush(
    delivery: GuardianPushDelivery,
    payload: GuardianPushPayload
  ): Promise<GuardianPushOutcome> {
    try {
      await sendNotification(
        {
          endpoint: delivery.endpoint,
          keys: {
            p256dh: delivery.p256dh,
            auth: delivery.authKey,
          },
        },
        JSON.stringify(payload),
        {
          TTL: 300,
          urgency: "high",
          timeout: 10_000,
          vapidDetails: {
            subject: vapidSubject,
            publicKey: vapidPublicKey,
            privateKey: vapidPrivateKey,
          },
        }
      );
      return { outcome: "delivered" };
    } catch (error) {
      const status = providerStatus(error);
      if (status === 404 || status === 410) {
        return {
          outcome: "invalid_subscription",
          errorCode: `push_http_${status}`,
        };
      }
      if (status === 429 || (status !== null && status >= 500 && status <= 599)) {
        return {
          outcome: "retry",
          errorCode: `push_http_${status}`,
          retryAfterSeconds: retryDelaySeconds(delivery.attemptNumber),
        };
      }
      return {
        outcome: "failed",
        errorCode: status === null ? "push_transport_error" : `push_http_${status}`,
      };
    }
  }

  async function finishDelivery(
    deliveryId: string,
    result: GuardianPushOutcome
  ): Promise<void> {
    const { data, error } = await admin.rpc("finish_guardian_push_delivery", {
      target_delivery_id: deliveryId,
      target_outcome: result.outcome,
      target_error_code: result.errorCode ?? null,
      target_retry_after_seconds: result.retryAfterSeconds ?? 60,
    });
    if (error) throw error;
    if (data !== true) throw new Error("guardian_push_delivery_not_processing");
  }

  return {
    authorizeScope,
    requeueStale,
    claimDeliveries,
    sendPush,
    finishDelivery,
  };
}
