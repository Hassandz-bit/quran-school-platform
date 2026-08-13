import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type PayrollScope = {
  branchId: string | null;
  label: string;
  canManage: boolean;
};

export type PayrollCandidate = {
  kind: "teacher" | "member" | "employee";
  teacherId: string | null;
  membershipId: string | null;
  employeeId: string | null;
  branchId: string | null;
  name: string;
  roleLabel: string;
};

export type PayrollCompensationProfile = {
  id: string;
  branchId: string | null;
  payeeKind: "teacher" | "member" | "employee";
  teacherId: string | null;
  membershipId: string | null;
  employeeId: string | null;
  payeeName: string;
  baseAmount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "inactive" | "archived";
  notes: string | null;
};

export type PayrollPeriod = {
  id: string;
  branchId: string | null;
  periodMonth: string;
  status: "draft" | "approved" | "closed" | "cancelled";
  approvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  entryCount: number;
  netTotal: number;
  paidTotal: number;
};

export type PayrollPayment = {
  id: string;
  amount: number;
  paymentMethod: PayrollPaymentMethod;
  paymentDate: string;
  referenceNumber: string | null;
  status: "completed" | "reversed";
};

export type PayrollEntry = {
  id: string;
  periodId: string;
  payeeKind: "teacher" | "member" | "employee";
  teacherId: string | null;
  membershipId: string | null;
  employeeId: string | null;
  payeeName: string;
  roleLabel: string | null;
  baseAmount: number;
  additions: number;
  deductions: number;
  advances: number;
  netAmount: number;
  status: "draft" | "approved" | "paid" | "cancelled";
  payment: PayrollPayment | null;
};

export type PayrollWorkspace = {
  canManage: boolean;
  profiles: PayrollCompensationProfile[];
  candidates: PayrollCandidate[];
  periods: PayrollPeriod[];
  entries: PayrollEntry[];
};

export type PayrollPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "postal"
  | "cheque"
  | "other";

export const PAYROLL_PAYMENT_METHOD_LABELS: Record<PayrollPaymentMethod, string> = {
  cash: "نقدًا",
  bank_transfer: "تحويل بنكي",
  postal: "بريدي",
  cheque: "صك",
  other: "أخرى",
};

export const PAYROLL_PERIOD_STATUS_LABELS: Record<PayrollPeriod["status"], string> = {
  draft: "مسودة",
  approved: "معتمد",
  closed: "مغلق",
  cancelled: "ملغى",
};

export const PAYROLL_ENTRY_STATUS_LABELS: Record<PayrollEntry["status"], string> = {
  draft: "مسودة",
  approved: "جاهز للدفع",
  paid: "مدفوع",
  cancelled: "ملغى",
};

type BranchRow = { id: string; name: string; is_main: boolean };
type JsonRow = Record<string, unknown>;

const num = (value: unknown) => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};
const str = (value: unknown) => (typeof value === "string" ? value : "");
const nullableStr = (value: unknown) => (typeof value === "string" ? value : null);

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permission: "finance.view" | "finance.manage"
) {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: permission,
  });
  if (error) throw error;
  return data === true;
}

async function hasBranchPermission(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  permission: "finance.view" | "finance.manage"
) {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: permission,
  });
  if (error) throw error;
  return data === true;
}

