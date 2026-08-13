import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export type GuardianRelationshipType =
  | "father"
  | "mother"
  | "legal_guardian"
  | "relative"
  | "other";

export type GuardianManagementAccess = {
  canView: boolean;
  canInvite: boolean;
  canViewContacts: boolean;
  canRevoke: boolean;
};

export type GuardianDirectoryRow = {
  relationshipId: string;
  studentId: string;
  studentName: string;
  branchId: string;
  branchName: string;
  className: string | null;
  guardianProfileId: string;
  guardianName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  relationshipType: GuardianRelationshipType;
  isPrimary: boolean;
  relationshipStatus: "pending" | "active" | "revoked";
  invitationStatus:
    | "prepared"
    | "sent"
    | "accepted"
    | "failed"
    | "expired"
    | "revoked"
    | null;
  createdAt: string;
  activatedAt: string | null;
};

export type GuardianInviteStudent = {
  studentId: string;
  studentName: string;
  branchId: string;
  branchName: string;
  className: string | null;
};

export type InviteGuardianInput = {
  schoolId: string;
  studentId: string;
  email: string;
  fullName: string;
  relationshipType: GuardianRelationshipType;
  isPrimary: boolean;
};

export type GuardianInviteErrorCode =
  | "not_authorized"
  | "invalid_request"
  | "idempotency_conflict"
  | "invitation_unavailable"
  | "delivery_unavailable"
  | "provisioning_failed";

export class GuardianInviteError extends Error {
  constructor(public readonly code: GuardianInviteErrorCode) {
    super(code);
    this.name = "GuardianInviteError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeGuardianEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isGuardianEmailValid(value: string): boolean {
  const normalized = normalizeGuardianEmail(value);
  return normalized.length >= 3 && normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export async function fetchGuardianManagementAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<GuardianManagementAccess> {
  const { data, error } = await client.rpc("get_guardian_management_access", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    canView: row?.can_view === true,
    canInvite: row?.can_invite === true,
    canViewContacts: row?.can_view_contacts === true,
    canRevoke: row?.can_revoke === true,
  };
}

export async function fetchGuardianDirectory(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<GuardianDirectoryRow[]> {
  const { data, error } = await client.rpc("list_school_guardians", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    relationshipId: String(row.relationship_id),
    studentId: String(row.student_id),
    studentName: String(row.student_name),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    className: row.class_name ? String(row.class_name) : null,
    guardianProfileId: String(row.guardian_profile_id),
    guardianName: String(row.guardian_name),
    guardianEmail: row.guardian_email ? String(row.guardian_email) : null,
    guardianPhone: row.guardian_phone ? String(row.guardian_phone) : null,
    relationshipType: row.relationship_type as GuardianRelationshipType,
    isPrimary: row.is_primary === true,
    relationshipStatus: row.relationship_status as GuardianDirectoryRow["relationshipStatus"],
    invitationStatus: (row.invitation_status ?? null) as GuardianDirectoryRow["invitationStatus"],
    createdAt: String(row.created_at),
    activatedAt: row.activated_at ? String(row.activated_at) : null,
  }));
}

export async function fetchGuardianInviteStudents(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<GuardianInviteStudent[]> {
  const { data, error } = await client.rpc("list_guardian_invite_students", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    studentId: String(row.student_id),
    studentName: String(row.student_name),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    className: row.class_name ? String(row.class_name) : null,
  }));
}

async function parseInviteError(error: unknown): Promise<GuardianInviteErrorCode> {
  const context =
    typeof error === "object" && error !== null && "context" in error
      ? (error as { context?: Response }).context
      : undefined;
  if (context) {
    try {
      const body = (await context.clone().json()) as { error?: string };
      if (
        body.error &&
        [
          "not_authorized",
          "invalid_request",
          "idempotency_conflict",
          "invitation_unavailable",
          "delivery_unavailable",
          "provisioning_failed",
        ].includes(body.error)
      ) {
        return body.error as GuardianInviteErrorCode;
      }
    } catch {
      // Fall through to a generic safe code.
    }
  }
  return "provisioning_failed";
}

export async function inviteGuardian(
  input: InviteGuardianInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const email = normalizeGuardianEmail(input.email);
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (!isGuardianEmailValid(email) || fullName.length < 2 || fullName.length > 150) {
    throw new GuardianInviteError("invalid_request");
  }

  const idempotencyKey = `guardian-ui-${crypto.randomUUID()}`;
  const { data, error } = await client.functions.invoke("invite-guardian", {
    body: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      email,
      fullName,
      relationshipType: input.relationshipType,
      isPrimary: input.isPrimary,
    },
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (error) throw new GuardianInviteError(await parseInviteError(error));
  if (data?.ok !== true || data?.status !== "sent") {
    throw new GuardianInviteError("provisioning_failed");
  }
}

export function guardianRelationshipLabel(type: GuardianRelationshipType): string {
  return {
    father: "الأب",
    mother: "الأم",
    legal_guardian: "الولي الشرعي",
    relative: "قريب",
    other: "أخرى",
  }[type];
}

export function guardianStatusLabel(status: GuardianDirectoryRow["relationshipStatus"]): string {
  return { pending: "بانتظار التفعيل", active: "نشط", revoked: "ملغى" }[status];
}

export function invitationStatusLabel(status: GuardianDirectoryRow["invitationStatus"]): string {
  if (!status) return "لم تُرسل دعوة";
  return {
    prepared: "قيد التجهيز",
    sent: "أُرسلت الدعوة",
    accepted: "قُبلت الدعوة",
    failed: "تعذر الإرسال",
    expired: "انتهت الدعوة",
    revoked: "أُلغيت الدعوة",
  }[status];
}

export function guardianInviteErrorMessage(code: GuardianInviteErrorCode): string {
  return {
    not_authorized: "لا تملك صلاحية دعوة ولي لهذا الطالب.",
    invalid_request: "تحقق من اسم ولي الأمر والبريد والبيانات المختارة.",
    idempotency_conflict: "تعذر إعادة محاولة هذه الدعوة بصورة آمنة.",
    invitation_unavailable: "توجد دعوة أو علاقة لا تسمح بإرسال دعوة جديدة حاليًا.",
    delivery_unavailable: "تعذر إرسال رسالة الدعوة حاليًا. حاول لاحقًا.",
    provisioning_failed: "تعذر تجهيز دعوة ولي الأمر بصورة آمنة.",
  }[code];
}
