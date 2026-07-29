import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export const TEACHER_INVITATION_PERMISSIONS = [
  "members.manage",
  "members.assign_roles",
  "teachers.manage",
] as const;

export type TeacherInvitationPermission =
  (typeof TEACHER_INVITATION_PERMISSIONS)[number];

export type TeacherInvitationAccess = {
  canInvite: boolean;
  permissions: Record<TeacherInvitationPermission, boolean>;
};

export type EligibleTeacherInvitation = {
  teacherId: string;
  schoolId: string;
  branchId: string;
  fullName: string;
  branchName: string;
  classNames: string[];
  existingEmail: string | null;
  roleLabel: "المعلم";
};

export type InviteTeacherResult = {
  invitationId: string;
  status: "sent" | "accepted";
};

export type TeacherInvitationContext = {
  invitationId: string;
  schoolName: string;
  teacherName: string;
  branchName: string;
  status: "sent" | "accepted";
};

export type TeacherInvitationErrorCode =
  | "not_authorized"
  | "teacher_not_eligible"
  | "invitation_already_exists"
  | "email_unavailable"
  | "email_delivery_unavailable"
  | "provisioning_failed"
  | "invalid_request";

export class TeacherInvitationError extends Error {
  constructor(public readonly code: TeacherInvitationErrorCode) {
    super(code);
    this.name = "TeacherInvitationError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTeacherInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isTeacherInvitationEmailValid(value: string): boolean {
  const normalized = normalizeTeacherInvitationEmail(value);
  return (
    normalized.length >= 3 &&
    normalized.length <= 254 &&
    EMAIL_PATTERN.test(normalized)
  );
}

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permission: TeacherInvitationPermission
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: permission,
  });
  return !error && data === true;
}

export async function fetchTeacherInvitationAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<TeacherInvitationAccess> {
  const values = await Promise.all(
    TEACHER_INVITATION_PERMISSIONS.map(permission =>
      hasSchoolPermission(client, schoolId, permission)
    )
  );
  const permissions = Object.fromEntries(
    TEACHER_INVITATION_PERMISSIONS.map((permission, index) => [
      permission,
      values[index] === true,
    ])
  ) as Record<TeacherInvitationPermission, boolean>;
  return {
    permissions,
    canInvite: values.every(value => value === true),
  };
}

