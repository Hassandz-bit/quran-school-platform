import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const studentChargeStatuses = [
  "pending",
  "partially_paid",
  "paid",
  "waived",
  "cancelled",
] as const;
export const studentChargeTypes = [
  "fee",
  "registration",
  "materials",
  "transport",
  "other",
] as const;
export const discountValueTypes = ["none", "fixed", "percentage"] as const;

export type StudentChargeStatus = (typeof studentChargeStatuses)[number];
export type StudentChargeType = (typeof studentChargeTypes)[number];
export type DiscountValueType = (typeof discountValueTypes)[number];

export type StudentChargeRow = {
  id: string;
  school_id: string;
  branch_id: string;
  student_id: string;
  fee_plan_id: string | null;
  charge_type: StudentChargeType;
  period_start: string | null;
  period_end: string | null;
  description: string;
  original_amount: number | string;
  discount_amount: number | string;
  discount_value_type: Exclude<DiscountValueType, "none"> | null;
  discount_value: number | string | null;
  discount_reason: string | null;
  net_amount: number | string;
  due_date: string;
  status: StudentChargeStatus;
};

export type FinanceStudent = {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  status: string;
};

export type StudentChargeBranch = {
  id: string;
  name: string;
  is_main: boolean;
};

export type StudentChargeFeePlan = {
  id: string;
  branch_id: string | null;
  name: string;
  code: string;
  amount: number | string;
  status: "active" | "inactive" | "archived";
};

export type StudentChargeAccess = {
  canView: boolean;
  canManage: boolean;
  visibleBranchIds: string[];
  manageableBranchIds: string[];
};

export type StudentChargePageData = {
  charges: StudentChargeRow[];
  students: FinanceStudent[];
  branches: StudentChargeBranch[];
  feePlans: StudentChargeFeePlan[];
  access: StudentChargeAccess;
};

export type StudentChargeFormValues = {
  studentId: string;
  feePlanId: string;
  chargeType: StudentChargeType;
  periodStart: string;
  periodEnd: string;
  description: string;
  originalAmount: string;
  discountType: DiscountValueType;
  discountValue: string;
  discountReason: string;
  dueDate: string;
};

export type StudentChargeFormErrors = Partial<
  Record<keyof StudentChargeFormValues, string>
>;

type DiscountDetails = {
  discount_amount: number;
  discount_value_type: "fixed" | "percentage" | null;
  discount_value: number | null;
  discount_reason: string | null;
};

type StudentChargeInsert = DiscountDetails & {
  school_id: string;
  branch_id: string;
  student_id: string;
  fee_plan_id: string | null;
  charge_type: StudentChargeType;
  period_start: string | null;
  period_end: string | null;
  description: string;
  original_amount: number;
  due_date: string;
};

type StudentChargeUpdate = Omit<
  StudentChargeInsert,
  "school_id" | "branch_id" | "student_id"
>;

export class StudentChargePermissionError extends Error {
  constructor() {
    super("finance_permission_required");
    this.name = "StudentChargePermissionError";
  }
}

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function computeDiscountAmount(
  originalAmount: number,
  discountType: DiscountValueType,
  discountValue: number
): number {
  if (discountType === "none") return 0;
  if (discountType === "fixed") return roundCurrency(discountValue);
  return roundCurrency((originalAmount * discountValue) / 100);
}

export function calculateNetAmount(values: StudentChargeFormValues): number {
  const originalAmount = Number(values.originalAmount);
  const discountValue =
    values.discountType === "none" ? 0 : Number(values.discountValue);
  return roundCurrency(
    originalAmount -
      computeDiscountAmount(
        originalAmount,
        values.discountType,
        discountValue
      )
  );
}

