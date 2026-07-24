import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const feePlanBillingCycles = [
  "one_time",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export const feePlanStatuses = ["active", "inactive", "archived"] as const;

export type FeePlanBillingCycle = (typeof feePlanBillingCycles)[number];
export type FeePlanStatus = (typeof feePlanStatuses)[number];

export type FeePlanRow = {
  id: string;
  school_id: string;
  branch_id: string | null;
  name: string;
  code: string;
  billing_cycle: FeePlanBillingCycle;
  amount: number | string;
  currency: "DZD";
  due_day: number | null;
  status: FeePlanStatus;
  description: string | null;
};

export type FeePlanBranch = {
  id: string;
  name: string;
  is_main: boolean;
};

export type FeePlanAccess = {
  canView: boolean;
  canManage: boolean;
  canManageSchoolWide: boolean;
  manageableBranchIds: string[];
};

export type FeePlanPageData = {
  plans: FeePlanRow[];
  branches: FeePlanBranch[];
  access: FeePlanAccess;
};

export type FeePlanFormValues = {
  branchId: string;
  name: string;
  code: string;
  billingCycle: FeePlanBillingCycle;
  amount: string;
  dueDay: string;
  status: FeePlanStatus;
  description: string;
};

export type FeePlanFormErrors = Partial<
  Record<keyof FeePlanFormValues, string>
>;

type FeePlanInsert = {
  school_id: string;
  branch_id: string | null;
  name: string;
  code: string;
  billing_cycle: FeePlanBillingCycle;
  amount: number;
  currency: "DZD";
  due_day: number | null;
  status: FeePlanStatus;
  description: string | null;
};

type FeePlanUpdate = Omit<FeePlanInsert, "school_id" | "branch_id">;

export class FeePlanPermissionError extends Error {
  constructor() {
    super("finance_permission_required");
    this.name = "FeePlanPermissionError";
  }
}

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export function normalizeFeePlanCode(value: string): string {
  return value.trim().toUpperCase();
}

export function validateFeePlanForm(
  values: FeePlanFormValues
): FeePlanFormErrors {
  const errors: FeePlanFormErrors = {};
  const name = values.name.trim();
  const code = normalizeFeePlanCode(values.code);
  const amount = Number(values.amount);

  if (name.length < 2 || name.length > 150) {
    errors.name = "يجب أن يكون اسم الخطة بين حرفين و150 حرفًا.";
  }

  if (!/^[A-Z0-9_]+$/.test(code)) {
    errors.code = "يقبل الرمز الأحرف الإنجليزية والأرقام والشرطة السفلية فقط.";
  }

  if (!feePlanBillingCycles.includes(values.billingCycle)) {
    errors.billingCycle = "دورة الفوترة غير صالحة.";
  }

  if (
    values.amount.trim() === "" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 9_999_999_999.99 ||
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(values.amount.trim())
  ) {
    errors.amount = "أدخل مبلغًا صحيحًا غير سالب وبمنزلتين عشريتين كحد أقصى.";
  }

  if (values.dueDay.trim() !== "") {
    const dueDay = Number(values.dueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
      errors.dueDay = "يجب أن يكون يوم الاستحقاق عددًا من 1 إلى 28.";
    }
  }

  if (!feePlanStatuses.includes(values.status)) {
    errors.status = "حالة الخطة غير صالحة.";
  }

  return errors;
}

export function buildFeePlanInsert(
  schoolId: string,
  values: FeePlanFormValues
): FeePlanInsert {
  return {
    school_id: schoolId,
    branch_id: optionalText(values.branchId),
    name: values.name.trim(),
    code: normalizeFeePlanCode(values.code),
    billing_cycle: values.billingCycle,
    amount: Number(values.amount),
    currency: "DZD",
    due_day:
      values.dueDay.trim() === "" ? null : Number(values.dueDay.trim()),
    status: values.status,
    description: optionalText(values.description),
  };
}

export function buildFeePlanUpdate(
  values: FeePlanFormValues
): FeePlanUpdate {
  const {
    school_id: _schoolId,
    branch_id: _branchId,
    ...editableFields
  } = buildFeePlanInsert("ignored", values);
  return editableFields;
}

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permissionCode: "finance.view" | "finance.manage"
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
  permissionCode: "finance.view" | "finance.manage"
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

export async function fetchFeePlanPageData(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<FeePlanPageData> {
  const { data: branchData, error: branchError } = await client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  if (branchError) throw branchError;
  const branches = (branchData ?? []) as FeePlanBranch[];

  const [schoolManage, branchPermissions] = await Promise.all([
    hasSchoolPermission(client, schoolId, "finance.manage"),
    Promise.all(
      branches.map(async branch => ({
        branchId: branch.id,
        canManage: await hasBranchPermission(
          client,
          schoolId,
          branch.id,
          "finance.manage"
        ),
      }))
    ),
  ]);

  const manageableBranchIds = branchPermissions
    .filter(permission => permission.canManage)
    .map(permission => permission.branchId);
  const access: FeePlanAccess = {
    canView: schoolManage || manageableBranchIds.length > 0,
    canManage: schoolManage || manageableBranchIds.length > 0,
    canManageSchoolWide: schoolManage,
    manageableBranchIds,
  };

  if (!access.canView) {
    throw new FeePlanPermissionError();
  }

  const { data: planData, error: planError } = await client
    .from("fee_plans")
    .select(
      "id, school_id, branch_id, name, code, billing_cycle, amount, currency, due_day, status, description"
    )
    .eq("school_id", schoolId)
    .order("name", { ascending: true })
    .order("code", { ascending: true });

  if (planError) throw planError;

  const visibleBranchSet = new Set(
    schoolManage ? branches.map(branch => branch.id) : manageableBranchIds
  );

  return {
    plans: ((planData ?? []) as FeePlanRow[]).filter(
      plan => plan.branch_id === null || visibleBranchSet.has(plan.branch_id)
    ),
    branches: branches.filter(branch => visibleBranchSet.has(branch.id)),
    access,
  };
}

export async function addFeePlan(
  schoolId: string,
  values: FeePlanFormValues,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { error } = await client
    .from("fee_plans")
    .insert(buildFeePlanInsert(schoolId, values));

  if (error) throw error;
}

export async function updateFeePlan(
  schoolId: string,
  planId: string,
  values: FeePlanFormValues,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client
    .from("fee_plans")
    .update(buildFeePlanUpdate(values))
    .eq("school_id", schoolId)
    .eq("id", planId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new FeePlanPermissionError();
}

export async function archiveFeePlan(
  schoolId: string,
  planId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client
    .from("fee_plans")
    .update({ status: "archived" })
    .eq("school_id", schoolId)
    .eq("id", planId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new FeePlanPermissionError();
}

export function canManageFeePlan(
  plan: Pick<FeePlanRow, "branch_id">,
  access: FeePlanAccess
): boolean {
  return plan.branch_id === null
    ? access.canManageSchoolWide
    : access.manageableBranchIds.includes(plan.branch_id);
}

const statusLabels: Record<FeePlanStatus, string> = {
  active: "نشطة",
  inactive: "غير نشطة",
  archived: "مؤرشفة",
};

const billingCycleLabels: Record<FeePlanBillingCycle, string> = {
  one_time: "مرة واحدة",
  monthly: "شهريًا",
  quarterly: "كل ثلاثة أشهر",
  yearly: "سنويًا",
};

export function translateFeePlanStatus(status: FeePlanStatus): string {
  return statusLabels[status];
}

export function translateBillingCycle(
  billingCycle: FeePlanBillingCycle
): string {
  return billingCycleLabels[billingCycle];
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

export function getFeePlanSaveErrorMessage(error: unknown): string {
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (code === "23505") {
    return "رمز الخطة مستخدم من قبل في هذه المدرسة.";
  }

  if (
    error instanceof FeePlanPermissionError ||
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "لا تملك صلاحية إدارة خطة الرسوم في هذا النطاق.";
  }

  if (code === "23514" || code === "23503") {
    return "تحقق من قيم الخطة والفرع ثم حاول مجددًا.";
  }

  return "تعذر حفظ خطة الرسوم حاليًا.";
}
