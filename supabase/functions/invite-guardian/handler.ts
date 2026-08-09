import {
  SafeGuardianInvitationError,
  buildGuardianInviteRedirect,
  corsHeaders,
  getBearerToken,
  hashNormalizedPayload,
  isAllowedOrigin,
  parseIdempotencyKey,
  parseInviteGuardianRequest,
  safeErrorResponse,
  safeSuccessResponse,
  sha256,
  type GuardianInvitationErrorCode,
  type InviteGuardianRequest,
} from "./logic.ts";

export type GuardianInvitationStatus =
  | "prepared"
  | "sent"
  | "accepted"
  | "failed"
  | "expired"
  | "revoked";

export type GuardianInvitationAttempt = {
  id: string;
  status: GuardianInvitationStatus;
};

export type GuardianAccount = {
  userId: string;
  requiresPasswordSetup: boolean;
  createdByThisAttempt: boolean;
};

export type GuardianDeliveryClaim = {
  id: string;
  status: GuardianInvitationStatus;
  email: string;
  deliveryClaimed: boolean;
};

export class GuardianAccountIneligibleError extends Error {
  constructor() {
    super("guardian_account_ineligible");
    this.name = "GuardianAccountIneligibleError";
  }
}

export type InviteGuardianDependencies = {
  allowedOrigins: Set<string>;
  publicSiteUrl: string;
  authenticate: (token: string) => Promise<string>;
  authorize: (
    token: string,
    schoolId: string,
    studentId: string
  ) => Promise<boolean>;
  findRetry: (input: {
    token: string;
    schoolId: string;
    studentId: string;
    idempotencyKeyHash: string;
    requestPayloadHash: string;
  }) => Promise<GuardianInvitationAttempt | null>;
  resolveAccount: (email: string, fullName: string) => Promise<GuardianAccount>;
  prepareInvitation: (input: {
    token: string;
    schoolId: string;
    studentId: string;
    guardianProfileId: string;
    email: string;
    relationshipType: InviteGuardianRequest["relationshipType"];
    isPrimary: boolean;
    idempotencyKeyHash: string;
    requestPayloadHash: string;
    requiresPasswordSetup: boolean;
  }) => Promise<GuardianInvitationAttempt>;
  claimDelivery: (invitationId: string) => Promise<GuardianDeliveryClaim>;
  deliverAuthLink: (email: string, redirectTo: string) => Promise<void>;
  markDeliveryFailed: (
    invitationId: string,
    failureCode: string
  ) => Promise<void>;
  deleteCreatedAuthUser: (userId: string) => Promise<void>;
  log: (event: Record<string, unknown>) => void;
};

const MAX_BODY_BYTES = 8192;

function asSafeError(error: unknown): SafeGuardianInvitationError {
  if (error instanceof SafeGuardianInvitationError) return error;
  return new SafeGuardianInvitationError("provisioning_failed", 500);
}

function completed(status: GuardianInvitationStatus): boolean {
  return status === "sent" || status === "accepted";
}

