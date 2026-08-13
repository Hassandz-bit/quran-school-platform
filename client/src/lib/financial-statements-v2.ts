import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";
import { getActiveCurrency } from "./currency.ts";

export type StatementBreakdown = { category: string; amount: number };
export type FinancialStatement = {
  periodMonth: string;
  periodEnd: string;
  generatedAt: string;
  periodStatus: "open" | "closing" | "closed" | null;
  scopeComplete: boolean;
  targetBranchId: string | null;
  accruals: number;
  outstanding: number;
  overdue: number;
  collections: number;
  otherIncome: number;
  expenses: number;
  payroll: { accrued: number; paidInPeriod: number; unpaidAtEnd: number };
  operatingResult: number;
  cash: {
    openingBalance: number;
    openingBalanceEntries: number;
    inflows: number;
    outflows: number;
    netCash: number;
    closingBalance: number;
    manualDeposits: number;
    manualWithdrawals: number;
    internalTransfers: number;
  };
  branches: Array<{ branchId: string; branchName: string; accruals: number; collections: number; otherIncome: number; expenses: number; payrollAccrued: number; payrollPaid: number }>;
  categories: { charges: StatementBreakdown[]; otherIncome: StatementBreakdown[]; expenses: StatementBreakdown[] };
  paymentMethods: StatementBreakdown[];
  accounts: Array<{ accountId: string; accountName: string; code: string; accountType: string; branchId: string | null; openingBalance: number; openingEntries: number; inflows: number; outflows: number; transfersIn: number; transfersOut: number; closingBalance: number }>;
};

const n = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const mapBreakdown = (rows: any[] = []): StatementBreakdown[] => rows.map(row => ({ category: String(row.category), amount: n(row.amount) }));

