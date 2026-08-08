import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export type GuardianInvitationContext = {
  invitationId: string;
  status: "sent" | "accepted";
  requiresPasswordSetup: boolean;
  expiresAt: string;
};

export async function fetchMyGuardianInvitationContext(
  invitationId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<GuardianInvitationContext | null> {
  const { data, error } = await client.rpc("get_my_guardian_invitation", {
    target_invitation_id: invitationId,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (
    !row ||
    !["sent", "accepted"].includes(row.invitation_status) ||
    typeof row.requires_password_setup !== "boolean"
  ) {
    return null;
  }
  return {
    invitationId: row.invitation_id,
    status: row.invitation_status,
    requiresPasswordSetup: row.requires_password_setup,
    expiresAt: row.expires_at,
  };
}

export async function activateGuardianInvitation(
  invitationId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("activate_guardian_invitation", {
    target_invitation_id: invitationId,
  });
  return !error && data === true;
}
