import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

type StudentChargeRow = {
  id: string;
  net_amount: number | string;
  status: string;
};

type PaymentRow = {
  id: string;
  amount: number | string;
  status: string;
};

type ExpenseRow = {
  id: string;
  amount: number | string;
  status: string;
};

type FinanceBranch = {
  id: string;
};

export type FinanceAccess = {
  canView: boolean;
  canManage: boolean;
  canViewExpenses: boolean;
};

export type FinanceDashboardData = FinanceAccess & {
  dueFees: number;
  collected: number;
  remaining: number;
  expenses: number;
  chargeCount: number;
  paymentCount: number;
  expenseCount: number;
  hasData: boolean;
};

export class FinancePermissionError extends Error {
  constructor() {
    super("finance_permission_required");
    this.name = "FinancePermissionError";
  }
}

const toAmount = (value: number | string): number => {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const sumAmounts = <T extends { amount: number | string }>(rows: T[]) =>
  rows.reduce((total, row) => total + toAmount(row.amount), 0);

export function buildFinanceDashboardData(
  charges: StudentChargeRow[],
  payments: PaymentRow[],
  expenses: ExpenseRow[],
  access: FinanceAccess
): FinanceDashboardData {
  const activeCharges = charges.filter(
    charge => !["waived", "cancelled"].includes(charge.status)
  );
  const completedPayments = payments.filter(
    payment => payment.status === "completed"
  );
  const recordedExpenses = expenses.filter(
    expense => expense.status === "recorded"
  );
  const dueFees = activeCharges.reduce(
    (total, charge) => total + toAmount(charge.net_amount),
    0
  );
  const collected = sumAmounts(completedPayments);

  return {
    ...access,
    dueFees,
    collected,
    remaining: Math.max(dueFees - collected, 0),
    expenses: sumAmounts(recordedExpenses),
    chargeCount: charges.length,
    paymentCount: payments.length,
    expenseCount: expenses.length,
    hasData: charges.length + payments.length + expenses.length > 0,
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

export async function fetchFinanceAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<FinanceAccess> {
  const [schoolView, schoolManage, schoolExpenses] = await Promise.all([
    hasSchoolPermission(client, schoolId, "finance.view"),
    hasSchoolPermission(client, schoolId, "finance.manage"),
    hasSchoolPermission(client, schoolId, "finance.expenses"),
  ]);

  const { data: branchData, error: branchError } = await client
    .from("branches")
    .select("id")
    .eq("school_id", schoolId);

  if (branchError) throw branchError;
  const branches = (branchData ?? []) as FinanceBranch[];
  const branchAccess = await Promise.all(
    branches.map(async branch => {
      const [canView, canManage, canViewExpenses] = await Promise.all([
        hasBranchPermission(client, schoolId, branch.id, "finance.view"),
        hasBranchPermission(client, schoolId, branch.id, "finance.manage"),
        hasBranchPermission(client, schoolId, branch.id, "finance.expenses"),
      ]);

      return {
        canView: canView || canManage,
        canManage,
        canViewExpenses,
      };
    })
  );

  return {
    canView:
      schoolView ||
      schoolManage ||
      branchAccess.some(access => access.canView),
    canManage:
      schoolManage || branchAccess.some(access => access.canManage),
    canViewExpenses:
      schoolExpenses ||
      branchAccess.some(access => access.canViewExpenses),
  };
}

export async function fetchFinanceDashboard(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<FinanceDashboardData> {
  const access = await fetchFinanceAccess(schoolId, client);

  if (!access.canView && !access.canViewExpenses) {
    throw new FinancePermissionError();
  }

  let charges: StudentChargeRow[] = [];
  let payments: PaymentRow[] = [];
  let expenses: ExpenseRow[] = [];

  if (access.canView) {
    const [chargesResult, paymentsResult] = await Promise.all([
      client
        .from("student_charges")
        .select("id, net_amount, status")
        .eq("school_id", schoolId),
      client
        .from("payments")
        .select("id, amount, status")
        .eq("school_id", schoolId),
    ]);
    if (chargesResult.error || paymentsResult.error) {
      throw new Error("finance_dashboard_load_failed");
    }
    charges = (chargesResult.data ?? []) as StudentChargeRow[];
    payments = (paymentsResult.data ?? []) as PaymentRow[];
  }

  if (access.canViewExpenses) {
    const expensesResult = await client
      .from("expenses")
      .select("id, amount, status")
      .eq("school_id", schoolId);
    if (expensesResult.error) {
      throw new Error("finance_dashboard_expenses_load_failed");
    }
    expenses = (expensesResult.data ?? []) as ExpenseRow[];
  }

  return buildFinanceDashboardData(
    charges,
    payments,
    expenses,
    access
  );
}

export function formatDzd(amount: number): string {
  return new Intl.NumberFormat("ar-DZ", {
    style: "currency",
    currency: "DZD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
