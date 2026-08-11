import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type RecurringBillingCycle = "monthly" | "quarterly" | "yearly";

export type RecurringBillingBranch = {
  id: string;
  name: string;
  isMain: boolean;
};

export type RecurringBillingPlan = {
  id: string;
  branchId: string | null;
  name: string;
  code: string;
  billingCycle: RecurringBillingCycle;
  amount: number;
  dueDay: number | null;
};

export type RecurringBillingSetup = {
  schoolManage: boolean;
  branches: RecurringBillingBranch[];
  manageableBranchIds: string[];
  plans: RecurringBillingPlan[];
};

export type RecurringGenerationPreview = {
  planId: string;
  planName: string;
  planCode: string;
  billingCycle: RecurringBillingCycle;
  amount: number;
  scopeBranchId: string | null;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  eligibleCount: number;
  alreadyChargedCount: number;
  toCreateCount: number;
  studentsWithActiveDiscounts: number;
  totalAmount: number;
  discountPolicy: "explicit_review_required";
};

export type RecurringGenerationResult = {
  createdCount: number;
  skippedCount: number;
  createdTotal: number;
  planId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  scopeBranchId: string | null;
  discountPolicy: "explicit_review_required";
};

export type FinanceReminderPreview = {
  asOf: string;
  dueSoonDays: number;
  scopeBranchId: string | null;
  dueSoonChargeCount: number;
  overdueChargeCount: number;
  dueSoonRecipientCount: number;
  overdueRecipientCount: number;
  dueSoonNewNotifications: number;
  overdueNewNotifications: number;
  totalNewNotifications: number;
};

export type FinanceReminderResult = {
  candidateCount: number;
  createdCount: number;
  dedupedCount: number;
  asOf: string;
  dueSoonDays: number;
  scopeBranchId: string | null;
};

type RawPlan = {
  id: string;
  branch_id: string | null;
  name: string;
  code: string;
  billing_cycle: string;
  amount: number | string;
  due_day: number | null;
  status: string;
};

type RawBranch = {
  id: string;
  name: string;
  is_main: boolean;
  status: string;
};

type RawGenerationPreview = {
  plan_id: string;
  plan_name: string;
  plan_code: string;
  billing_cycle: RecurringBillingCycle;
  amount: number | string;
  scope_branch_id: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  eligible_count: number;
  already_charged_count: number;
  to_create_count: number;
  students_with_active_discounts: number;
  total_amount: number | string;
  discount_policy: "explicit_review_required";
};

type RawGenerationResult = {
  created_count: number;
  skipped_count: number;
  created_total: number | string;
  plan_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  scope_branch_id: string | null;
  discount_policy: "explicit_review_required";
};

type RawReminderPreview = {
  as_of: string;
  due_soon_days: number;
  scope_branch_id: string | null;
  due_soon_charge_count: number;
  overdue_charge_count: number;
  due_soon_recipient_count: number;
  overdue_recipient_count: number;
  due_soon_new_notifications: number;
  overdue_new_notifications: number;
  total_new_notifications: number;
};

type RawReminderResult = {
  candidate_count: number;
  created_count: number;
  deduped_count: number;
  as_of: string;
  due_soon_days: number;
  scope_branch_id: string | null;
};

const asNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function schoolManage(
  client: SupabaseClient,
  schoolId: string
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: "finance.manage",
  });
  if (error) throw error;
  return data === true;
}

async function branchManage(
  client: SupabaseClient,
  schoolId: string,
  branchId: string
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: "finance.manage",
  });
  if (error) throw error;
  return data === true;
}

