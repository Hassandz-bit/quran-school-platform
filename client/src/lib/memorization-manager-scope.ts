import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type MemorizationManagerScope = {
  schoolWide: boolean;
  branchIds: string[];
};

type MembershipRoleScopeRow = {
  role_id: string;
  branch_id: string | null;
};

const EMPTY_MANAGER_SCOPE: MemorizationManagerScope = {
  schoolWide: false,
  branchIds: [],
};

export async function fetchMemorizationManagerScope(
  schoolId: string,
  membershipId: string,
  branchManagerRoleIds: string[],
  client: SupabaseClient = getSupabaseClient()
): Promise<MemorizationManagerScope> {
  if (branchManagerRoleIds.length === 0) return EMPTY_MANAGER_SCOPE;

  const { data, error } = await client
    .from("membership_roles")
    .select("role_id, branch_id")
    .eq("school_id", schoolId)
    .eq("membership_id", membershipId)
    .in("role_id", branchManagerRoleIds);

  if (error) throw error;

  const allowedRoleIds = new Set(branchManagerRoleIds);
  const assignments = ((data ?? []) as MembershipRoleScopeRow[]).filter(
    assignment => allowedRoleIds.has(assignment.role_id)
  );

  return {
    schoolWide: assignments.some(assignment => assignment.branch_id === null),
    branchIds: [
      ...new Set(
        assignments.flatMap(assignment =>
          assignment.branch_id ? [assignment.branch_id] : []
        )
      ),
    ],
  };
}
