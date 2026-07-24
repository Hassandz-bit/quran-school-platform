import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const paymentMethods = [
  "cash",
  "bank_transfer",
  "postal",
  "cheque",
  "other",
] as const;
export const paymentStatuses = ["completed", "reversed"] as const;

export type PaymentMethod = (typeof paymentMethods)[number];
export type PaymentStatus = (typeof paymentStatuses)[number];

export type PaymentRow = {
  id: string;
  school_id: string;
  branch_id: string;
  student_id: string;
  charge_id: string;
  amount: number | string;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  status: PaymentStatus;
  created_at: string;
};

export type PaymentCharge = {
  id: string;
  branch_id: string;
  student_id: string;
  fee_plan_id: string | null;
  description: string;
  original_amount: number | string;
  net_amount: number | string;
  due_date: string;
  status: "pending" | "partially_paid" | "paid" | "waived" | "cancelled";
};

export type PaymentStudent = {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  status: string;
};

export type PaymentBranch = {
  id: string;
  name: string;
  is_main: boolean;
};

export type PaymentAccess = {
  canView: boolean;
  canManage: boolean;
  visibleBranchIds: string[];
  manageableBranchIds: string[];
};

export type PaymentPageData = {
  payments: PaymentRow[];
  charges: PaymentCharge[];
  students: PaymentStudent[];
  branches: PaymentBranch[];
  access: PaymentAccess;
};

export type ChargeBalance = {
  charge: PaymentCharge;
  paid: number;
  remaining: number;
};

export type PaymentLedgerRow = {
  payment: PaymentRow;
  charge: PaymentCharge | null;
  paidPreviously: number;
  remaining: number;
};

export type PaymentFormValues = {
  studentId: string;
  chargeId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referenceNumber: string;
  notes: string;
};

export type PaymentFormErrors = Partial<
  Record<keyof PaymentFormValues, string>
>;

type PaymentInsert = {
  school_id: string;
  branch_id: string;
  student_id: string;
  charge_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
};

export class PaymentPermissionError extends Error {
  constructor() {
    super("finance_permission_required");
    this.name = "PaymentPermissionError";
  }
}

