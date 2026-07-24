import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type ReportChargeStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "waived"
  | "cancelled";
export type ReportPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "postal"
  | "cheque"
  | "other";
export type ReportExpenseCategory =
  | "salaries"
  | "rent"
  | "utilities"
  | "maintenance"
  | "supplies"
  | "transport"
  | "activities"
  | "other";

export type ReportBranch = {
  id: string;
  name: string;
  is_main: boolean;
};

export type ReportCharge = {
  id: string;
  branch_id: string;
  description: string;
  net_amount: number | string;
  due_date: string;
  status: ReportChargeStatus;
};

export type ReportPayment = {
  id: string;
  branch_id: string;
  charge_id: string;
  amount: number | string;
  payment_method: ReportPaymentMethod;
  payment_date: string;
  reference_number: string | null;
  status: "completed" | "reversed";
};

export type ReportExpense = {
  id: string;
  branch_id: string | null;
  category: ReportExpenseCategory;
  description: string;
  amount: number | string;
  expense_date: string;
  payment_method: ReportPaymentMethod;
  reference_number: string | null;
  status: "recorded" | "cancelled";
};

export type FinancialReportAccess = {
  canViewFinance: boolean;
  canViewExpenses: boolean;
  financeBranchIds: string[];
  expenseBranchIds: string[];
  canViewExpensesSchoolWide: boolean;
};

export type FinancialReportPageData = {
  branches: ReportBranch[];
  charges: ReportCharge[];
  payments: ReportPayment[];
  expenses: ReportExpense[];
  access: FinancialReportAccess;
};

export type FinancialReportFilters = {
  dateFrom: string;
  dateTo: string;
  branch: string;
  chargeStatus: string;
  paymentMethod: string;
  expenseCategory: string;
};

export type OverdueRow = {
  charge: ReportCharge;
  paid: number;
  outstanding: number;
};

export type BranchSummary = {
  key: string;
  label: string;
  due: number;
  collected: number;
  expenses: number;
  net: number;
};

export type MonthSummary = {
  month: string;
  due: number;
  collected: number;
  expenses: number;
  net: number;
};

export type AmountSummary = {
  key: string;
  count: number;
  amount: number;
};

export type FinancialReports = {
  charges: ReportCharge[];
  payments: ReportPayment[];
  overdue: OverdueRow[];
  expenses: ReportExpense[];
  dueTotal: number;
  collectedTotal: number;
  overdueTotal: number;
  expenseTotal: number;
  netFlow: number;
  byBranch: BranchSummary[];
  byMonth: MonthSummary[];
  byChargeStatus: AmountSummary[];
  byPaymentMethod: AmountSummary[];
  byExpenseCategory: AmountSummary[];
};

export class FinancialReportPermissionError extends Error {
  constructor() {
    super("financial_report_permission_required");
    this.name = "FinancialReportPermissionError";
  }
}

const toAmount = (value: number | string): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const sum = <T>(rows: T[], amount: (row: T) => number): number =>
  roundCurrency(rows.reduce((total, row) => total + amount(row), 0));

const inDateRange = (
  value: string,
  from: string,
  to: string
): boolean => (from === "" || value >= from) && (to === "" || value <= to);

const matchesBranch = (
  branchId: string | null,
  filter: string
): boolean =>
  filter === "all" ||
  (filter === "school" ? branchId === null : branchId === filter);

const countedChargeAmount = (charge: ReportCharge): number =>
  ["waived", "cancelled"].includes(charge.status)
    ? 0
    : toAmount(charge.net_amount);

const monthKey = (date: string): string => date.slice(0, 7);

