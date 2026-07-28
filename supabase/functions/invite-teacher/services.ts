import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  SafeInvitationError,
  parseAllowedOrigins,
  type InvitationErrorCode,
  type InviteTeacherRequest,
} from "./logic.ts";
import type {
  EligibleTeacher,
  InvitationAttempt,
  InviteTeacherDependencies,
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

export function createSupabaseInviteDependencies(): InviteTeacherDependencies {
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const publishableKey =
    getMappedEnvironmentValue("SUPABASE_PUBLISHABLE_KEYS") ??
    requiredEnvironment("SUPABASE_ANON_KEY");
  const secretKey =
    getMappedEnvironmentValue("SUPABASE_SECRET_KEYS") ??
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const allowedOrigins = parseAllowedOrigins(
    requiredEnvironment("ALLOWED_ORIGINS")
  );
  const publicSiteUrl = requiredEnvironment("PUBLIC_SITE_URL");

  if (allowedOrigins.size === 0) {
    throw new Error("allowed_origins_required");
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    allowedOrigins,
    publicSiteUrl,

    async authenticate(token) {
      const userClient = createUserClient(supabaseUrl, publishableKey, token);
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data.user) {
        throw new SafeInvitationError("not_authorized", 401);
      }
      return data.user.id;
    },

    async hasPermission(token, schoolId, permissionCode) {
      const userClient = createUserClient(supabaseUrl, publishableKey, token);
      const { data, error } = await userClient.rpc("has_school_permission", {
        target_school_id: schoolId,
        target_permission_code: permissionCode,
      });
      return !error && data === true;
    },

    async findAttemptByIdempotency(schoolId, idempotencyKey) {
      const { data, error } = await admin
        .from("teacher_invitations")
        .select("id, status, failure_code")
        .eq("school_id", schoolId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw new SafeInvitationError("provisioning_failed", 500);
      if (!data) return null;
      return {
        id: data.id,
        status: data.status,
        failureCode: data.failure_code,
      } as InvitationAttempt;
    },

    async findEligibleTeacher(request: InviteTeacherRequest) {
      const { data: teacher, error: teacherError } = await admin
        .from("teachers")
        .select(
          "id, school_id, branch_id, first_name, last_name, email, status, profile_id"
        )
        .eq("id", request.teacherId)
        .eq("school_id", request.schoolId)
        .eq("status", "active")
        .is("profile_id", null)
        .maybeSingle();
      if (teacherError || !teacher) return null;
      if (
        teacher.email &&
        teacher.email.trim().toLowerCase() !== request.email
      ) {
        return null;
      }

      const { data: branch, error: branchError } = await admin
        .from("branches")
        .select("id, school_id, name, status")
        .eq("id", teacher.branch_id)
        .eq("school_id", request.schoolId)
        .eq("status", "active")
        .maybeSingle();
      if (branchError || !branch) return null;

      const { data: assignments, error: assignmentError } = await admin
        .from("class_teachers")
        .select("class_id")
        .eq("school_id", request.schoolId)
        .eq("branch_id", teacher.branch_id)
        .eq("teacher_id", teacher.id)
        .eq("status", "active");
      if (assignmentError) {
        throw new SafeInvitationError("provisioning_failed", 500);
      }

      const classIds = [
        ...new Set((assignments ?? []).map(row => row.class_id as string)),
      ];
      let classNames: string[] = [];
      if (classIds.length > 0) {
        const { data: classes, error: classesError } = await admin
          .from("classes")
          .select("id, name")
          .eq("school_id", request.schoolId)
          .eq("branch_id", teacher.branch_id)
          .in("id", classIds)
          .eq("status", "active");
        if (classesError) {
          throw new SafeInvitationError("provisioning_failed", 500);
        }
        classNames = (classes ?? [])
          .map(row => String(row.name).trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right, "ar"));
      }

      return {
        id: teacher.id,
        schoolId: teacher.school_id,
        branchId: teacher.branch_id,
        fullName: `${String(teacher.first_name).trim()} ${String(
          teacher.last_name
        ).trim()}`.trim(),
        branchName: String(branch.name).trim(),
        classNames,
      } satisfies EligibleTeacher;
    },

    async hasActiveInvitation(schoolId, teacherId, email) {
      const [teacherResult, emailResult] = await Promise.all([
        admin
          .from("teacher_invitations")
          .select("id")
          .eq("school_id", schoolId)
          .eq("teacher_id", teacherId)
          .in("status", ["processing", "sent"])
          .limit(1),
        admin
          .from("teacher_invitations")
          .select("id")
          .eq("school_id", schoolId)
          .eq("email", email)
          .in("status", ["processing", "sent"])
          .limit(1),
      ]);
      if (teacherResult.error || emailResult.error) {
        throw new SafeInvitationError("provisioning_failed", 500);
      }
      return Boolean(teacherResult.data?.length || emailResult.data?.length);
    },

    async isTeacherEmailUnavailable(schoolId, teacherId, email) {
      const { data, error } = await admin
        .from("teachers")
        .select("id")
        .eq("school_id", schoolId)
        .neq("id", teacherId)
        .ilike("email", email)
        .limit(1);
      if (error) throw new SafeInvitationError("provisioning_failed", 500);
      return Boolean(data?.length);
    },

    async createProcessingAttempt(input) {
      const { data, error } = await admin
        .from("teacher_invitations")
        .insert({
          school_id: input.schoolId,
          branch_id: input.branchId,
          teacher_id: input.teacherId,
          email: input.email,
          idempotency_key: input.idempotencyKey,
          invited_by: input.invitedBy,
          status: "processing",
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") {
          throw new SafeInvitationError("invitation_already_exists", 409);
        }
        if (error.code === "23514" || error.code === "23503") {
          throw new SafeInvitationError("teacher_not_eligible", 422);
        }
        throw new SafeInvitationError("provisioning_failed", 500);
      }
      return data.id;
    },

    async authUserExists(email) {
      for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (error) throw new SafeInvitationError("provisioning_failed", 500);
        if (
          data.users.some(
            user => user.email?.trim().toLowerCase() === email
          )
        ) {
          return true;
        }
        if (data.users.length < 1000) return false;
      }
      throw new SafeInvitationError("provisioning_failed", 500);
    },

    async inviteAuthUser(email, redirectTo) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      if (error || !data.user?.id) {
        throw new SafeInvitationError("email_delivery_unavailable", 503);
      }
      return data.user.id;
    },

    async provisionInvitation(input) {
      const { error } = await admin.rpc("provision_teacher_invitation", {
        target_invitation_id: input.invitationId,
        target_school_id: input.schoolId,
        target_teacher_id: input.teacherId,
        target_invited_user_id: input.invitedUserId,
        target_email: input.email,
        target_invited_by: input.invitedBy,
      });
      if (error) throw new SafeInvitationError("provisioning_failed", 500);
    },

    async markAttemptFailed(invitationId, code: InvitationErrorCode) {
      const { error } = await admin
        .from("teacher_invitations")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_code: code,
        })
        .eq("id", invitationId)
        .eq("status", "processing");
      if (error) throw new SafeInvitationError("provisioning_failed", 500);
    },

    async deleteCreatedAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error("auth_compensation_failed");
    },

    log(event) {
      console.info(JSON.stringify(event));
    },
  };
}
