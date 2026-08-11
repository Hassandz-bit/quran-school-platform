import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStudentChargePageData, type FinanceStudent } from "./student-charges.ts";
import { getSupabaseClient } from "./supabase.ts";

export type StudentDiscountType = "needy" | "sibling";
export type StudentDiscountValueType = "percentage" | "fixed";
export type StudentDiscountStatus = "active" | "inactive" | "expired" | "archived";

export type StudentDiscountPolicy = {
  id: string;
  branchId: string;
  studentId: string;
  discountType: StudentDiscountType | "scholarship" | "staff" | "custom";
  valueType: StudentDiscountValueType;
  value: number;
  reason: string;
  startDate: string;
  endDate: string | null;
  status: StudentDiscountStatus;
  autoApplyRecurring: boolean;
  createdAt: string;
};

export type StudentDiscountPolicySetup = {
  students: FinanceStudent[];
  policies: StudentDiscountPolicy[];
};

export type StudentDiscountPolicyInput = {
  studentId: string;
  discountType: StudentDiscountType;
  valueType: StudentDiscountValueType;
  value: number;
  reason: string;
  startDate: string;
  endDate: string | null;
};

type RawPolicy = {
  policy_id: string;
  branch_id: string;
  student_id: string;
  discount_type: StudentDiscountPolicy["discountType"];
  value_type: StudentDiscountValueType;
  value: number | string;
  reason: string;
  start_date: string;
  end_date: string | null;
  status: StudentDiscountStatus;
  auto_apply_recurring: boolean;
  created_at: string;
};

const asNumber = (value: number | string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function fetchStudentDiscountPolicySetup(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentDiscountPolicySetup> {
  const [chargeData, policyResult] = await Promise.all([
    fetchStudentChargePageData(schoolId, client),
    client.rpc("list_finance_student_discount_policies", {
      target_school_id: schoolId,
    }),
  ]);

  if (policyResult.error) throw policyResult.error;

  const manageable = new Set(chargeData.access.manageableBranchIds);
  return {
    students: chargeData.students.filter(
      student => student.status === "active" && manageable.has(student.branch_id)
    ),
    policies: ((policyResult.data ?? []) as RawPolicy[]).map(policy => ({
      id: policy.policy_id,
      branchId: policy.branch_id,
      studentId: policy.student_id,
      discountType: policy.discount_type,
      valueType: policy.value_type,
      value: asNumber(policy.value),
      reason: policy.reason,
      startDate: policy.start_date,
      endDate: policy.end_date,
      status: policy.status,
      autoApplyRecurring: policy.auto_apply_recurring,
      createdAt: policy.created_at,
    })),
  };
}

export async function createStudentDiscountPolicy(
  schoolId: string,
  input: StudentDiscountPolicyInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<string> {
  const { data, error } = await client.rpc(
    "create_finance_student_discount_policy",
    {
      target_school_id: schoolId,
      target_student_id: input.studentId,
      target_discount_type: input.discountType,
      target_value_type: input.valueType,
      target_value: input.value,
      target_reason: input.reason,
      target_start_date: input.startDate,
      target_end_date: input.endDate,
    }
  );
  if (error) throw error;
  return String(data);
}

export async function deactivateStudentDiscountPolicy(
  schoolId: string,
  policyId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc(
    "deactivate_finance_student_discount_policy",
    {
      target_school_id: schoolId,
      target_policy_id: policyId,
    }
  );
  if (error) throw error;
  return data === true;
}

export function studentDiscountTypeLabel(type: StudentDiscountPolicy["discountType"]): string {
  switch (type) {
    case "needy":
      return "حالة اجتماعية";
    case "sibling":
      return "خصم إخوة";
    case "scholarship":
      return "منحة";
    case "staff":
      return "أبناء الموظفين";
    default:
      return "خصم مخصص";
  }
}

export function studentDiscountValueLabel(
  valueType: StudentDiscountValueType,
  value: number
): string {
  return valueType === "percentage" ? `${value}%` : `${value.toLocaleString("ar-DZ")} دج`;
}

export function studentDiscountErrorMessage(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  if (message.includes("FINANCE_DISCOUNT_POLICY_OVERLAP")) {
    return "للطالب خصم دوري نشط يتقاطع مع هذه الفترة. أوقفه أو عدّل المدة قبل إضافة خصم جديد.";
  }
  if (message.includes("FINANCE_DISCOUNT_STUDENT_UNAVAILABLE")) {
    return "الطالب غير متاح أو لم يعد نشطًا.";
  }
  if (message.includes("FINANCE_DISCOUNT_INPUT_INVALID")) {
    return "تحقق من نوع الخصم وقيمته وسببه وتواريخه.";
  }
  if (message.includes("FINANCE_MANAGE_REQUIRED") || message.includes("permission")) {
    return "لا تملك صلاحية إدارة الخصومات في فرع هذا الطالب.";
  }
  return "تعذر حفظ سياسة الخصم. راجع البيانات وحاول مجددًا.";
}