const toAmount = (value: number | string): number => {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const validIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

export function buildChargeBalances(
  charges: PaymentCharge[],
  payments: PaymentRow[]
): ChargeBalance[] {
  const completedByCharge = new Map<string, number>();

  payments.forEach(payment => {
    if (payment.status !== "completed") return;
    completedByCharge.set(
      payment.charge_id,
      roundCurrency(
        (completedByCharge.get(payment.charge_id) ?? 0) +
          toAmount(payment.amount)
      )
    );
  });

  return charges.map(charge => {
    const paid = completedByCharge.get(charge.id) ?? 0;
    return {
      charge,
      paid,
      remaining: Math.max(roundCurrency(toAmount(charge.net_amount) - paid), 0),
    };
  });
}

export function buildPaymentLedgerRows(
  charges: PaymentCharge[],
  payments: PaymentRow[]
): PaymentLedgerRow[] {
  const balances = new Map(
    buildChargeBalances(charges, payments).map(balance => [
      balance.charge.id,
      balance,
    ])
  );
  const chargesById = new Map(charges.map(charge => [charge.id, charge]));

  return payments.map(payment => {
    const balance = balances.get(payment.charge_id);
    return {
      payment,
      charge: chargesById.get(payment.charge_id) ?? null,
      paidPreviously: Math.max(
        roundCurrency(
          (balance?.paid ?? 0) -
            (payment.status === "completed" ? toAmount(payment.amount) : 0)
        ),
        0
      ),
      remaining: balance?.remaining ?? 0,
    };
  });
}

export function getOpenChargeBalances(
  charges: PaymentCharge[],
  payments: PaymentRow[]
): ChargeBalance[] {
  return buildChargeBalances(charges, payments).filter(
    balance =>
      ["pending", "partially_paid"].includes(balance.charge.status) &&
      balance.remaining > 0
  );
}

export function validatePaymentForm(
  values: PaymentFormValues,
  balance: ChargeBalance | null
): PaymentFormErrors {
  const errors: PaymentFormErrors = {};
  const amount = Number(values.amount);

  if (!values.studentId) errors.studentId = "اختر الطالب.";
  if (!values.chargeId || !balance) {
    errors.chargeId = "اختر استحقاقًا مفتوحًا.";
  } else if (
    ["waived", "cancelled", "paid"].includes(balance.charge.status) ||
    balance.remaining <= 0
  ) {
    errors.chargeId = "لا يمكن الدفع لهذا الاستحقاق.";
  }

  if (
    values.amount.trim() === "" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 9_999_999_999.99 ||
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(values.amount.trim())
  ) {
    errors.amount = "أدخل مبلغًا موجبًا وبمنزلتين عشريتين كحد أقصى.";
  } else if (balance && roundCurrency(amount) > balance.remaining) {
    errors.amount = "لا يمكن أن تتجاوز الدفعة الرصيد المتبقي.";
  }

  if (!paymentMethods.includes(values.paymentMethod)) {
    errors.paymentMethod = "طريقة الدفع غير صالحة.";
  }
  if (!validIsoDate(values.paymentDate)) {
    errors.paymentDate = "تاريخ الدفع مطلوب.";
  }
  if (
    values.referenceNumber !== "" &&
    values.referenceNumber.trim() === ""
  ) {
    errors.referenceNumber = "الرقم المرجعي لا يمكن أن يكون فراغًا.";
  }
  if (values.notes !== "" && values.notes.trim() === "") {
    errors.notes = "الملاحظات لا يمكن أن تكون فراغًا.";
  }

  return errors;
}

export function buildPaymentInsert(
  schoolId: string,
  balance: ChargeBalance,
  values: PaymentFormValues
): PaymentInsert {
  return {
    school_id: schoolId,
    branch_id: balance.charge.branch_id,
    student_id: balance.charge.student_id,
    charge_id: balance.charge.id,
    amount: Number(values.amount),
    payment_method: values.paymentMethod,
    payment_date: values.paymentDate,
    reference_number: optionalText(values.referenceNumber),
    notes: optionalText(values.notes),
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

export async function fetchPaymentPageData(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<PaymentPageData> {
  const { data: branchData, error: branchError } = await client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });
  if (branchError) throw branchError;

  const allBranches = (branchData ?? []) as PaymentBranch[];
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
  const access: PaymentAccess = {
    canView: schoolView || schoolManage || visibleBranchIds.length > 0,
    canManage: schoolManage || manageableBranchIds.length > 0,
    visibleBranchIds,
    manageableBranchIds,
  };

  if (!access.canView) throw new PaymentPermissionError();

  const [studentsResult, chargesResult, paymentsResult] = await Promise.all([
    client.rpc("list_finance_students", {
      target_school_id: schoolId,
    }),
    client
      .from("student_charges")
      .select(
        "id, branch_id, student_id, fee_plan_id, description, original_amount, net_amount, due_date, status"
      )
      .eq("school_id", schoolId)
      .order("due_date", { ascending: false }),
    client
      .from("payments")
      .select(
        "id, school_id, branch_id, student_id, charge_id, amount, payment_method, payment_date, reference_number, notes, status, created_at"
      )
      .eq("school_id", schoolId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (studentsResult.error || chargesResult.error || paymentsResult.error) {
    throw new Error("payments_load_failed");
  }

  const visibleBranchSet = new Set(visibleBranchIds);
  return {
    students: ((studentsResult.data ?? []) as PaymentStudent[]).filter(student =>
      visibleBranchSet.has(student.branch_id)
    ),
    charges: ((chargesResult.data ?? []) as PaymentCharge[]).filter(charge =>
      visibleBranchSet.has(charge.branch_id)
    ),
    payments: ((paymentsResult.data ?? []) as PaymentRow[]).filter(payment =>
      visibleBranchSet.has(payment.branch_id)
    ),
    branches: allBranches.filter(branch => visibleBranchSet.has(branch.id)),
    access,
  };
}

export function canManagePayment(
  payment: Pick<PaymentRow, "branch_id">,
  access: PaymentAccess
): boolean {
  return access.manageableBranchIds.includes(payment.branch_id);
}

export async function addPayment(
  schoolId: string,
  balance: ChargeBalance,
  values: PaymentFormValues,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { error } = await client
    .from("payments")
    .insert(buildPaymentInsert(schoolId, balance, values));
  if (error) throw error;
}

export async function reversePayment(
  schoolId: string,
  paymentId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client
    .from("payments")
    .update({ status: "reversed" })
    .eq("school_id", schoolId)
    .eq("id", paymentId)
    .eq("status", "completed")
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PaymentPermissionError();
}

const methodLabels: Record<PaymentMethod, string> = {
  cash: "نقدًا",
  bank_transfer: "تحويل بنكي",
  postal: "بريدي",
  cheque: "صك",
  other: "أخرى",
};

export function translatePaymentMethod(method: PaymentMethod): string {
  return methodLabels[method];
}

export function translatePaymentStatus(status: PaymentStatus): string {
  return status === "completed" ? "مكتملة" : "معكوسة";
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

export function getPaymentSaveErrorMessage(error: unknown): string {
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (
    error instanceof PaymentPermissionError ||
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "لا تملك صلاحية إدارة الدفعات في هذا الفرع.";
  }
  if (message.includes("exceed the remaining")) {
    return "تجاوزت الدفعة الرصيد المتبقي. حدّث البيانات وحاول مجددًا.";
  }
  if (message.includes("waived or cancelled")) {
    return "لا يمكن الدفع لاستحقاق معفى أو ملغى.";
  }
  if (code === "23514" || code === "23503" || code === "P0001") {
    return "تحقق من الاستحقاق والمبلغ وطريقة الدفع ثم حاول مجددًا.";
  }
  return "تعذر حفظ الدفعة حاليًا.";
}
