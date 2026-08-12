import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type ReconciliationSourceType = "student_payment" | "expense" | "payroll_payment";
export type ReconciliationTotals = {
  studentPayments: number;
  otherIncome: number;
  expenses: number;
  payroll: number;
  totalInflows: number;
  totalOutflows: number;
  net: number;
};
export type ReconciliationAccount = {
  id: string;
  branchId: string | null;
  name: string;
  code: string;
  accountType: "cash" | "bank" | "postal";
  status: "active" | "inactive" | "archived";
  balance: number;
};
export type UnlinkedTreasurySource = {
  sourceType: ReconciliationSourceType;
  sourceId: string;
  branchId: string | null;
  amount: number;
  sourceDate: string;
  referenceNumber: string | null;
  label: string;
  direction: "in" | "out";
  canManage: boolean;
};
export type TreasuryReconciliation = {
  business: ReconciliationTotals;
  linked: ReconciliationTotals;
  unmatched: { inflows: number; outflows: number; count: number };
  adjustments: { manualDeposits: number; manualWithdrawals: number; internalTransfers: number };
  accounts: ReconciliationAccount[];
  unlinkedSources: UnlinkedTreasurySource[];
};

type RawTotals = { student_payments: unknown; other_income: unknown; expenses: unknown; payroll: unknown; total_inflows: unknown; total_outflows: unknown; net: unknown };
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const mapTotals = (raw: RawTotals): ReconciliationTotals => ({
  studentPayments: n(raw.student_payments), otherIncome: n(raw.other_income), expenses: n(raw.expenses), payroll: n(raw.payroll),
  totalInflows: n(raw.total_inflows), totalOutflows: n(raw.total_outflows), net: n(raw.net),
});

export async function fetchTreasuryReconciliation(schoolId: string, client: SupabaseClient = getSupabaseClient()): Promise<TreasuryReconciliation> {
  const { data, error } = await client.rpc("get_treasury_reconciliation", { target_school_id: schoolId, target_limit: 250 });
  if (error) throw error;
  const raw = data as any;
  return {
    business: mapTotals(raw.business),
    linked: mapTotals(raw.linked),
    unmatched: { inflows: n(raw.unmatched?.inflows), outflows: n(raw.unmatched?.outflows), count: n(raw.unmatched?.count) },
    adjustments: { manualDeposits: n(raw.adjustments?.manual_deposits), manualWithdrawals: n(raw.adjustments?.manual_withdrawals), internalTransfers: n(raw.adjustments?.internal_transfers) },
    accounts: (raw.accounts ?? []).map((row: any) => ({ id: row.id, branchId: row.branch_id, name: row.name, code: row.code, accountType: row.account_type, status: row.status, balance: n(row.balance) })),
    unlinkedSources: (raw.unlinked_sources ?? []).map((row: any) => ({ sourceType: row.source_type, sourceId: row.source_id, branchId: row.branch_id, amount: n(row.amount), sourceDate: row.source_date, referenceNumber: row.reference_number ?? null, label: row.label, direction: row.direction, canManage: row.can_manage === true })),
  };
}

export async function linkTreasuryBusinessSource(schoolId: string, sourceType: ReconciliationSourceType, sourceId: string, accountId: string, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("link_treasury_business_source", {
    target_school_id: schoolId,
    target_source_type: sourceType,
    target_source_id: sourceId,
    target_account_id: accountId,
  });
  if (error) throw error;
  return data === true;
}

export const reconciliationSourceLabel = (type: ReconciliationSourceType) => ({ student_payment: "دفعة طالب", expense: "مصروف", payroll_payment: "راتب" }[type]);
