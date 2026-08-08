import { createClient, type User } from "npm:@supabase/supabase-js@2.110.7";
import {
  SafeGuardianInvitationError,
  parseAllowedOrigins,
} from "./logic.ts";
import type {
  GuardianDeliveryClaim,
  GuardianInvitationAttempt,
  GuardianInvitationStatus,
  InviteGuardianDependencies,
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

function mapDatabaseError(error: { code?: string; message?: string }): never {
  if (error.code === "42501") {
    throw new SafeGuardianInvitationError("not_authorized", 403);
  }
  if (
    error.code === "22023" &&
    error.message?.toLowerCase().includes("idempotency")
  ) {
    throw new SafeGuardianInvitationError("idempotency_conflict", 409);
  }
  if (["23503", "23505", "23514", "P0002"].includes(error.code ?? "")) {
    throw new SafeGuardianInvitationError("invitation_unavailable", 409);
  }
  throw new SafeGuardianInvitationError("provisioning_failed", 500);
}

function invitationStatus(value: unknown): GuardianInvitationStatus {
  if (
    value === "prepared" ||
    value === "sent" ||
    value === "accepted" ||
    value === "failed" ||
    value === "expired" ||
    value === "revoked"
  ) {
    return value;
  }
  throw new SafeGuardianInvitationError("provisioning_failed", 500);
}

export function createSupabaseGuardianInviteDependencies(): InviteGuardianDependencies {
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
  const authMailer = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function findAuthUser(email: string): Promise<User | null> {
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) {
        throw new SafeGuardianInvitationError("provisioning_failed", 500);
      }
      const match = data.users.find(
        user => user.email?.trim().toLowerCase() === email
      );
      if (match) return match;
      if (data.users.length < 1000) return null;
    }
    throw new SafeGuardianInvitationError("provisioning_failed", 500);
  }

  async function ensureActiveProfile(userId: string, fullName: string) {
    const { data: existing, error: readError } = await admin
      .from("profiles")
      .select("id, status")
      .eq("id", userId)
      .maybeSingle();
    if (readError) {
      throw new SafeGuardianInvitationError("provisioning_failed", 500);
    }
    if (existing) {
      if (existing.status !== "active") {
        throw new SafeGuardianInvitationError("invitation_unavailable", 409);
      }
      return;
    }

    const { error: insertError } = await admin.from("profiles").insert({
      id: userId,
      full_name: fullName,
      locale: "ar",
      status: "active",
    });
    if (!insertError) return;
    if (insertError.code !== "23505") {
      throw new SafeGuardianInvitationError("provisioning_failed", 500);
    }

    const { data: racedProfile, error: retryError } = await admin
      .from("profiles")
      .select("id, status")
      .eq("id", userId)
      .maybeSingle();
    if (retryError || racedProfile?.status !== "active") {
      throw new SafeGuardianInvitationError("invitation_unavailable", 409);
    }
  }

  return {
    allowedOrigins,
    publicSiteUrl,

    async authenticate(token) {
      const client = createUserClient(supabaseUrl, publishableKey, token);
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) {
        throw new SafeGuardianInvitationError("not_authorized", 401);
      }
      return data.user.id;
    },

    async authorize(token, schoolId, studentId) {
      const client = createUserClient(supabaseUrl, publishableKey, token);
      const [inviteResult, linkResult] = await Promise.all([
        client.rpc("can_manage_student_guardian", {
          target_school_id: schoolId,
          target_student_id: studentId,
          target_permission_code: "guardians.invite",
        }),
        client.rpc("can_manage_student_guardian", {
          target_school_id: schoolId,
          target_student_id: studentId,
          target_permission_code: "guardians.link",
        }),
      ]);
      return (
        !inviteResult.error &&
        !linkResult.error &&
        inviteResult.data === true &&
        linkResult.data === true
      );
    },

    async findRetry(input) {
      const client = createUserClient(supabaseUrl, publishableKey, input.token);
      const { data, error } = await client.rpc(
        "get_guardian_invitation_retry",
        {
          target_school_id: input.schoolId,
          target_student_id: input.studentId,
          target_idempotency_key_hash: input.idempotencyKeyHash,
          target_request_payload_hash: input.requestPayloadHash,
        }
      );
      if (error) mapDatabaseError(error);
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return null;
      return {
        id: row.invitation_id,
        status: invitationStatus(row.invitation_status),
      } satisfies GuardianInvitationAttempt;
    },

    async resolveAccount(email, fullName) {
      let user = await findAuthUser(email);
      let created = false;

      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: false,
          app_metadata: { account_source: "guardian_invitation" },
        });
        if (!error && data.user) {
          user = data.user;
          created = true;
        } else {
          user = await findAuthUser(email);
          if (!user) {
            throw new SafeGuardianInvitationError("provisioning_failed", 500);
          }
        }
      }

      try {
        await ensureActiveProfile(user.id, fullName);
      } catch (error) {
        if (created) {
          try {
            await admin.auth.admin.deleteUser(user.id);
          } catch {
            // The outward error remains generic; a referenced account is retained.
          }
        }
        throw error;
      }
      return {
        userId: user.id,
        requiresPasswordSetup:
          created || (!user.confirmed_at && !user.last_sign_in_at),
        createdByThisAttempt: created,
      };
    },

    async prepareInvitation(input) {
      const client = createUserClient(supabaseUrl, publishableKey, input.token);
      const { data, error } = await client.rpc("prepare_guardian_invitation", {
        target_school_id: input.schoolId,
        target_student_id: input.studentId,
        target_student_guardian_id: null,
        target_guardian_profile_id: input.guardianProfileId,
        target_email: input.email,
        target_relationship_type: input.relationshipType,
        target_is_primary: input.isPrimary,
        target_idempotency_key_hash: input.idempotencyKeyHash,
        target_request_payload_hash: input.requestPayloadHash,
        target_requires_password_setup: input.requiresPasswordSetup,
      });
      if (error) mapDatabaseError(error);
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        throw new SafeGuardianInvitationError("provisioning_failed", 500);
      }
      return {
        id: row.invitation_id,
        status: invitationStatus(row.invitation_status),
      } satisfies GuardianInvitationAttempt;
    },

    async claimDelivery(invitationId) {
      const { data, error } = await admin.rpc(
        "claim_guardian_invitation_delivery",
        { target_invitation_id: invitationId }
      );
      if (error) mapDatabaseError(error);
      const row = Array.isArray(data) ? data[0] : null;
      if (!row || typeof row.target_email !== "string") {
        throw new SafeGuardianInvitationError("provisioning_failed", 500);
      }
      return {
        id: row.invitation_id,
        status: invitationStatus(row.invitation_status),
        email: row.target_email,
        deliveryClaimed: row.delivery_claimed === true,
      } satisfies GuardianDeliveryClaim;
    },

    async deliverAuthLink(email, redirectTo) {
      const { error } = await authMailer.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
      if (error) {
        throw new SafeGuardianInvitationError("delivery_unavailable", 503);
      }
    },

    async markDeliveryFailed(invitationId, failureCode) {
      const { data, error } = await admin.rpc(
        "fail_guardian_invitation_delivery",
        {
          target_invitation_id: invitationId,
          target_failure_code: failureCode,
        }
      );
      if (error || data !== true) {
        throw new SafeGuardianInvitationError("provisioning_failed", 500);
      }
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