export async function fetchPayrollScopes(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<PayrollScope[]> {
  const { data, error } = await client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  const branches = (data ?? []) as BranchRow[];
  const [schoolView, schoolManage, branchAccess] = await Promise.all([
    hasSchoolPermission(client, schoolId, "finance.view"),
    hasSchoolPermission(client, schoolId, "finance.manage"),
    Promise.all(
      branches.map(async branch => ({
        branch,
        view: await hasBranchPermission(client, schoolId, branch.id, "finance.view"),
        manage: await hasBranchPermission(client, schoolId, branch.id, "finance.manage"),
      }))
    ),
  ]);
  const scopes: PayrollScope[] = [];
  if (schoolView || schoolManage) {
    scopes.push({ branchId: null, label: "موظفو مستوى المدرسة", canManage: schoolManage });
  }
  branchAccess.forEach(item => {
    if (item.view || item.manage) {
      scopes.push({
        branchId: item.branch.id,
        label: item.branch.name + (item.branch.is_main ? " · الرئيسي" : ""),
        canManage: item.manage,
      });
    }
  });
  return scopes;
}

function normalizeWorkspace(data: unknown): PayrollWorkspace {
  const root = (data && typeof data === "object" ? data : {}) as JsonRow;
  const profiles = Array.isArray(root.profiles) ? root.profiles : [];
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const periods = Array.isArray(root.periods) ? root.periods : [];
  const entries = Array.isArray(root.entries) ? root.entries : [];
  return {
    canManage: root.can_manage === true,
    profiles: profiles.map(value => {
      const row = value as JsonRow;
      return {
        id: str(row.id),
        branchId: nullableStr(row.branch_id),
        payeeKind: ["teacher", "employee"].includes(str(row.payee_kind))
          ? (str(row.payee_kind) as "teacher" | "employee")
          : "member",
        teacherId: nullableStr(row.teacher_id),
        membershipId: nullableStr(row.membership_id),
        employeeId: nullableStr(row.employee_id),
        payeeName: str(row.payee_name),
        baseAmount: num(row.base_amount),
        effectiveFrom: str(row.effective_from),
        effectiveTo: nullableStr(row.effective_to),
        status: ["inactive", "archived"].includes(str(row.status))
          ? (str(row.status) as "inactive" | "archived")
          : "active",
        notes: nullableStr(row.notes),
      };
    }),
    candidates: candidates.map(value => {
      const row = value as JsonRow;
      return {
        kind: ["teacher", "employee"].includes(str(row.kind))
          ? (str(row.kind) as "teacher" | "employee")
          : "member",
        teacherId: nullableStr(row.teacher_id),
        membershipId: nullableStr(row.membership_id),
        employeeId: nullableStr(row.employee_id),
        branchId: nullableStr(row.branch_id),
        name: str(row.name),
        roleLabel: str(row.role_label) || "إداري/موظف",
      };
    }),
    periods: periods.map(value => {
      const row = value as JsonRow;
      const status = str(row.status);
      return {
        id: str(row.id),
        branchId: nullableStr(row.branch_id),
        periodMonth: str(row.period_month),
        status: (["approved", "closed", "cancelled"].includes(status)
          ? status
          : "draft") as PayrollPeriod["status"],
        approvedAt: nullableStr(row.approved_at),
        closedAt: nullableStr(row.closed_at),
        cancelledAt: nullableStr(row.cancelled_at),
        entryCount: num(row.entry_count),
        netTotal: num(row.net_total),
        paidTotal: num(row.paid_total),
      };
    }),
    entries: entries.map(value => {
      const row = value as JsonRow;
      const rawPayment = row.payment as JsonRow | null | undefined;
      const status = str(row.status);
      return {
        id: str(row.id),
        periodId: str(row.period_id),
        payeeKind: ["teacher", "employee"].includes(str(row.payee_kind))
          ? (str(row.payee_kind) as "teacher" | "employee")
          : "member",
        teacherId: nullableStr(row.teacher_id),
        membershipId: nullableStr(row.membership_id),
        employeeId: nullableStr(row.employee_id),
        payeeName: str(row.payee_name),
        roleLabel: nullableStr(row.role_label),
        baseAmount: num(row.base_amount),
        additions: num(row.additions),
        deductions: num(row.deductions),
        advances: num(row.advances),
        netAmount: num(row.net_amount),
        status: (["approved", "paid", "cancelled"].includes(status)
          ? status
          : "draft") as PayrollEntry["status"],
        payment: rawPayment
          ? {
              id: str(rawPayment.id),
              amount: num(rawPayment.amount),
              paymentMethod: str(rawPayment.payment_method) as PayrollPaymentMethod,
              paymentDate: str(rawPayment.payment_date),
              referenceNumber: nullableStr(rawPayment.reference_number),
              status: rawPayment.status === "reversed" ? "reversed" : "completed",
            }
          : null,
      };
    }),
  };
}

export async function fetchPayrollWorkspace(
  schoolId: string,
  branchId: string | null,
  periodMonth: string,
  client: SupabaseClient = getSupabaseClient()
) {
  const { data, error } = await client.rpc("get_staff_payroll_workspace", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_period_month: periodMonth,
  });
  if (error) throw error;
  return normalizeWorkspace(data);
}

