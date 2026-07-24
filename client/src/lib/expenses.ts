import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const expenseCategories = [
  "salaries",
  "rent",
  "utilities",
  "maintenance",
  "supplies",
  "transport",
  "activities",
  "other",
] as const;

export const expensePaymentMethods = [
  "cash",
  "bank_transfer",
  "postal",
  "cheque",
  "other",
] as const;

export const expenseStatuses = ["recorded", "cancelled"] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];
export type ExpensePaymentMethod = (typeof expensePaymentMethods)[number];
export type ExpenseStatus = (typeof expenseStatuses)[number];

export type ExpenseRow = {
  id: string;
  school_id: string;
  branch_id: string | null;
  category: ExpenseCategory;
  description: string;
  amount: number | string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  reference_number: string | null;
  status: ExpenseStatus;
  notes: string | null;
  created_at: string;
};

export type ExpenseBranch = {
  id: string;
  name: string;
  is_main: boolean;
};

export type ExpenseAccess = {
  canManageSchoolWide: boolean;
  manageableBranchIds: string[];
};

export type ExpensePageData = {
  expenses: ExpenseRow[];
  branches: ExpenseBranch[];
  access: ExpenseAccess;
};

export type ExpenseFormValues = {
  branchId: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
  referenceNumber: string;
  notes: string;
};

export type ExpenseFormErrors = Partial<
  Record<keyof ExpenseFormValues, string>
>;

export type ExpenseFilters = {
  search: string;
  category: string;
  branch: string;
  status: string;
  paymentMethod: string;
  dateFrom: string;
  dateTo: string;
};

type ExpenseMutation = {
  branch_id: string | null;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  reference_number: string | null;
  notes: string | null;
};

export class ExpensePermissionError extends Error {
  constructor() {
    super("expense_permission_required");
    this.name = "ExpensePermissionError";
  }
}

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const validIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

const hasNoErrors = (errors: ExpenseFormErrors): boolean =>
  Object.keys(errors).length === 0;

export function validateExpenseForm(
  values: ExpenseFormValues
): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  const amount = Number(values.amount);
  const description = values.description.trim();

  if (!expenseCategories.includes(values.category)) {
    errors.category = "تصنيف المصروف غير صالح.";
  }
  if (description.length < 2 || description.length > 250) {
    errors.description = "أدخل وصفًا بين حرفين و250 حرفًا.";
  }
  if (
    values.amount.trim() === "" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 9_999_999_999.99 ||
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(values.amount.trim())
  ) {
    errors.amount = "أدخل مبلغًا موجبًا وبمنزلتين عشريتين كحد أقصى.";
  }
  if (!validIsoDate(values.expenseDate)) {
    errors.expenseDate = "تاريخ المصروف مطلوب.";
  }
  if (!expensePaymentMethods.includes(values.paymentMethod)) {
    errors.paymentMethod = "طريقة الدفع غير صالحة.";
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

export function buildExpenseMutation(
  values: ExpenseFormValues
): ExpenseMutation {
  const errors = validateExpenseForm(values);
  if (!hasNoErrors(errors)) {
    throw new Error("invalid_expense_values");
  }

  return {
    branch_id: values.branchId === "" ? null : values.branchId,
    category: values.category,
    description: values.description.trim(),
    amount: Number(values.amount),
    expense_date: values.expenseDate,
    payment_method: values.paymentMethod,
    reference_number: optionalText(values.referenceNumber),
    notes: optionalText(values.notes),
  };
}

export function canManageExpenseScope(
  branchId: string | null,
  access: ExpenseAccess
): boolean {
  return branchId === null
    ? access.canManageSchoolWide
    : access.manageableBranchIds.includes(branchId);
}

export function canEditExpense(
  expense: Pick<ExpenseRow, "branch_id" | "status">,
  access: ExpenseAccess
): boolean {
  return (
    expense.status === "recorded" &&
    canManageExpenseScope(expense.branch_id, access)
  );
}

export function filterExpenses(
  expenses: ExpenseRow[],
  branches: ExpenseBranch[],
  filters: ExpenseFilters
): ExpenseRow[] {
  const branchNames = new Map(branches.map(branch => [branch.id, branch.name]));
  const query = filters.search.trim().toLocaleLowerCase();

  return expenses.filter(expense => {
    const searchable = [
      expense.description,
      expense.reference_number ?? "",
      expense.notes ?? "",
      expense.branch_id
        ? (branchNames.get(expense.branch_id) ?? "")
        : "مستوى المدرسة عام",
    ]
      .join(" ")
      .toLocaleLowerCase();

    return (
      (query === "" || searchable.includes(query)) &&
      (filters.category === "all" ||
        expense.category === filters.category) &&
      (filters.branch === "all" ||
        (filters.branch === "school"
          ? expense.branch_id === null
          : expense.branch_id === filters.branch)) &&
      (filters.status === "all" || expense.status === filters.status) &&
      (filters.paymentMethod === "all" ||
        expense.payment_method === filters.paymentMethod) &&
      (filters.dateFrom === "" ||
        expense.expense_date >= filters.dateFrom) &&
      (filters.dateTo === "" || expense.expense_date <= filters.dateTo)
    );
  });
}

async function hasSchoolExpensePermission(
  client: SupabaseClient,
  schoolId: string
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: "finance.expenses",
  });
  if (error) throw error;
  return data === true;
}