export async function fetchFinancialStatement(
  schoolId: string,
  periodMonth: string,
  branchId: string | null = null,
  client: SupabaseClient = getSupabaseClient(),
): Promise<FinancialStatement> {
  const [statementResult, paymentMethodsResult] = await Promise.all([
    client.rpc("get_financial_statement", {
      target_school_id: schoolId,
      target_period_month: periodMonth,
      target_branch_id: branchId,
    }),
    client.rpc("list_financial_statement_payment_methods", {
      target_school_id: schoolId,
      target_period_month: periodMonth,
      target_branch_id: branchId,
    }),
  ]);
  if (statementResult.error) throw statementResult.error;
  if (paymentMethodsResult.error) throw paymentMethodsResult.error;
  const raw = statementResult.data as any;
  return {
    periodMonth: raw.period_month,
    periodEnd: raw.period_end,
    generatedAt: new Date().toISOString(),
    periodStatus: raw.period_status ?? null,
    scopeComplete: raw.scope_complete === true,
    targetBranchId: raw.target_branch_id ?? null,
    accruals: n(raw.accruals), outstanding: n(raw.outstanding), overdue: n(raw.overdue), collections: n(raw.collections),
    otherIncome: n(raw.other_income), expenses: n(raw.expenses),
    payroll: { accrued: n(raw.payroll?.accrued), paidInPeriod: n(raw.payroll?.paid_in_period), unpaidAtEnd: n(raw.payroll?.unpaid_at_end) },
    operatingResult: n(raw.operating_result),
    cash: {
      openingBalance: n(raw.cash?.opening_balance), openingBalanceEntries: n(raw.cash?.opening_balance_entries),
      inflows: n(raw.cash?.inflows), outflows: n(raw.cash?.outflows), netCash: n(raw.cash?.net_cash), closingBalance: n(raw.cash?.closing_balance),
      manualDeposits: n(raw.cash?.manual_deposits), manualWithdrawals: n(raw.cash?.manual_withdrawals), internalTransfers: n(raw.cash?.internal_transfers),
    },
    branches: (raw.branches ?? []).map((row: any) => ({
      branchId: row.branch_id, branchName: row.branch_name, accruals: n(row.accruals), collections: n(row.collections), otherIncome: n(row.other_income),
      expenses: n(row.expenses), payrollAccrued: n(row.payroll_accrued), payrollPaid: n(row.payroll_paid),
    })),
    categories: { charges: mapBreakdown(raw.categories?.charges), otherIncome: mapBreakdown(raw.categories?.other_income), expenses: mapBreakdown(raw.categories?.expenses) },
    paymentMethods: mapBreakdown((paymentMethodsResult.data as any[] | null)?.map(row => ({ category: row.payment_method, amount: row.amount })) ?? []),
    accounts: (raw.accounts ?? []).map((row: any) => ({
      accountId: row.account_id, accountName: row.account_name, code: row.code, accountType: row.account_type, branchId: row.branch_id ?? null,
      openingBalance: n(row.opening_balance), openingEntries: n(row.opening_entries), inflows: n(row.inflows), outflows: n(row.outflows),
      transfersIn: n(row.transfers_in), transfersOut: n(row.transfers_out), closingBalance: n(row.closing_balance),
    })),
  };
}

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
export function buildFinancialStatementCsv(statement: FinancialStatement) {
  const currency = getActiveCurrency();
  const rows: Array<Array<string | number>> = [
    ["القائمة المالية", statement.periodMonth, "حتى", statement.periodEnd],
    ["تاريخ إنشاء التقرير", statement.generatedAt],
    ["الحالة", statement.periodStatus ?? "غير منشأة"],
    [], ["المؤشر", `القيمة (${currency})`],
    ["الاستحقاقات", statement.accruals], ["المتبقي المستحق", statement.outstanding], ["المتأخر", statement.overdue],
    ["التحصيلات", statement.collections], ["الإيرادات الأخرى", statement.otherIncome], ["المصروفات", statement.expenses],
    ["الرواتب المستحقة", statement.payroll.accrued], ["الرواتب المدفوعة خلال الفترة", statement.payroll.paidInPeriod], ["الرواتب غير المدفوعة عند نهاية الفترة", statement.payroll.unpaidAtEnd],
    ["نتيجة التشغيل", statement.operatingResult], ["رصيد الخزينة الافتتاحي", statement.cash.openingBalance], ["قيود الأرصدة الافتتاحية داخل الفترة", statement.cash.openingBalanceEntries],
    ["التدفقات النقدية الداخلة", statement.cash.inflows], ["التدفقات النقدية الخارجة", statement.cash.outflows], ["صافي النقد", statement.cash.netCash], ["رصيد الخزينة الختامي", statement.cash.closingBalance],
    [], ["التحصيلات حسب وسيلة الدفع", `القيمة (${currency})`],
    ...statement.paymentMethods.map(row => [row.category, row.amount]),
    [], ["حسب الفرع", "استحقاقات", "تحصيلات", "إيرادات أخرى", "مصروفات", "رواتب مستحقة", "رواتب مدفوعة"],
    ...statement.branches.map(row => [row.branchName, row.accruals, row.collections, row.otherIncome, row.expenses, row.payrollAccrued, row.payrollPaid]),
    [], ["الحساب", "الرمز", "الافتتاحي", "قيود افتتاحية", "تدفقات داخلة", "تدفقات خارجة", "تحويلات داخلة", "تحويلات خارجة", "الختامي"],
    ...statement.accounts.map(row => [row.accountName, row.code, row.openingBalance, row.openingEntries, row.inflows, row.outflows, row.transfersIn, row.transfersOut, row.closingBalance]),
  ];
  for (const [title, values] of [["الاستحقاقات حسب التصنيف", statement.categories.charges], ["الإيرادات الأخرى حسب التصنيف", statement.categories.otherIncome], ["المصروفات حسب التصنيف", statement.categories.expenses]] as const) {
    rows.push([], [title, `القيمة (${currency})`], ...values.map(row => [row.category, row.amount]));
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