export async function fetchEligibleTeacherInvitations(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<EligibleTeacherInvitation[]> {
  const access = await fetchTeacherInvitationAccess(schoolId, client);
  if (!access.canInvite) throw new TeacherInvitationError("not_authorized");

  const { data: teachers, error: teacherError } = await client
    .from("teachers")
    .select(
      "id, school_id, branch_id, first_name, last_name, email, status, profile_id"
    )
    .eq("school_id", schoolId)
    .eq("status", "active")
    .is("profile_id", null)
    .order("last_name")
    .order("first_name");
  if (teacherError) throw new TeacherInvitationError("provisioning_failed");

  const teacherRows = teachers ?? [];
  if (teacherRows.length === 0) return [];
  const teacherIds = teacherRows.map(row => row.id as string);
  const branchIds = [...new Set(teacherRows.map(row => row.branch_id as string))];

  const [branchResult, assignmentResult, invitationResult] = await Promise.all([
    client
      .from("branches")
      .select("id, school_id, name, status")
      .eq("school_id", schoolId)
      .in("id", branchIds)
      .eq("status", "active"),
    client
      .from("class_teachers")
      .select("teacher_id, class_id, branch_id, status")
      .eq("school_id", schoolId)
      .in("teacher_id", teacherIds)
      .eq("status", "active"),
    client
      .from("teacher_invitations")
      .select("teacher_id, status")
      .eq("school_id", schoolId)
      .in("teacher_id", teacherIds)
      .in("status", ["processing", "sent"]),
  ]);
  if (branchResult.error || assignmentResult.error || invitationResult.error) {
    throw new TeacherInvitationError("provisioning_failed");
  }

  const activeInvitationTeachers = new Set(
    (invitationResult.data ?? []).map(row => row.teacher_id as string)
  );
  const branches = new Map(
    (branchResult.data ?? []).map(row => [row.id as string, String(row.name)])
  );
  const assignments = assignmentResult.data ?? [];
  const classIds = [
    ...new Set(assignments.map(row => row.class_id as string).filter(Boolean)),
  ];
  const classes = new Map<string, string>();
  if (classIds.length > 0) {
    const classResult = await client
      .from("classes")
      .select("id, school_id, branch_id, name, status")
      .eq("school_id", schoolId)
      .in("id", classIds)
      .eq("status", "active");
    if (classResult.error) {
      throw new TeacherInvitationError("provisioning_failed");
    }
    for (const row of classResult.data ?? []) {
      classes.set(row.id as string, String(row.name));
    }
  }

  const classesByTeacher = new Map<string, string[]>();
  for (const assignment of assignments) {
    const className = classes.get(assignment.class_id as string);
    if (!className) continue;
    const teacherId = assignment.teacher_id as string;
    const current = classesByTeacher.get(teacherId) ?? [];
    current.push(className);
    classesByTeacher.set(teacherId, current);
  }

  return teacherRows
    .filter(row => {
      const branchId = row.branch_id as string;
      return (
        !activeInvitationTeachers.has(row.id as string) &&
        branches.has(branchId)
      );
    })
    .map(row => ({
      teacherId: row.id as string,
      schoolId: row.school_id as string,
      branchId: row.branch_id as string,
      fullName: `${String(row.first_name).trim()} ${String(
        row.last_name
      ).trim()}`.trim(),
      branchName: branches.get(row.branch_id as string)!,
      classNames: [...new Set(classesByTeacher.get(row.id as string) ?? [])].sort(
        (left, right) => left.localeCompare(right, "ar")
      ),
      existingEmail:
        typeof row.email === "string" && row.email.trim()
          ? normalizeTeacherInvitationEmail(row.email)
          : null,
      roleLabel: "المعلم" as const,
    }));
}

async function parseFunctionError(error: unknown): Promise<TeacherInvitationErrorCode> {
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
          "teacher_not_eligible",
          "invitation_already_exists",
          "email_unavailable",
          "email_delivery_unavailable",
          "provisioning_failed",
          "invalid_request",
        ].includes(body.error)
      ) {
        return body.error as TeacherInvitationErrorCode;
      }
    } catch {
      // Fall through to a safe generic code.
    }
  }
  return "provisioning_failed";
}

export async function inviteExistingTeacher(
  input: { schoolId: string; teacherId: string; email: string },
  idempotencyKey: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<InviteTeacherResult> {
  const email = normalizeTeacherInvitationEmail(input.email);
  if (!isTeacherInvitationEmailValid(email)) {
    throw new TeacherInvitationError("invalid_request");
  }

  const { data, error } = await client.functions.invoke("invite-teacher", {
    body: {
      schoolId: input.schoolId,
      teacherId: input.teacherId,
      email,
    },
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (error) throw new TeacherInvitationError(await parseFunctionError(error));
  if (!data?.ok || !data.invitationId || !["sent", "accepted"].includes(data.status)) {
    throw new TeacherInvitationError("provisioning_failed");
  }
  return { invitationId: data.invitationId, status: data.status };
}

export async function fetchMyTeacherInvitationContext(
  client: SupabaseClient = getSupabaseClient()
): Promise<TeacherInvitationContext | null> {
  const { data, error } = await client.rpc("get_my_teacher_invitation");
  if (error) throw new TeacherInvitationError("provisioning_failed");
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    invitationId: row.invitation_id,
    schoolName: row.school_name,
    teacherName: row.teacher_name,
    branchName: row.branch_name,
    status: row.invitation_status,
  };
}

export async function markMyTeacherInvitationAccepted(
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("accept_teacher_invitation");
  if (error) return false;
  return data === true;
}

export function getTeacherInvitationErrorMessage(
  code: TeacherInvitationErrorCode
): string {
  const messages: Record<TeacherInvitationErrorCode, string> = {
    not_authorized: "لا تملك الصلاحيات الثلاث المطلوبة لإرسال دعوة معلم.",
    teacher_not_eligible: "المعلم لم يعد مؤهلًا للدعوة أو تغير نطاقه.",
    invitation_already_exists: "توجد دعوة نشطة لهذا المعلم أو البريد.",
    email_unavailable: "لا يمكن استخدام هذا البريد لهذه الدعوة.",
    email_delivery_unavailable: "خدمة إرسال البريد غير متاحة حاليًا.",
    provisioning_failed: "تعذر تجهيز حساب المعلم بصورة آمنة.",
    invalid_request: "تحقق من البريد والبيانات المدخلة.",
  };
  return messages[code];
}
