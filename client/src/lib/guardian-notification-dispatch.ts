import { getSupabaseClient } from "./supabase.ts";

export type GuardianNotificationDispatchScope = {
  schoolId: string;
  branchId: string;
  classId: string;
  sessionId: string;
};

/**
 * Best-effort only: attendance is already durably saved before this runs.
 * Notification delivery failures must never turn a successful attendance save
 * into a user-facing attendance error; the server outbox keeps retryable work.
 */
export async function dispatchGuardianAttendanceNotifications(
  scope: GuardianNotificationDispatchScope
): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.functions.invoke(
      "dispatch-guardian-notifications",
      { body: scope }
    );

    if (error) return false;
    return Boolean(
      data &&
        typeof data === "object" &&
        (data as { ok?: unknown }).ok === true
    );
  } catch {
    return false;
  }
}