async function hasBranchExpensePermission(
  client: SupabaseClient,
  schoolId: string,
  branchId: string
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: "finance.expenses",
  });
  if (error) throw error;
  return data === true;
}

export async function fetchExpensePageData(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<ExpensePageData> {
  const { data: branchData, error: branchError } = await client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });
  if (branchError) throw branchError;

  const branches = (branchData ?? []) as ExpenseBranch[];
  const [canManageSchoolWide, branchPermissions] = await Promise.all([
    hasSchoolExpensePermission(client, schoolId),
    Promise.all(
      branches.map(async branch => ({
        branchId: branch.id,
        canManage: await hasBranchExpensePermission(
          client,
          schoolId,
          branch.id
        ),
      }))
    ),
  ]);

  const manageableBranchIds = branchPermissions
    .filter(permission => permission.canManage)
    .map(permission => permission.branchId);
  const access: ExpenseAccess = {
    canManageSchoolWide,
    manageableBranchIds,
  };

  if (!canManageSchoolWide && manageableBranchIds.length === 0) {
    throw new ExpensePermissionError();
  }

  const { data, error } = await client
    .from("expenses")
    .select(
      "id, school_id, branch_id, category, description, amount, expense_date, payment_method, reference_number, status, notes, created_at"
    )
    .eq("school_id", schoolId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const allowedBranches = new Set(manageableBranchIds);
  const expenses = ((data ?? []) as ExpenseRow[]).filter(expense =>
    canManageSchoolWide
      ? true
      : expense.branch_id !== null && allowedBranches.has(expense.branch_id)
  );

  return {
    expenses,
    branches: branches.filter(
      branch =>
        canManageSchoolWide || allowedBranches.has(branch.id)
    ),
    access,
  };
}

export async function addExpense(
  schoolId: string,
  values: ExpenseFormValues,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { error } = await client
    .from("expenses")
    .insert({ school_id: schoolId, ...buildExpenseMutation(values) });
  if (error) throw error;
}

export async function updateExpense(
  schoolId: string,
  expenseId: string,
  values: ExpenseFormValues,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client
    .from("expenses")
    .update(buildExpenseMutation(values))
    .eq("school_id", schoolId)
    .eq("id", expenseId)
    .eq("status", "recorded")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ExpensePermissionError();
}

export async function cancelExpense(
  schoolId: string,
  expenseId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client
    .from("expenses")
    .update({ status: "cancelled" })
    .eq("school_id", schoolId)
    .eq("id", expenseId)
    .eq("status", "recorded")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ExpensePermissionError();
}

const categoryLabels: Record<ExpenseCategory, string> = {
  salaries: "الرواتب",
  rent: "الإيجار",
  utilities: "الخدمات",
  maintenance: "الصيانة",
  supplies: "اللوازم",
  transport: "النقل",
  activities: "الأنشطة",
  other: "أخرى",
};

const methodLabels: Record<ExpensePaymentMethod, string> = {
  cash: "نقدًا",
  bank_transfer: "تحويل بنكي",
  postal: "بريدي",
  cheque: "صك",
  other: "أخرى",
};

export function translateExpenseCategory(
  category: ExpenseCategory
): string {
  return categoryLabels[category];
}

export function translateExpenseMethod(
  method: ExpensePaymentMethod
): string {
  return methodLabels[method];
}

export function translateExpenseStatus(status: ExpenseStatus): string {
  return status === "recorded" ? "مسجل" : "ملغى";
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

export function getExpenseSaveErrorMessage(error: unknown): string {
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (
    error instanceof ExpensePermissionError ||
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "لا تملك صلاحية إدارة المصروف في هذا النطاق.";
  }
  if (code === "23514" || code === "23503") {
    return "تحقق من التصنيف والمبلغ والتاريخ وطريقة الدفع.";
  }
  return "تعذر حفظ المصروف حاليًا.";
}