function validMoney(value: string, allowZero: boolean): boolean {
  const trimmed = value.trim();
  const amount = Number(trimmed);
  return (
    trimmed !== "" &&
    Number.isFinite(amount) &&
    (allowZero ? amount >= 0 : amount > 0) &&
    amount <= 9_999_999_999.99 &&
    /^\d{1,10}(?:\.\d{1,2})?$/.test(trimmed)
  );
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateStudentChargeForm(
  values: StudentChargeFormValues
): StudentChargeFormErrors {
  const errors: StudentChargeFormErrors = {};
  const description = values.description.trim();

  if (!values.studentId) errors.studentId = "اختر الطالب.";
  if (!studentChargeTypes.includes(values.chargeType)) {
    errors.chargeType = "نوع الاستحقاق غير صالح.";
  }
  if (description.length < 2 || description.length > 200) {
    errors.description = "يجب أن تكون الملاحظات بين حرفين و200 حرف.";
  }
  if (!validMoney(values.originalAmount, true)) {
    errors.originalAmount =
      "أدخل مبلغًا صحيحًا غير سالب وبمنزلتين عشريتين كحد أقصى.";
  }
  if (!discountValueTypes.includes(values.discountType)) {
    errors.discountType = "نوع الخصم غير صالح.";
  }

  if (values.discountType !== "none") {
    const original = Number(values.originalAmount);
    const discountValue = Number(values.discountValue);
    const discountAmount = computeDiscountAmount(
      original,
      values.discountType,
      discountValue
    );

    if (!validMoney(values.discountValue, false)) {
      errors.discountValue = "أدخل قيمة خصم موجبة بمنزلتين عشريتين كحد أقصى.";
    } else if (
      values.discountType === "percentage" &&
      discountValue > 100
    ) {
      errors.discountValue = "يجب ألا تتجاوز نسبة الخصم 100%.";
    } else if (discountAmount > original) {
      errors.discountValue = "لا يمكن أن يتجاوز الخصم المبلغ الأصلي.";
    }

    const reason = values.discountReason.trim();
    if (reason.length < 2 || reason.length > 250) {
      errors.discountReason = "يجب أن يكون سبب الخصم بين حرفين و250 حرفًا.";
    }
  }

  if (values.periodStart && !validIsoDate(values.periodStart)) {
    errors.periodStart = "تاريخ بداية الفترة غير صالح.";
  }
  if (values.periodEnd && !validIsoDate(values.periodEnd)) {
    errors.periodEnd = "تاريخ نهاية الفترة غير صالح.";
  }
  if (
    values.periodStart &&
    values.periodEnd &&
    values.periodEnd < values.periodStart
  ) {
    errors.periodEnd = "يجب ألا يسبق تاريخ النهاية تاريخ البداية.";
  }
  if (!validIsoDate(values.dueDate)) {
    errors.dueDate = "تاريخ الاستحقاق مطلوب.";
  }

  return errors;
}

function buildDiscountDetails(
  values: StudentChargeFormValues
): DiscountDetails {
  if (values.discountType === "none") {
    return {
      discount_amount: 0,
      discount_value_type: null,
      discount_value: null,
      discount_reason: null,
    };
  }

  const originalAmount = Number(values.originalAmount);
  const discountValue = Number(values.discountValue);

  return {
    discount_amount: computeDiscountAmount(
      originalAmount,
      values.discountType,
      discountValue
    ),
    discount_value_type: values.discountType,
    discount_value: discountValue,
    discount_reason: values.discountReason.trim(),
  };
}

export function buildStudentChargeInsert(
  schoolId: string,
  student: FinanceStudent,
  values: StudentChargeFormValues
): StudentChargeInsert {
  return {
    school_id: schoolId,
    branch_id: student.branch_id,
    student_id: student.id,
    fee_plan_id: optionalText(values.feePlanId),
    charge_type: values.chargeType,
    period_start: optionalText(values.periodStart),
    period_end: optionalText(values.periodEnd),
    description: values.description.trim(),
    original_amount: Number(values.originalAmount),
    ...buildDiscountDetails(values),
    due_date: values.dueDate,
  };
}

export function buildStudentChargeUpdate(
  values: StudentChargeFormValues
): StudentChargeUpdate {
  return {
    fee_plan_id: optionalText(values.feePlanId),
    charge_type: values.chargeType,
    period_start: optionalText(values.periodStart),
    period_end: optionalText(values.periodEnd),
    description: values.description.trim(),
    original_amount: Number(values.originalAmount),
    ...buildDiscountDetails(values),
    due_date: values.dueDate,
  };
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

export async function fetchStudentChargePageData(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StudentChargePageData> {
  const { data: branchData, error: branchError } = await client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });
  if (branchError) throw branchError;

  const allBranches = (branchData ?? []) as StudentChargeBranch[];
  const [schoolView, schoolManage, branchPermissions] = await Promise.all([
    hasSchoolPermission(client, schoolId, "finance.view"),
    hasSchoolPermission(client, schoolId, "finance.manage"),
    Promise.all(
      allBranches.map(async branch => {
        const [canView, canManage] = await Promise.all([
          hasBranchPermission(client, schoolId, branch.id, "finance.view"),
          hasBranchPermission(client, schoolId, branch.id, "finance.manage"),
        ]);
        return {
          branchId: branch.id,
          canView: canView || canManage,
          canManage,
        };
      })
    ),
  ]);

  const visibleBranchIds = branchPermissions
    .filter(permission => permission.canView)
    .map(permission => permission.branchId);
  const manageableBranchIds = branchPermissions
    .filter(permission => permission.canManage)
    .map(permission => permission.branchId);
  const access: StudentChargeAccess = {
    canView: schoolView || schoolManage || visibleBranchIds.length > 0,
    canManage: schoolManage || manageableBranchIds.length > 0,
    visibleBranchIds,
    manageableBranchIds,
  };

  if (!access.canView) throw new StudentChargePermissionError();

  const [studentsResult, chargesResult, feePlansResult] = await Promise.all([
    client.rpc("list_finance_students", {
      target_school_id: schoolId,
    }),
    client
      .from("student_charges")
      .select(
        "id, school_id, branch_id, student_id, fee_plan_id, charge_type, period_start, period_end, description, original_amount, discount_amount, discount_value_type, discount_value, discount_reason, net_amount, due_date, status"
      )
      .eq("school_id", schoolId)
      .order("due_date", { ascending: false })
      .order("created_at", { ascending: false }),
    client
      .from("fee_plans")
      .select("id, branch_id, name, code, amount, status")
      .eq("school_id", schoolId)
      .order("name", { ascending: true }),
  ]);

  if (studentsResult.error || chargesResult.error || feePlansResult.error) {
    throw new Error("student_charges_load_failed");
  }

  const visibleBranchSet = new Set(visibleBranchIds);

  return {
    students: ((studentsResult.data ?? []) as FinanceStudent[]).filter(student =>
      visibleBranchSet.has(student.branch_id)
    ),
    charges: ((chargesResult.data ?? []) as StudentChargeRow[]).filter(charge =>
      visibleBranchSet.has(charge.branch_id)
    ),
    feePlans: (feePlansResult.data ?? []) as StudentChargeFeePlan[],
    branches: allBranches.filter(branch => visibleBranchSet.has(branch.id)),
    access,
  };
}

export function canManageStudentCharge(
  charge: Pick<StudentChargeRow, "branch_id">,
  access: StudentChargeAccess
): boolean {
  return access.manageableBranchIds.includes(charge.branch_id);
}

export function isFeePlanAllowedForStudent(
  plan: Pick<StudentChargeFeePlan, "branch_id" | "status">,
  student: Pick<FinanceStudent, "branch_id">,
  allowInactive = false
): boolean {
  return (
    (allowInactive || plan.status === "active") &&
    (plan.branch_id === null || plan.branch_id === student.branch_id)
  );
}

export async function addStudentCharge(
  schoolId: string,
  student: FinanceStudent,
  values: StudentChargeFormValues,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { error } = await client
    .from("student_charges")
    .insert(buildStudentChargeInsert(schoolId, student, values));
  if (error) throw error;
}

export async function updateStudentCharge(
  schoolId: string,
  chargeId: string,
  values: StudentChargeFormValues,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client
    .from("student_charges")
    .update(buildStudentChargeUpdate(values))
    .eq("school_id", schoolId)
    .eq("id", chargeId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new StudentChargePermissionError();
}

export async function cancelStudentCharge(
  chargeId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { error } = await client.rpc(
    "set_student_charge_administrative_status",
    {
      target_charge_id: chargeId,
      target_status: "cancelled",
    }
  );
  if (error) throw error;
}

const statusLabels: Record<StudentChargeStatus, string> = {
  pending: "مستحق",
  partially_paid: "مسدد جزئيًا",
  paid: "مسدد",
  waived: "معفى",
  cancelled: "ملغى",
};
const typeLabels: Record<StudentChargeType, string> = {
  fee: "رسوم دراسة",
  registration: "تسجيل",
  materials: "مواد",
  transport: "نقل",
  other: "أخرى",
};

export function translateStudentChargeStatus(
  status: StudentChargeStatus
): string {
  return statusLabels[status];
}

export function translateStudentChargeType(type: StudentChargeType): string {
  return typeLabels[type];
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

export function getStudentChargeSaveErrorMessage(error: unknown): string {
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (
    error instanceof StudentChargePermissionError ||
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "لا تملك صلاحية إدارة الاستحقاق في هذا الفرع.";
  }
  if (message.includes("reverse completed payments")) {
    return "يجب عكس الدفعات المكتملة قبل إلغاء الاستحقاق.";
  }
  if (message.includes("completed payments cannot exceed")) {
    return "لا يمكن خفض صافي الاستحقاق عن المبلغ المحصل.";
  }
  if (code === "23514" || code === "23503" || code === "P0001") {
    return "تحقق من بيانات الاستحقاق والخطة والخصم ثم حاول مجددًا.";
  }
  return "تعذر حفظ الاستحقاق حاليًا.";
}
