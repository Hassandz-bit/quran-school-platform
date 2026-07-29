import {
  INVITATION_PERMISSION_CODES,
  SafeInvitationError,
  buildInviteRedirect,
  corsHeaders,
  getBearerToken,
  isAllowedOrigin,
  isUuid,
  isValidProfileFullName,
  parseInviteTeacherRequest,
  safeErrorResponse,
  safeSuccessResponse,
  type InvitationErrorCode,
  type InviteTeacherRequest,
} from "./logic.ts";

export type EligibleTeacher = {
  id: string;
  schoolId: string;
  branchId: string;
  fullName: string;
  branchName: string;
  classNames: string[];
};

export type InvitationAttempt = {
  id: string;
  status: "processing" | "sent" | "accepted" | "failed";
  failureCode: string | null;
};

export type InviteTeacherDependencies = {
  allowedOrigins: Set<string>;
  publicSiteUrl: string;
  authenticate: (token: string) => Promise<string>;
  hasPermission: (
    token: string,
    schoolId: string,
    permissionCode: (typeof INVITATION_PERMISSION_CODES)[number]
  ) => Promise<boolean>;
  findAttemptByIdempotency: (
    schoolId: string,
    idempotencyKey: string
  ) => Promise<InvitationAttempt | null>;
  findEligibleTeacher: (
    request: InviteTeacherRequest
  ) => Promise<EligibleTeacher | null>;
  hasActiveInvitation: (
    schoolId: string,
    teacherId: string,
    email: string
  ) => Promise<boolean>;
  isTeacherEmailUnavailable: (
    schoolId: string,
    teacherId: string,
    email: string
  ) => Promise<boolean>;
  createProcessingAttempt: (input: {
    schoolId: string;
    branchId: string;
    teacherId: string;
    email: string;
    idempotencyKey: string;
    invitedBy: string;
  }) => Promise<string>;
  authUserExists: (email: string) => Promise<boolean>;
  inviteAuthUser: (email: string, redirectTo: string) => Promise<string>;
  provisionInvitation: (input: {
    invitationId: string;
    schoolId: string;
    teacherId: string;
    invitedUserId: string;
    email: string;
    invitedBy: string;
  }) => Promise<void>;
  markAttemptFailed: (
    invitationId: string,
    code: InvitationErrorCode
  ) => Promise<void>;
  deleteCreatedAuthUser: (userId: string) => Promise<void>;
  log: (event: Record<string, unknown>) => void;
};

const MAX_BODY_BYTES = 8192;

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function asSafeError(error: unknown): SafeInvitationError {
  if (error instanceof SafeInvitationError) return error;
  return new SafeInvitationError("provisioning_failed", 500);
}

export function createInviteTeacherHandler(
  dependencies: InviteTeacherDependencies
): (request: Request) => Promise<Response> {
  return async request => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const origin = request.headers.get("Origin");
    let callerId: string | null = null;
    let schoolId: string | null = null;
    let teacherId: string | null = null;
    let attemptId: string | null = null;
    let createdUserId: string | null = null;

    const recordOutcome = (outcome: string) => {
      dependencies.log({
        requestId,
        callerId,
        schoolId,
        teacherId,
        outcome,
        durationMs: elapsed(startedAt),
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
        throw new SafeInvitationError("invalid_request", 415);
      }

      const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        throw new SafeInvitationError("invalid_request", 413);
      }

      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        throw new SafeInvitationError("invalid_request", 413);
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        throw new SafeInvitationError("invalid_request", 400);
      }

      const payload = parseInviteTeacherRequest(parsedBody);
      schoolId = payload.schoolId;
      teacherId = payload.teacherId;

      const idempotencyKey = request.headers.get("Idempotency-Key");
      if (!isUuid(idempotencyKey)) {
        throw new SafeInvitationError("invalid_request", 400);
      }

      const token = getBearerToken(request.headers.get("Authorization"));
      callerId = await dependencies.authenticate(token);

      const permissionResults = await Promise.all(
        INVITATION_PERMISSION_CODES.map(code =>
          dependencies.hasPermission(token, payload.schoolId, code)
        )
      );
      if (permissionResults.some(value => value !== true)) {
        throw new SafeInvitationError("not_authorized", 403);
      }

      const previousAttempt = await dependencies.findAttemptByIdempotency(
        payload.schoolId,
        idempotencyKey
      );
      if (previousAttempt) {
        if (previousAttempt.status === "sent" || previousAttempt.status === "accepted") {
          recordOutcome("idempotent_success");
          return safeSuccessResponse(
            { invitationId: previousAttempt.id, status: previousAttempt.status },
            origin,
            requestId
          );
        }
        throw new SafeInvitationError("invitation_already_exists", 409);
      }

      const teacher = await dependencies.findEligibleTeacher(payload);
      if (!teacher || !isValidProfileFullName(teacher.fullName)) {
        throw new SafeInvitationError("teacher_not_eligible", 422);
      }

      const [activeInvitation, emailUnavailable] = await Promise.all([
        dependencies.hasActiveInvitation(
          payload.schoolId,
          teacher.id,
          payload.email
        ),
        dependencies.isTeacherEmailUnavailable(
          payload.schoolId,
          teacher.id,
          payload.email
        ),
      ]);
      if (activeInvitation) {
        throw new SafeInvitationError("invitation_already_exists", 409);
      }
      if (emailUnavailable) {
        throw new SafeInvitationError("email_unavailable", 409);
      }

      attemptId = await dependencies.createProcessingAttempt({
        schoolId: payload.schoolId,
        branchId: teacher.branchId,
        teacherId: teacher.id,
        email: payload.email,
        idempotencyKey,
        invitedBy: callerId,
      });

      if (await dependencies.authUserExists(payload.email)) {
        await dependencies.markAttemptFailed(attemptId, "email_unavailable");
        attemptId = null;
        throw new SafeInvitationError("email_unavailable", 409);
      }

      const redirectTo = buildInviteRedirect(
        dependencies.publicSiteUrl,
        dependencies.allowedOrigins
      );

      try {
        createdUserId = await dependencies.inviteAuthUser(payload.email, redirectTo);
      } catch {
        await dependencies.markAttemptFailed(
          attemptId,
          "email_delivery_unavailable"
        );
        attemptId = null;
        throw new SafeInvitationError("email_delivery_unavailable", 503);
      }

      try {
        await dependencies.provisionInvitation({
          invitationId: attemptId,
          schoolId: payload.schoolId,
          teacherId: teacher.id,
          invitedUserId: createdUserId,
          email: payload.email,
          invitedBy: callerId,
        });
      } catch {
        const userCreatedByThisAttempt = createdUserId;
        if (userCreatedByThisAttempt) {
          try {
            await dependencies.deleteCreatedAuthUser(userCreatedByThisAttempt);
          } catch {
            dependencies.log({
              requestId,
              callerId,
              schoolId,
              teacherId,
              outcome: "compensation_failed",
              durationMs: elapsed(startedAt),
            });
          }
        }
        await dependencies.markAttemptFailed(attemptId, "provisioning_failed");
        attemptId = null;
        createdUserId = null;
        throw new SafeInvitationError("provisioning_failed", 500);
      }

      recordOutcome("sent");
      return safeSuccessResponse(
        {
          invitationId: attemptId,
          status: "sent",
          teacher: {
            name: teacher.fullName,
            branch: teacher.branchName,
            classes: teacher.classNames,
            role: "teacher",
          },
        },
        origin,
        requestId
      );
    } catch (error) {
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
