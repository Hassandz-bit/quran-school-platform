import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type FinanceModuleAccess = {
  canViewFinance: boolean;
  canManageFinance: boolean;
  canManageExpenses: boolean;
};

type BranchRow = { id: string };

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permissionCode: "finance.view" | "finance.manage" | "finance.expenses"
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: permissionCode,
  });
  if (error) throw error;
  return data === true;
}

async function hasBranchPermission(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  permissionCode: "finance.view" | "finance.manage" | "finance.expenses"
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: permissionCode,
  });
  if (error) throw error;
  return data === true;
}

export async function fetchFinanceModuleAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<FinanceModuleAccess> {
  const { data, error } = await client
    .from("branches")
    .select("id")
    .eq("school_id", schoolId);
  if (error) throw error;
  const branches = (data ?? []) as BranchRow[];

  const [schoolView, schoolManage, schoolExpenses, branchAccess] =
    await Promise.all([
      hasSchoolPermission(client, schoolId, "finance.view"),
      hasSchoolPermission(client, schoolId, "finance.manage"),
      hasSchoolPermission(client, schoolId, "finance.expenses"),
      Promise.all(
        branches.map(async branch => {
          const [view, manage, expenses] = await Promise.all([
            hasBranchPermission(
              client,
              schoolId,
              branch.id,
              "finance.view"
            ),
            hasBranchPermission(
              client,
              schoolId,
              branch.id,
              "finance.manage"
            ),
            hasBranchPermission(
              client,
              schoolId,
              branch.id,
              "finance.expenses"
            ),
          ]);
          return { view, manage, expenses };
        })
      ),
    ]);

  return {
    canViewFinance:
      schoolView ||
      schoolManage ||
      branchAccess.some(access => access.view || access.manage),
    canManageFinance:
      schoolManage || branchAccess.some(access => access.manage),
    canManageExpenses:
      schoolExpenses || branchAccess.some(access => access.expenses),
  };
}
