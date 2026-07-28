export const INVITATION_PERMISSION_CODES = [
  "members.manage",
  "members.assign_roles",
  "teachers.manage",
] as const;

export const INVITATION_ERROR_CODES = [
  "not_authorized",
  "teacher_not_eligible",
  "invitation_already_exists",
  "email_unavailable",
  "email_delivery_unavailable",
  "provisioning_failed",
  "invalid_request",
] as const;

export type InvitationErrorCode = (typeof INVITATION_ERROR_CODES)[number];

export type InviteTeacherRequest = {
  schoolId: string;
  teacherId: string;
  email: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_BODY_KEYS = new Set(["schoolId", "teacherId", "email"]);
const PROFILE_FULL_NAME_MIN_LENGTH = 2;
const PROFILE_FULL_NAME_MAX_LENGTH = 150;

export class SafeInvitationError extends Error {
  constructor(
    public readonly code: InvitationErrorCode,
    public readonly status: number
  ) {
    super(code);
    this.name = "SafeInvitationError";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new SafeInvitationError("invalid_request", 400);
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    throw new SafeInvitationError("invalid_request", 400);
  }
  return normalized;
}

export function isValidProfileFullName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  return (
    length >= PROFILE_FULL_NAME_MIN_LENGTH &&
    length <= PROFILE_FULL_NAME_MAX_LENGTH
  );
}

export function parseInviteTeacherRequest(raw: unknown): InviteTeacherRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SafeInvitationError("invalid_request", 400);
  }

  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== ALLOWED_BODY_KEYS.size ||
    keys.some(key => !ALLOWED_BODY_KEYS.has(key))
  ) {
    throw new SafeInvitationError("invalid_request", 400);
  }

  if (!isUuid(record.schoolId) || !isUuid(record.teacherId)) {
    throw new SafeInvitationError("invalid_request", 400);
  }

  return {
    schoolId: record.schoolId,
    teacherId: record.teacherId,
    email: normalizeEmail(record.email),
  };
}

export function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const item of (value ?? "").split(",")) {
    const trimmed = item.trim();
    if (!trimmed || trimmed === "*") continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.origin === trimmed && !parsed.username && !parsed.password) {
        origins.add(parsed.origin);
      }
    } catch {
      // Invalid origins are ignored rather than becoming permissive.
    }
  }
  return origins;
}

export function isAllowedOrigin(
  origin: string | null,
  allowedOrigins: Set<string>
): boolean {
  return origin === null || allowedOrigins.has(origin);
}

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, idempotency-key, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function buildInviteRedirect(
  publicSiteUrl: string,
  allowedOrigins: Set<string>
): string {
  let parsed: URL;
  try {
    parsed = new URL(publicSiteUrl);
  } catch {
    throw new SafeInvitationError("email_delivery_unavailable", 503);
  }

  const localhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (
    (!localhost && parsed.protocol !== "https:") ||
    (localhost && !["http:", "https:"].includes(parsed.protocol)) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !allowedOrigins.has(parsed.origin)
  ) {
    throw new SafeInvitationError("email_delivery_unavailable", 503);
  }

  const cleanBase = new URL(parsed.origin);
  cleanBase.pathname = "/accept-invite";
  return cleanBase.toString();
}

export function getBearerToken(header: string | null): string {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new SafeInvitationError("not_authorized", 401);
  return match[1];
}

export function safeErrorResponse(
  code: InvitationErrorCode,
  status: number,
  origin: string | null,
  requestId: string
): Response {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ok: false, error: code, requestId }), {
    status,
    headers,
  });
}

export function safeSuccessResponse(
  data: Record<string, unknown>,
  origin: string | null,
  requestId: string
): Response {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ ok: true, requestId, ...data }), {
    status: 200,
    headers,
  });
}
