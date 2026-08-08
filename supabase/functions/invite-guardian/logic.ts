export const GUARDIAN_RELATIONSHIP_TYPES = [
  "father",
  "mother",
  "legal_guardian",
  "relative",
  "other",
] as const;

export const GUARDIAN_INVITATION_ERROR_CODES = [
  "not_authorized",
  "invalid_request",
  "idempotency_conflict",
  "invitation_unavailable",
  "delivery_unavailable",
  "provisioning_failed",
] as const;

export type GuardianRelationshipType =
  (typeof GUARDIAN_RELATIONSHIP_TYPES)[number];
export type GuardianInvitationErrorCode =
  (typeof GUARDIAN_INVITATION_ERROR_CODES)[number];

export type InviteGuardianRequest = {
  schoolId: string;
  studentId: string;
  email: string;
  fullName: string;
  relationshipType: GuardianRelationshipType;
  isPrimary: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ALLOWED_BODY_KEYS = new Set([
  "schoolId",
  "studentId",
  "email",
  "fullName",
  "relationshipType",
  "isPrimary",
]);

export class SafeGuardianInvitationError extends Error {
  constructor(
    public readonly code: GuardianInvitationErrorCode,
    public readonly status: number
  ) {
    super(code);
    this.name = "SafeGuardianInvitationError";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

export function parseIdempotencyKey(value: string | null): string {
  if (!value || value !== value.trim() || !IDEMPOTENCY_PATTERN.test(value)) {
    throw new SafeGuardianInvitationError("invalid_request", 400);
  }
  return value;
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new SafeGuardianInvitationError("invalid_request", 400);
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    throw new SafeGuardianInvitationError("invalid_request", 400);
  }
  return normalized;
}

export function normalizeFullName(value: unknown): string {
  if (typeof value !== "string") {
    throw new SafeGuardianInvitationError("invalid_request", 400);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  const length = Array.from(normalized).length;
  if (length < 2 || length > 150) {
    throw new SafeGuardianInvitationError("invalid_request", 400);
  }
  return normalized;
}

export function parseInviteGuardianRequest(raw: unknown): InviteGuardianRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SafeGuardianInvitationError("invalid_request", 400);
  }

  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== ALLOWED_BODY_KEYS.size ||
    keys.some(key => !ALLOWED_BODY_KEYS.has(key)) ||
    !isUuid(record.schoolId) ||
    !isUuid(record.studentId) ||
    typeof record.isPrimary !== "boolean" ||
    typeof record.relationshipType !== "string" ||
    !GUARDIAN_RELATIONSHIP_TYPES.includes(
      record.relationshipType as GuardianRelationshipType
    )
  ) {
    throw new SafeGuardianInvitationError("invalid_request", 400);
  }

  return {
    schoolId: record.schoolId,
    studentId: record.studentId,
    email: normalizeEmail(record.email),
    fullName: normalizeFullName(record.fullName),
    relationshipType: record.relationshipType as GuardianRelationshipType,
    isPrimary: record.isPrimary,
  };
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashNormalizedPayload(
  payload: InviteGuardianRequest
): Promise<string> {
  return await sha256(JSON.stringify([
    payload.schoolId,
    payload.studentId,
    payload.email,
    payload.fullName,
    payload.relationshipType,
    payload.isPrimary,
  ]));
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
      // Invalid entries remain denied.
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

export function buildGuardianInviteRedirect(
  publicSiteUrl: string,
  allowedOrigins: Set<string>,
  invitationId: string
): string {
  if (!isUuid(invitationId)) {
    throw new SafeGuardianInvitationError("provisioning_failed", 500);
  }

  let parsed: URL;
  try {
    parsed = new URL(publicSiteUrl);
  } catch {
    throw new SafeGuardianInvitationError("delivery_unavailable", 503);
  }

  const localhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (
    (!localhost && parsed.protocol !== "https:") ||
    (localhost && !["http:", "https:"].includes(parsed.protocol)) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !allowedOrigins.has(parsed.origin)
  ) {
    throw new SafeGuardianInvitationError("delivery_unavailable", 503);
  }

  const redirect = new URL("/accept-guardian-invite", parsed.origin);
  redirect.searchParams.set("invitation", invitationId);
  return redirect.toString();
}

export function getBearerToken(header: string | null): string {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    throw new SafeGuardianInvitationError("not_authorized", 401);
  }
  return match[1];
}

export function safeErrorResponse(
  code: GuardianInvitationErrorCode,
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
  origin: string | null,
  requestId: string
): Response {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(
    JSON.stringify({ ok: true, status: "sent", requestId }),
    { status: 200, headers }
  );
}