export function buildFinancialReports(
  data: FinancialReportPageData,
  filters: FinancialReportFilters,
  currentDate: string
): FinancialReports {
  const charges = data.charges.filter(
    charge =>
      inDateRange(charge.due_date, filters.dateFrom, filters.dateTo) &&
      matchesBranch(charge.branch_id, filters.branch) &&
      (filters.chargeStatus === "all" ||
        charge.status === filters.chargeStatus)
  );
  const payments = data.payments.filter(
    payment =>
      inDateRange(payment.payment_date, filters.dateFrom, filters.dateTo) &&
      matchesBranch(payment.branch_id, filters.branch) &&
      (filters.paymentMethod === "all" ||
        payment.payment_method === filters.paymentMethod)
  );
  const expenses = data.expenses.filter(
    expense =>
      inDateRange(expense.expense_date, filters.dateFrom, filters.dateTo) &&
      matchesBranch(expense.branch_id, filters.branch) &&
      (filters.paymentMethod === "all" ||
        expense.payment_method === filters.paymentMethod) &&
      (filters.expenseCategory === "all" ||
        expense.category === filters.expenseCategory)
  );

  const completedPayments = payments.filter(
    payment => payment.status === "completed"
  );
  const recordedExpenses = expenses.filter(
    expense => expense.status === "recorded"
  );
  const allCompletedByCharge = new Map<string, number>();
  data.payments.forEach(payment => {
    if (payment.status !== "completed") return;
    allCompletedByCharge.set(
      payment.charge_id,
      roundCurrency(
        (allCompletedByCharge.get(payment.charge_id) ?? 0) +
          toAmount(payment.amount)
      )
    );
  });

  const overdue = charges
    .filter(
      charge =>
        ["pending", "partially_paid"].includes(charge.status) &&
        charge.due_date < currentDate
    )
    .map(charge => {
      const paid = allCompletedByCharge.get(charge.id) ?? 0;
      return {
        charge,
        paid,
        outstanding: Math.max(
          roundCurrency(toAmount(charge.net_amount) - paid),
          0
        ),
      };
    })
    .filter(row => row.outstanding > 0);

  const dueTotal = sum(charges, countedChargeAmount);
  const collectedTotal = sum(completedPayments, row => toAmount(row.amount));
  const overdueTotal = sum(overdue, row => row.outstanding);
  const expenseTotal = sum(recordedExpenses, row => toAmount(row.amount));

  const branchNames = new Map(
    data.branches.map(branch => [branch.id, branch.name])
  );
  const branchMap = new Map<string, BranchSummary>();
  const ensureBranch = (branchId: string | null): BranchSummary => {
    const key = branchId ?? "school";
    const existing = branchMap.get(key);
    if (existing) return existing;
    const created: BranchSummary = {
      key,
      label:
        branchId === null
          ? "مستوى المدرسة"
          : (branchNames.get(branchId) ?? "فرع غير متاح"),
      due: 0,
      collected: 0,
      expenses: 0,
      net: 0,
    };
    branchMap.set(key, created);
    return created;
  };
  charges.forEach(charge => {
    ensureBranch(charge.branch_id).due += countedChargeAmount(charge);
  });
  completedPayments.forEach(payment => {
    ensureBranch(payment.branch_id).collected += toAmount(payment.amount);
  });
  recordedExpenses.forEach(expense => {
    ensureBranch(expense.branch_id).expenses += toAmount(expense.amount);
  });
  const byBranch = [...branchMap.values()]
    .map(item => ({
      ...item,
      due: roundCurrency(item.due),
      collected: roundCurrency(item.collected),
      expenses: roundCurrency(item.expenses),
      net: roundCurrency(item.collected - item.expenses),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));

  const monthMap = new Map<string, MonthSummary>();
  const ensureMonth = (month: string): MonthSummary => {
    const existing = monthMap.get(month);
    if (existing) return existing;
    const created = { month, due: 0, collected: 0, expenses: 0, net: 0 };
    monthMap.set(month, created);
    return created;
  };
  charges.forEach(charge => {
    ensureMonth(monthKey(charge.due_date)).due +=
      countedChargeAmount(charge);
  });
  completedPayments.forEach(payment => {
    ensureMonth(monthKey(payment.payment_date)).collected += toAmount(
      payment.amount
    );
  });
  recordedExpenses.forEach(expense => {
    ensureMonth(monthKey(expense.expense_date)).expenses += toAmount(
      expense.amount
    );
  });
  const byMonth = [...monthMap.values()]
    .map(item => ({
      ...item,
      due: roundCurrency(item.due),
      collected: roundCurrency(item.collected),
      expenses: roundCurrency(item.expenses),
      net: roundCurrency(item.collected - item.expenses),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const summarize = <T>(
    rows: T[],
    key: (row: T) => string,
    amount: (row: T) => number
  ): AmountSummary[] => {
    const map = new Map<string, AmountSummary>();
    rows.forEach(row => {
      const itemKey = key(row);
      const item = map.get(itemKey) ?? {
        key: itemKey,
        count: 0,
        amount: 0,
      };
      item.count += 1;
      item.amount += amount(row);
      map.set(itemKey, item);
    });
    return [...map.values()]
      .map(item => ({ ...item, amount: roundCurrency(item.amount) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  };

  return {
    charges,
    payments,
    overdue,
    expenses,
    dueTotal,
    collectedTotal,
    overdueTotal,
    expenseTotal,
    netFlow: roundCurrency(collectedTotal - expenseTotal),
    byBranch,
    byMonth,
    byChargeStatus: summarize(
      charges,
      charge => charge.status,
      countedChargeAmount
    ),
    byPaymentMethod: summarize(
      completedPayments,
      payment => payment.payment_method,
      payment => toAmount(payment.amount)
    ),
    byExpenseCategory: summarize(
      recordedExpenses,
      expense => expense.category,
      expense => toAmount(expense.amount)
    ),
  };
}

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permissionCode: "finance.view" | "finance.manage" | "finance.expenses"
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
  permissionCode: "finance.view" | "finance.manage" | "finance.expenses"
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: permissionCode,
  });
  if (error) throw error;
  return data === true;
}

export async function fetchFinancialReportData(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<FinancialReportPageData> {
  const { data: branchData, error: branchError } = await client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });
  if (branchError) throw branchError;
  const branches = (branchData ?? []) as ReportBranch[];

  const [schoolView, schoolManage, schoolExpenses, branchAccess] =
    await Promise.all([
      hasSchoolPermission(client, schoolId, "finance.view"),
      hasSchoolPermission(client, schoolId, "finance.manage"),
      hasSchoolPermission(client, schoolId, "finance.expenses"),
      Promise.all(
        branches.map(async branch => {
          const [view, manage, expenses] = await Promise.all([
            hasBranchPermission(
              client,
              schoolId,
              branch.id,
              "finance.view"
            ),
            hasBranchPermission(
              client,
              schoolId,
              branch.id,
              "finance.manage"
            ),
            hasBranchPermission(
              client,
              schoolId,
              branch.id,
              "finance.expenses"
            ),
          ]);
          return {
            branchId: branch.id,
            finance: view || manage,
            expenses,
          };
        })
      ),
    ]);

  const financeBranchIds = branchAccess
    .filter(item => schoolView || schoolManage || item.finance)
    .map(item => item.branchId);
  const expenseBranchIds = branchAccess
    .filter(item => schoolExpenses || item.expenses)
    .map(item => item.branchId);
  const access: FinancialReportAccess = {
    canViewFinance:
      schoolView || schoolManage || financeBranchIds.length > 0,
    canViewExpenses:
      schoolExpenses || expenseBranchIds.length > 0,
    financeBranchIds,
    expenseBranchIds,
    canViewExpensesSchoolWide: schoolExpenses,
  };
  if (!access.canViewFinance && !access.canViewExpenses) {
    throw new FinancialReportPermissionError();
  }

  let charges: ReportCharge[] = [];
  let payments: ReportPayment[] = [];
  let expenses: ReportExpense[] = [];

  if (access.canViewFinance) {
    const [chargeResult, paymentResult] = await Promise.all([
      client
        .from("student_charges")
        .select("id, branch_id, description, net_amount, due_date, status")
        .eq("school_id", schoolId)
        .order("due_date", { ascending: false }),
      client
        .from("payments")
        .select(
          "id, branch_id, charge_id, amount, payment_method, payment_date, reference_number, status"
        )
        .eq("school_id", schoolId)
        .order("payment_date", { ascending: false }),
    ]);
    if (chargeResult.error || paymentResult.error) {
      throw new Error("financial_reports_load_failed");
    }
    const allowed = new Set(financeBranchIds);
    charges = ((chargeResult.data ?? []) as ReportCharge[]).filter(row =>
      allowed.has(row.branch_id)
    );
    payments = ((paymentResult.data ?? []) as ReportPayment[]).filter(row =>
      allowed.has(row.branch_id)
    );
  }

  if (access.canViewExpenses) {
    const expenseResult = await client
      .from("expenses")
      .select(
        "id, branch_id, category, description, amount, expense_date, payment_method, reference_number, status"
      )
      .eq("school_id", schoolId)
      .order("expense_date", { ascending: false });
    if (expenseResult.error) {
      throw new Error("financial_reports_expenses_load_failed");
    }
    const allowed = new Set(expenseBranchIds);
    expenses = ((expenseResult.data ?? []) as ReportExpense[]).filter(row =>
      row.branch_id === null
        ? schoolExpenses
        : allowed.has(row.branch_id)
    );
  }

  return { branches, charges, payments, expenses, access };
}

const escapeCsv = (value: string | number): string => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildFinancialReportCsv(
  report:
    | "charges"
    | "payments"
    | "overdue"
    | "expenses"
    | "cashflow",
  data: FinancialReports,
  branches: ReportBranch[]
): string {
  const branchNames = new Map(
    branches.map(branch => [branch.id, branch.name])
  );
  const rows: Array<Array<string | number>> = [];

  if (report === "charges") {
    rows.push(["الوصف", "الفرع", "تاريخ الاستحقاق", "الحالة", "صافي المبلغ"]);
    data.charges.forEach(row =>
      rows.push([
        row.description,
        branchNames.get(row.branch_id) ?? "",
        row.due_date,
        row.status,
        row.net_amount,
      ])
    );
  } else if (report === "payments") {
    rows.push(["الفرع", "التاريخ", "الطريقة", "الحالة", "المرجع", "المبلغ"]);
    data.payments.forEach(row =>
      rows.push([
        branchNames.get(row.branch_id) ?? "",
        row.payment_date,
        row.payment_method,
        row.status,
        row.reference_number ?? "",
        row.amount,
      ])
    );
  } else if (report === "overdue") {
    rows.push([
      "الوصف",
      "الفرع",
      "تاريخ الاستحقاق",
      "صافي الاستحقاق",
      "المسدد",
      "المتأخر",
    ]);
    data.overdue.forEach(row =>
      rows.push([
        row.charge.description,
        branchNames.get(row.charge.branch_id) ?? "",
        row.charge.due_date,
        row.charge.net_amount,
        row.paid,
        row.outstanding,
      ])
    );
  } else if (report === "expenses") {
    rows.push(["الوصف", "النطاق", "التاريخ", "التصنيف", "الحالة", "المبلغ"]);
    data.expenses.forEach(row =>
      rows.push([
        row.description,
        row.branch_id === null
          ? "مستوى المدرسة"
          : (branchNames.get(row.branch_id) ?? ""),
        row.expense_date,
        row.category,
        row.status,
        row.amount,
      ])
    );
  } else {
    rows.push(["البيان", "المبلغ"]);
    rows.push(["التحصيلات المكتملة", data.collectedTotal]);
    rows.push(["المصروفات المسجلة", data.expenseTotal]);
    rows.push(["صافي التدفق", data.netFlow]);
  }

  return `\uFEFF${rows
    .map(row => row.map(escapeCsv).join(","))
    .join("\r\n")}`;
}