export function createInviteGuardianHandler(
  dependencies: InviteGuardianDependencies
): (request: Request) => Promise<Response> {
  return async request => {
    const requestId = crypto.randomUUID();
    const origin = request.headers.get("Origin");
    const startedAt = Date.now();
    let callerId: string | null = null;
    let schoolId: string | null = null;
    let studentId: string | null = null;
    let invitationId: string | null = null;
    let createdUserId: string | null = null;

    const recordOutcome = (outcome: string) => {
      dependencies.log({
        requestId,
        callerId,
        schoolId,
        studentId,
        invitationId,
        outcome,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    };

    if (!isAllowedOrigin(origin, dependencies.allowedOrigins)) {
      recordOutcome("origin_rejected");
      return safeErrorResponse("not_authorized", 403, null, requestId);
    }

    if (request.method === "OPTIONS") {
      recordOutcome("preflight");
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      recordOutcome("method_rejected");
      return safeErrorResponse("invalid_request", 405, origin, requestId);
    }

    try {
      const contentType = request.headers.get("Content-Type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        throw new SafeGuardianInvitationError("invalid_request", 415);
      }

      const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        throw new SafeGuardianInvitationError("invalid_request", 413);
      }

      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        throw new SafeGuardianInvitationError("invalid_request", 413);
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        throw new SafeGuardianInvitationError("invalid_request", 400);
      }

      const payload = parseInviteGuardianRequest(parsedBody);
      schoolId = payload.schoolId;
      studentId = payload.studentId;
      const rawIdempotencyKey = parseIdempotencyKey(
        request.headers.get("Idempotency-Key")
      );
      const [idempotencyKeyHash, requestPayloadHash] = await Promise.all([
        sha256(rawIdempotencyKey),
        hashNormalizedPayload(payload),
      ]);

      const token = getBearerToken(request.headers.get("Authorization"));
      callerId = await dependencies.authenticate(token);

      if (!await dependencies.authorize(token, schoolId, studentId)) {
        throw new SafeGuardianInvitationError("not_authorized", 403);
      }

      const retry = await dependencies.findRetry({
        token,
        schoolId,
        studentId,
        idempotencyKeyHash,
        requestPayloadHash,
      });
      if (retry) {
        invitationId = retry.id;
        if (completed(retry.status)) {
          recordOutcome("idempotent_success");
          return safeSuccessResponse(origin, requestId);
        }
        if (retry.status !== "prepared") {
          throw new SafeGuardianInvitationError("invitation_unavailable", 409);
        }
      }

      if (!invitationId) {
        const account = await dependencies.resolveAccount(
          payload.email,
          payload.fullName
        );
        createdUserId = account.createdByThisAttempt ? account.userId : null;
        let attempt: GuardianInvitationAttempt;
        try {
          attempt = await dependencies.prepareInvitation({
            token,
            schoolId,
            studentId,
            guardianProfileId: account.userId,
            email: payload.email,
            relationshipType: payload.relationshipType,
            isPrimary: payload.isPrimary,
            idempotencyKeyHash,
            requestPayloadHash,
            requiresPasswordSetup: account.requiresPasswordSetup,
          });
        } catch (error) {
          if (createdUserId) {
            try {
              await dependencies.deleteCreatedAuthUser(createdUserId);
            } catch {
              dependencies.log({
                requestId,
                callerId,
                schoolId,
                studentId,
                outcome: "compensation_failed",
              });
            }
          }
          createdUserId = null;
          throw error;
        }
        createdUserId = null;
        invitationId = attempt.id;
        if (completed(attempt.status)) {
          recordOutcome("idempotent_success");
          return safeSuccessResponse(origin, requestId);
        }
        if (attempt.status !== "prepared") {
          throw new SafeGuardianInvitationError("invitation_unavailable", 409);
        }
      }

      const redirectTo = buildGuardianInviteRedirect(
        dependencies.publicSiteUrl,
        dependencies.allowedOrigins,
        invitationId
      );
      const claim = await dependencies.claimDelivery(invitationId);
      if (!claim.deliveryClaimed) {
        if (completed(claim.status)) {
          recordOutcome("idempotent_success");
          return safeSuccessResponse(origin, requestId);
        }
        throw new SafeGuardianInvitationError("invitation_unavailable", 409);
      }

      try {
        await dependencies.deliverAuthLink(claim.email, redirectTo);
      } catch {
        try {
          await dependencies.markDeliveryFailed(
            invitationId,
            "auth_delivery_failed"
          );
        } catch {
          dependencies.log({
            requestId,
            callerId,
            schoolId,
            studentId,
            invitationId,
            outcome: "delivery_failure_record_failed",
          });
        }
        throw new SafeGuardianInvitationError("delivery_unavailable", 503);
      }

      recordOutcome("sent");
      return safeSuccessResponse(origin, requestId);
    } catch (error) {
      if (error instanceof GuardianAccountIneligibleError) {
        recordOutcome("account_ineligible");
        return safeSuccessResponse(origin, requestId);
      }
      const safeError = asSafeError(error);
      recordOutcome(safeError.code);
      return safeErrorResponse(
        safeError.code,
        safeError.status,
        origin,
        requestId
      );
    }
  };
}
