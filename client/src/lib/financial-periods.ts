import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type FinancialPeriodStatus = "open" | "closing" | "closed";
export type PeriodReconciliation = {
  id: string;
  systemBalance: number;
  actualBalance: number;
  difference: number;
  evidenceType: "cash_count" | "bank_statement" | "postal_statement";
  evidenceReference: string | null;
  notes: string | null;
  reconciledAt: string;
};
export type PeriodAccount = {
  id: string;
  branchId: string | null;
  name: string;
  code: string;
  accountType: "cash" | "bank" | "postal";
  status: "active" | "inactive" | "archived";
  systemBalance: number;
  canManage: boolean;
  latestReconciliation: PeriodReconciliation | null;
};
export type FinancialPeriodWorkspace = {
  period: null | {
    id: string;
    periodMonth: string;
    status: FinancialPeriodStatus;
    createdAt: string;
    closingStartedAt: string | null;
    closedAt: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
  };
  canManageSchool: boolean;
  accounts: PeriodAccount[];
  events: Array<{
    action: "create" | "start_closing" | "close" | "reopen";
    fromStatus: FinancialPeriodStatus | null;
    toStatus: FinancialPeriodStatus;
    reason: string | null;
    actorProfileId: string;
    createdAt: string;
  }>;
};

const n = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export async function fetchFinancialPeriodWorkspace(
  schoolId: string,
  periodMonth: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<FinancialPeriodWorkspace> {
  const { data, error } = await client.rpc("get_financial_period_workspace", {
    target_school_id: schoolId,
    target_period_month: periodMonth,
  });
  if (error) throw error;
  const raw = data as any;
  return {
    period: raw.period
      ? {
          id: raw.period.id,
          periodMonth: raw.period.period_month,
          status: raw.period.status,
          createdAt: raw.period.created_at,
          closingStartedAt: raw.period.closing_started_at ?? null,
          closedAt: raw.period.closed_at ?? null,
          reopenedAt: raw.period.reopened_at ?? null,
          reopenReason: raw.period.reopen_reason ?? null,
        }
      : null,
    canManageSchool: raw.can_manage_school === true,
    accounts: (raw.accounts ?? []).map((row: any) => ({
      id: row.id,
      branchId: row.branch_id ?? null,
      name: row.name,
      code: row.code,
      accountType: row.account_type,
      status: row.status,
      systemBalance: n(row.system_balance),
      canManage: row.can_manage === true,
      latestReconciliation: row.latest_reconciliation
        ? {
            id: row.latest_reconciliation.id,
            systemBalance: n(row.latest_reconciliation.system_balance),
            actualBalance: n(row.latest_reconciliation.actual_balance),
            difference: n(row.latest_reconciliation.difference),
            evidenceType: row.latest_reconciliation.evidence_type,
            evidenceReference: row.latest_reconciliation.evidence_reference ?? null,
            notes: row.latest_reconciliation.notes ?? null,
            reconciledAt: row.latest_reconciliation.reconciled_at,
          }
        : null,
    })),
    events: (raw.events ?? []).map((row: any) => ({
      action: row.action,
      fromStatus: row.from_status ?? null,
      toStatus: row.to_status,
      reason: row.reason ?? null,
      actorProfileId: row.actor_profile_id,
      createdAt: row.created_at,
    })),
  };
}

async function rpcBoolean(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data === true;
}

export async function startFinancialPeriodClosing(
  schoolId: string,
  periodMonth: string,
  client: SupabaseClient = getSupabaseClient(),
) {
  const { data, error } = await client.rpc("start_financial_period_closing", {
    target_school_id: schoolId,
    target_period_month: periodMonth,
  });
  if (error) throw error;
  return String(data);
}

export const reopenFinancialPeriod = (
  schoolId: string,
  periodId: string,
  reason: string,
  client: SupabaseClient = getSupabaseClient(),
) => rpcBoolean(client, "reopen_financial_period", {
  target_school_id: schoolId,
  target_period_id: periodId,
  target_reason: reason,
});

export const closeFinancialPeriod = (
  schoolId: string,
  periodId: string,
  client: SupabaseClient = getSupabaseClient(),
) => rpcBoolean(client, "close_financial_period", {
  target_school_id: schoolId,
  target_period_id: periodId,
});

export async function recordTreasuryPeriodReconciliation(
  schoolId: string,
  periodId: string,
  accountId: string,
  actualBalance: number,
  evidenceDate: string,
  evidenceReference: string | null,
  notes: string | null,
  client: SupabaseClient = getSupabaseClient(),
) {
  const { data, error } = await client.rpc("record_treasury_period_reconciliation", {
    target_school_id: schoolId,
    target_period_id: periodId,
    target_account_id: accountId,
    target_actual_balance: actualBalance,
    target_evidence_date: evidenceDate,
    target_evidence_reference: evidenceReference,
    target_notes: notes,
  });
  if (error) throw error;
  return String(data);
}

export function financialPeriodErrorMessage(error: unknown) {
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  const labels: Record<string, string> = {
    FINANCIAL_PERIOD_LOCKED: "الفترة في حالة إقفال أو مغلقة. أعد فتحها بتصحيح مدقق قبل أي تعديل بتاريخ سابق.",
    FINANCIAL_PERIOD_RECONCILIATION_REQUIRED: "يجب مطابقة كل حساب خزينة قبل إغلاق الفترة.",
    FINANCIAL_PERIOD_RECONCILIATION_STALE: "تغيّر رصيد أحد الحسابات بعد المطابقة. أعد المطابقة قبل الإغلاق.",
    FINANCIAL_PERIOD_RECONCILIATION_VARIANCE: "يوجد فرق في المطابقة. صحّح السبب ثم سجّل مطابقة جديدة؛ لا تُعدّل المطابقة السابقة.",
    FINANCIAL_PERIOD_UNMATCHED_TREASURY_EVIDENCE: "توجد عمليات مالية في الفترة بلا دليل خزينة مربوط. عالجها من شاشة المطابقة أولًا.",
    FINANCIAL_PERIOD_REOPEN_REASON_REQUIRED: "سبب إعادة الفتح مطلوب ويجب أن يكون واضحًا.",
    FINANCIAL_PERIOD_MANAGE_REQUIRED: "إدارة إقفال الفترة تتطلب finance.manage على مستوى المدرسة.",
    TREASURY_RECONCILIATION_DATE_INVALID: "تاريخ العد أو كشف الحساب يجب أن يكون آخر يوم من الفترة المالية.",
    TREASURY_RECONCILIATION_REFERENCE_REQUIRED: "مرجع كشف الحساب مطلوب للحساب البنكي أو البريدي.",
  };
  return (Object.entries(labels).find(([code]) => message.includes(code))?.[1] ?? message)
    || "تعذر تنفيذ العملية المالية.";
}