export async function fetchRecurringBillingSetup(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<RecurringBillingSetup> {
  const [branchResult, planResult, canManageSchool] = await Promise.all([
    client
      .from("branches")
      .select("id, name, is_main, status")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("is_main", { ascending: false })
      .order("name"),
    client
      .from("fee_plans")
      .select("id, branch_id, name, code, billing_cycle, amount, due_day, status")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in("billing_cycle", ["monthly", "quarterly", "yearly"])
      .order("name"),
    schoolManage(client, schoolId),
  ]);

  if (branchResult.error || planResult.error) {
    throw new Error("recurring_billing_setup_load_failed");
  }

  const rawBranches = (branchResult.data ?? []) as RawBranch[];
  const rawPlans = (planResult.data ?? []) as RawPlan[];
  const branchChecks = await Promise.all(
    rawBranches.map(async branch => ({
      id: branch.id,
      allowed:
        canManageSchool || (await branchManage(client, schoolId, branch.id)),
    }))
  );
  const manageableBranchIds = branchChecks
    .filter(item => item.allowed)
    .map(item => item.id);
  const allowed = new Set(manageableBranchIds);

  return {
    schoolManage: canManageSchool,
    manageableBranchIds,
    branches: rawBranches
      .filter(branch => allowed.has(branch.id))
      .map(branch => ({
        id: branch.id,
        name: branch.name,
        isMain: branch.is_main,
      })),
    plans: rawPlans
      .filter(plan =>
        plan.branch_id === null
          ? canManageSchool || manageableBranchIds.length > 0
          : allowed.has(plan.branch_id)
      )
      .map(plan => ({
        id: plan.id,
        branchId: plan.branch_id,
        name: plan.name,
        code: plan.code,
        billingCycle: plan.billing_cycle as RecurringBillingCycle,
        amount: asNumber(plan.amount),
        dueDay: plan.due_day,
      })),
  };
}

export async function previewRecurringGeneration(
  schoolId: string,
  planId: string,
  branchId: string | null,
  anchorDate: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<RecurringGenerationPreview> {
  const { data, error } = await client.rpc(
    "preview_recurring_fee_plan_generation",
    {
      target_school_id: schoolId,
      target_fee_plan_id: planId,
      target_branch_id: branchId,
      target_anchor_date: anchorDate,
    }
  );
  if (error) throw error;
  const raw = data as RawGenerationPreview;
  return {
    planId: raw.plan_id,
    planName: raw.plan_name,
    planCode: raw.plan_code,
    billingCycle: raw.billing_cycle,
    amount: asNumber(raw.amount),
    scopeBranchId: raw.scope_branch_id,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    dueDate: raw.due_date,
    eligibleCount: raw.eligible_count,
    alreadyChargedCount: raw.already_charged_count,
    toCreateCount: raw.to_create_count,
    studentsWithActiveDiscounts: raw.students_with_active_discounts,
    totalAmount: asNumber(raw.total_amount),
    discountPolicy: raw.discount_policy,
  };
}

export async function generateRecurringCharges(
  schoolId: string,
  planId: string,
  branchId: string | null,
  anchorDate: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<RecurringGenerationResult> {
  const { data, error } = await client.rpc(
    "generate_recurring_fee_plan_charges",
    {
      target_school_id: schoolId,
      target_fee_plan_id: planId,
      target_branch_id: branchId,
      target_anchor_date: anchorDate,
    }
  );
  if (error) throw error;
  const raw = data as RawGenerationResult;
  return {
    createdCount: raw.created_count,
    skippedCount: raw.skipped_count,
    createdTotal: asNumber(raw.created_total),
    planId: raw.plan_id,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    dueDate: raw.due_date,
    scopeBranchId: raw.scope_branch_id,
    discountPolicy: raw.discount_policy,
  };
}

export async function previewFinanceReminders(
  schoolId: string,
  branchId: string | null,
  asOf: string,
  dueSoonDays: number,
  client: SupabaseClient = getSupabaseClient()
): Promise<FinanceReminderPreview> {
  const { data, error } = await client.rpc("preview_finance_charge_reminders", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_as_of: asOf,
    target_due_soon_days: dueSoonDays,
  });
  if (error) throw error;
  const raw = data as RawReminderPreview;
  return {
    asOf: raw.as_of,
    dueSoonDays: raw.due_soon_days,
    scopeBranchId: raw.scope_branch_id,
    dueSoonChargeCount: raw.due_soon_charge_count,
    overdueChargeCount: raw.overdue_charge_count,
    dueSoonRecipientCount: raw.due_soon_recipient_count,
    overdueRecipientCount: raw.overdue_recipient_count,
    dueSoonNewNotifications: raw.due_soon_new_notifications,
    overdueNewNotifications: raw.overdue_new_notifications,
    totalNewNotifications: raw.total_new_notifications,
  };
}

export async function queueFinanceReminders(
  schoolId: string,
  branchId: string | null,
  asOf: string,
  dueSoonDays: number,
  client: SupabaseClient = getSupabaseClient()
): Promise<FinanceReminderResult> {
  const { data, error } = await client.rpc("queue_finance_charge_reminders", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_as_of: asOf,
    target_due_soon_days: dueSoonDays,
  });
  if (error) throw error;
  const raw = data as RawReminderResult;
  return {
    candidateCount: raw.candidate_count,
    createdCount: raw.created_count,
    dedupedCount: raw.deduped_count,
    asOf: raw.as_of,
    dueSoonDays: raw.due_soon_days,
    scopeBranchId: raw.scope_branch_id,
  };
}

export function recurringBillingErrorMessage(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  if (message.includes("FINANCE_RECURRING_DUE_DAY_REQUIRED")) {
    return "خطة الرسوم الدورية تحتاج تحديد يوم الاستحقاق أولًا.";
  }
  if (message.includes("FINANCE_MANAGE_REQUIRED")) {
    return "لا تملك صلاحية إدارة المالية في هذا النطاق.";
  }
  if (message.includes("FINANCE_SCHOOL_MANAGE_REQUIRED")) {
    return "توليد جميع الفروع يتطلب صلاحية إدارة المالية على مستوى المدرسة.";
  }
  if (message.includes("FINANCE_RECURRING_PLAN_UNAVAILABLE")) {
    return "خطة الرسوم غير متاحة لهذا النطاق أو ليست دورية نشطة.";
  }
  if (message.includes("FINANCE_REMINDER_INPUT_INVALID")) {
    return "إعدادات التذكير غير صالحة.";
  }
  return "تعذر تنفيذ العملية المالية. أعد المحاولة بعد مراجعة البيانات.";
}