async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
  client: SupabaseClient = getSupabaseClient()
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const createPayrollCompensation = (
  input: {
    schoolId: string;
    branchId: string | null;
    candidate: PayrollCandidate;
    baseAmount: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    notes?: string | null;
  },
  client?: SupabaseClient
) => input.candidate.kind === "employee"
  ? rpc<string>(
      "create_employee_compensation",
      {
        target_school_id: input.schoolId,
        target_branch_id: input.branchId,
        target_employee_id: input.candidate.employeeId,
        target_base_amount: input.baseAmount,
        target_effective_from: input.effectiveFrom,
        target_effective_to: input.effectiveTo ?? null,
        target_notes: input.notes ?? null,
      },
      client
    )
  : rpc<string>(
      "create_payroll_compensation",
      {
        target_school_id: input.schoolId,
        target_branch_id: input.branchId,
        target_payee_kind: input.candidate.kind,
        target_teacher_id: input.candidate.teacherId,
        target_membership_id: input.candidate.membershipId,
        target_base_amount: input.baseAmount,
        target_effective_from: input.effectiveFrom,
        target_effective_to: input.effectiveTo ?? null,
        target_notes: input.notes ?? null,
      },
      client
    );

export const setPayrollCompensationStatus = (
  schoolId: string,
  compensationId: string,
  status: PayrollCompensationProfile["status"],
  effectiveTo: string | null,
  client?: SupabaseClient
) =>
  rpc<boolean>(
    "set_payroll_compensation_status",
    {
      target_school_id: schoolId,
      target_compensation_id: compensationId,
      target_status: status,
      target_effective_to: effectiveTo,
    },
    client
  );

export const generatePayrollPeriod = (
  schoolId: string,
  branchId: string | null,
  periodMonth: string,
  client?: SupabaseClient
) =>
  rpc<string>(
    "generate_payroll_period",
    {
      target_school_id: schoolId,
      target_branch_id: branchId,
      target_period_month: periodMonth,
      target_notes: null,
    },
    client
  );

export const adjustPayrollEntry = (
  schoolId: string,
  entryId: string,
  values: { additions: number; deductions: number; advances: number },
  client?: SupabaseClient
) =>
  rpc<boolean>(
    "adjust_payroll_entry",
    {
      target_school_id: schoolId,
      target_entry_id: entryId,
      target_additions: values.additions,
      target_deductions: values.deductions,
      target_advances: values.advances,
    },
    client
  );

export const approvePayrollPeriod = (schoolId: string, periodId: string, client?: SupabaseClient) =>
  rpc<boolean>("approve_payroll_period", { target_school_id: schoolId, target_period_id: periodId }, client);

export const closePayrollPeriod = (schoolId: string, periodId: string, client?: SupabaseClient) =>
  rpc<boolean>("close_payroll_period", { target_school_id: schoolId, target_period_id: periodId }, client);

export const cancelPayrollPeriod = (schoolId: string, periodId: string, client?: SupabaseClient) =>
  rpc<boolean>("cancel_payroll_period", { target_school_id: schoolId, target_period_id: periodId }, client);

export const cancelPayrollEntry = (schoolId: string, entryId: string, client?: SupabaseClient) =>
  rpc<boolean>("cancel_payroll_entry", { target_school_id: schoolId, target_entry_id: entryId }, client);

export const recordPayrollPayment = (
  schoolId: string,
  entryId: string,
  input: { date: string; method: PayrollPaymentMethod; reference?: string; notes?: string },
  client?: SupabaseClient
) =>
  rpc<string | null>(
    "record_payroll_payment",
    {
      target_school_id: schoolId,
      target_entry_id: entryId,
      target_payment_date: input.date,
      target_payment_method: input.method,
      target_reference_number: input.reference?.trim() || null,
      target_notes: input.notes?.trim() || null,
    },
    client
  );

export const reversePayrollPayment = (
  schoolId: string,
  paymentId: string,
  reason: string,
  client?: SupabaseClient
) =>
  rpc<boolean>(
    "reverse_payroll_payment",
    { target_school_id: schoolId, target_payment_id: paymentId, target_reason: reason },
    client
  );
