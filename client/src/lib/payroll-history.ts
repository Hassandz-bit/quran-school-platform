import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";
import type { PayrollPaymentMethod } from "./payroll.ts";

export type PayrollHistoryRow = {
  entryId: string;
  branchId: string | null;
  periodMonth: string;
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
  entryStatus: "draft" | "approved" | "paid" | "cancelled";
  paymentId: string | null;
  paymentAmount: number | null;
  paymentMethod: PayrollPaymentMethod | null;
  paymentDate: string | null;
  paymentStatus: "completed" | "reversed" | null;
  paymentReference: string | null;
};

type Row = Record<string, unknown>;
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const nullableText = (value: unknown) =>
  typeof value === "string" ? value : null;

export async function fetchPayrollHistory(
  schoolId: string,
  branchId: string | null,
  client: SupabaseClient = getSupabaseClient()
): Promise<PayrollHistoryRow[]> {
  const { data, error } = await client.rpc("list_staff_payroll_history", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_limit: 500,
  });
  if (error) throw error;

  return ((data ?? []) as Row[]).map(row => ({
    entryId: text(row.entry_id),
    branchId: nullableText(row.branch_id),
    periodMonth: text(row.period_month),
    payeeKind: ["teacher", "employee"].includes(text(row.payee_kind))
      ? (text(row.payee_kind) as "teacher" | "employee")
      : "member",
    teacherId: nullableText(row.teacher_id),
    membershipId: nullableText(row.membership_id),
    employeeId: nullableText(row.employee_id),
    payeeName: text(row.payee_name),
    roleLabel: nullableText(row.role_label),
    baseAmount: num(row.base_amount),
    additions: num(row.additions),
    deductions: num(row.deductions),
    advances: num(row.advances),
    netAmount: num(row.net_amount),
    entryStatus: (["approved", "paid", "cancelled"].includes(text(row.entry_status))
      ? text(row.entry_status)
      : "draft") as PayrollHistoryRow["entryStatus"],
    paymentId: nullableText(row.payment_id),
    paymentAmount: row.payment_amount == null ? null : num(row.payment_amount),
    paymentMethod: nullableText(row.payment_method) as PayrollPaymentMethod | null,
    paymentDate: nullableText(row.payment_date),
    paymentStatus: (["completed", "reversed"].includes(text(row.payment_status))
      ? text(row.payment_status)
      : null) as PayrollHistoryRow["paymentStatus"],
    paymentReference: nullableText(row.payment_reference),
  }));
}
