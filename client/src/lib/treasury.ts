import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type TreasuryAccountType = "cash" | "bank" | "postal";
export type TreasuryAccountStatus = "active" | "inactive" | "archived";
export type OtherIncomeCategory = "donation" | "grant_subsidy" | "activity" | "rent_asset" | "other";
export type TreasuryPaymentMethod = "cash" | "bank_transfer" | "postal" | "cheque" | "other";
export type TreasuryMovementType =
  | "opening_balance"
  | "student_payment"
  | "other_income"
  | "expense"
  | "payroll_payment"
  | "manual_deposit"
  | "manual_withdrawal"
  | "transfer_in"
  | "transfer_out";

export type TreasuryBranch = { id: string; name: string; isMain: boolean; canManage: boolean };
export type TreasuryAccount = {
  id: string;
  branchId: string | null;
  accountType: TreasuryAccountType;
  name: string;
  code: string;
  accountReference: string | null;
  currency: "DZD";
  status: TreasuryAccountStatus;
  balance: number;
  canManage: boolean;
};
export type TreasuryLinkAccount = Omit<TreasuryAccount, "currency" | "status" | "canManage">;
export type OtherIncomeRow = {
  id: string;
  branchId: string | null;
  treasuryAccountId: string;
  category: OtherIncomeCategory;
  sourceDescription: string;
  amount: number;
  incomeDate: string;
  paymentMethod: TreasuryPaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  status: "recorded" | "reversed";
  createdAt: string;
};
export type TreasuryMovement = {
  id: string;
  accountId: string;
  direction: "in" | "out";
  movementType: TreasuryMovementType;
  amount: number;
  movementDate: string;
  sourceType: string | null;
  sourceId: string | null;
  transferId: string | null;
  referenceNumber: string | null;
  notes: string | null;
  status: "posted" | "reversed";
  createdAt: string;
};
export type TreasuryTransfer = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  transferDate: string;
  referenceNumber: string | null;
  notes: string | null;
  status: "posted" | "reversed";
  createdAt: string;
};
export type TreasuryBootstrap = { canManageSchool: boolean; branches: TreasuryBranch[]; accounts: TreasuryAccount[] };
export type TreasuryWorkspace = TreasuryBootstrap & {
  otherIncome: OtherIncomeRow[];
  movements: TreasuryMovement[];
  transfers: TreasuryTransfer[];
};
export type TreasuryReportSnapshot = {
  otherIncome: Array<Pick<OtherIncomeRow, "id" | "branchId" | "treasuryAccountId" | "category" | "amount" | "incomeDate" | "paymentMethod" | "referenceNumber" | "status">>;
  accounts: Array<Pick<TreasuryAccount, "id" | "branchId" | "accountType" | "name" | "code" | "status" | "balance">>;
  movements: Array<Pick<TreasuryMovement, "id" | "accountId" | "direction" | "movementType" | "amount" | "movementDate" | "sourceType" | "sourceId" | "status">>;
};

type RawBootstrap = { can_manage_school: boolean; branches: any[]; accounts: any[] };
type RawWorkspace = RawBootstrap & { other_income: any[]; movements: any[]; transfers: any[] };
type RawReport = { other_income: any[]; accounts: any[]; movements: any[] };
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

const mapBranch = (row: any): TreasuryBranch => ({ id: row.id, name: row.name, isMain: row.is_main, canManage: row.can_manage });
const mapAccount = (row: any): TreasuryAccount => ({
  id: row.id, branchId: row.branch_id, accountType: row.account_type, name: row.name, code: row.code,
  accountReference: row.account_reference ?? null, currency: row.currency ?? "DZD", status: row.status,
  balance: n(row.balance ?? row.current_balance), canManage: row.can_manage ?? true,
});
const mapIncome = (row: any): OtherIncomeRow => ({
  id: row.id, branchId: row.branch_id, treasuryAccountId: row.treasury_account_id, category: row.category,
  sourceDescription: row.source_description, amount: n(row.amount), incomeDate: row.income_date,
  paymentMethod: row.payment_method, referenceNumber: row.reference_number ?? null, notes: row.notes ?? null,
  status: row.status, createdAt: row.created_at ?? "",
});
const mapMovement = (row: any): TreasuryMovement => ({
  id: row.id, accountId: row.account_id, direction: row.direction, movementType: row.movement_type,
  amount: n(row.amount), movementDate: row.movement_date, sourceType: row.source_type ?? null,
  sourceId: row.source_id ?? null, transferId: row.transfer_id ?? null, referenceNumber: row.reference_number ?? null,
  notes: row.notes ?? null, status: row.status, createdAt: row.created_at ?? "",
});

export async function fetchTreasuryBootstrap(schoolId: string, client: SupabaseClient = getSupabaseClient()): Promise<TreasuryBootstrap> {
  const { data, error } = await client.rpc("get_treasury_bootstrap", { target_school_id: schoolId });
  if (error) throw error;
  const raw = data as RawBootstrap;
  return { canManageSchool: raw.can_manage_school, branches: (raw.branches ?? []).map(mapBranch), accounts: (raw.accounts ?? []).map(mapAccount) };
}

export async function fetchTreasuryWorkspace(schoolId: string, client: SupabaseClient = getSupabaseClient()): Promise<TreasuryWorkspace> {
  const bootstrap = await fetchTreasuryBootstrap(schoolId, client);
  if (bootstrap.accounts.length === 0) return { ...bootstrap, otherIncome: [], movements: [], transfers: [] };
  const { data, error } = await client.rpc("get_treasury_workspace", { target_school_id: schoolId, target_limit: 250 });
  if (error) throw error;
  const raw = data as RawWorkspace;
  return {
    ...bootstrap,
    accounts: (raw.accounts ?? []).map(mapAccount),
    otherIncome: (raw.other_income ?? []).map(mapIncome),
    movements: (raw.movements ?? []).map(mapMovement),
    transfers: (raw.transfers ?? []).map((row: any) => ({
      id: row.id, fromAccountId: row.from_account_id, toAccountId: row.to_account_id,
      amount: n(row.amount), transferDate: row.transfer_date, referenceNumber: row.reference_number ?? null,
      notes: row.notes ?? null, status: row.status, createdAt: row.created_at ?? "",
    })),
  };
}

export async function fetchTreasuryLinkAccounts(schoolId: string, branchId: string | null, client: SupabaseClient = getSupabaseClient()): Promise<TreasuryLinkAccount[]> {
  const { data, error } = await client.rpc("list_treasury_link_accounts", { target_school_id: schoolId, target_transaction_branch_id: branchId });
  if (error) throw error;
  return ((data ?? []) as any[]).map(row => ({
    id: row.id, branchId: row.branch_id, accountType: row.account_type, name: row.name, code: row.code,
    accountReference: row.account_reference ?? null, balance: n(row.current_balance),
  }));
}

export async function createTreasuryAccount(input: { schoolId: string; branchId: string | null; accountType: TreasuryAccountType; name: string; code: string; accountReference?: string; openingBalance: number; openingDate: string }, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("create_treasury_account", {
    target_school_id: input.schoolId, target_branch_id: input.branchId, target_account_type: input.accountType,
    target_name: input.name, target_code: input.code, target_account_reference: input.accountReference?.trim() || null,
    target_opening_balance: input.openingBalance, target_opening_date: input.openingDate,
  });
  if (error) throw error; return data as string;
}
export async function updateTreasuryAccount(schoolId: string, accountId: string, name: string, accountReference: string, status: TreasuryAccountStatus, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("update_treasury_account", { target_school_id: schoolId, target_account_id: accountId, target_name: name, target_account_reference: accountReference.trim() || null, target_status: status });
  if (error) throw error; return data === true;
}
export async function createOtherIncome(input: { schoolId: string; branchId: string | null; accountId: string; category: OtherIncomeCategory; sourceDescription: string; amount: number; incomeDate: string; paymentMethod: TreasuryPaymentMethod; referenceNumber?: string; notes?: string }, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("create_other_income", {
    target_school_id: input.schoolId, target_branch_id: input.branchId, target_account_id: input.accountId,
    target_category: input.category, target_source_description: input.sourceDescription, target_amount: input.amount,
    target_income_date: input.incomeDate, target_payment_method: input.paymentMethod,
    target_reference_number: input.referenceNumber?.trim() || null, target_notes: input.notes?.trim() || null,
  });
  if (error) throw error; return data as string;
}
export async function reverseOtherIncome(schoolId: string, incomeId: string, reason: string, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("reverse_other_income", { target_school_id: schoolId, target_income_id: incomeId, target_reason: reason });
  if (error) throw error; return data === true;
}
export async function recordTreasuryAdjustment(input: { schoolId: string; accountId: string; kind: "manual_deposit" | "manual_withdrawal"; amount: number; date: string; referenceNumber?: string; notes: string }, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("record_treasury_adjustment", {
    target_school_id: input.schoolId, target_account_id: input.accountId, target_kind: input.kind,
    target_amount: input.amount, target_date: input.date, target_reference_number: input.referenceNumber?.trim() || null,
    target_notes: input.notes,
  });
  if (error) throw error; return data as string;
}
export async function reverseTreasuryAdjustment(schoolId: string, movementId: string, reason: string, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("reverse_treasury_adjustment", { target_school_id: schoolId, target_movement_id: movementId, target_reason: reason });
  if (error) throw error; return data === true;
}
export async function recordTreasuryTransfer(input: { schoolId: string; fromAccountId: string; toAccountId: string; amount: number; date: string; referenceNumber?: string; notes?: string }, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("record_treasury_transfer", {
    target_school_id: input.schoolId, target_from_account_id: input.fromAccountId, target_to_account_id: input.toAccountId,
    target_amount: input.amount, target_date: input.date, target_reference_number: input.referenceNumber?.trim() || null,
    target_notes: input.notes?.trim() || null,
  });
  if (error) throw error; return data as string;
}
export async function reverseTreasuryTransfer(schoolId: string, transferId: string, reason: string, client: SupabaseClient = getSupabaseClient()) {
  const { data, error } = await client.rpc("reverse_treasury_transfer", { target_school_id: schoolId, target_transfer_id: transferId, target_reason: reason });
  if (error) throw error; return data === true;
}

export async function fetchTreasuryReportSnapshot(schoolId: string, client: SupabaseClient = getSupabaseClient()): Promise<TreasuryReportSnapshot> {
  const bootstrap = await fetchTreasuryBootstrap(schoolId, client);
  if (bootstrap.accounts.length === 0) return { otherIncome: [], accounts: [], movements: [] };
  const { data, error } = await client.rpc("get_treasury_report_snapshot", { target_school_id: schoolId });
  if (error) throw error;
  const raw = data as RawReport;
  return {
    otherIncome: (raw.other_income ?? []).map((row: any) => ({ id: row.id, branchId: row.branch_id, treasuryAccountId: row.treasury_account_id, category: row.category, amount: n(row.amount), incomeDate: row.income_date, paymentMethod: row.payment_method, referenceNumber: row.reference_number ?? null, status: row.status })),
    accounts: (raw.accounts ?? []).map((row: any) => ({ id: row.id, branchId: row.branch_id, accountType: row.account_type, name: row.name, code: row.code, status: row.status, balance: n(row.balance) })),
    movements: (raw.movements ?? []).map((row: any) => ({ id: row.id, accountId: row.account_id, direction: row.direction, movementType: row.movement_type, amount: n(row.amount), movementDate: row.movement_date, sourceType: row.source_type ?? null, sourceId: row.source_id ?? null, status: row.status })),
  };
}

export const treasuryAccountTypeLabel = (value: TreasuryAccountType) => ({ cash: "صندوق نقدي", bank: "حساب بنكي", postal: "حساب بريدي" }[value]);
export const otherIncomeCategoryLabel = (value: OtherIncomeCategory) => ({ donation: "تبرع", grant_subsidy: "منحة/إعانة", activity: "نشاط", rent_asset: "تأجير أصل", other: "إيراد آخر" }[value]);
export const treasuryMovementLabel = (value: TreasuryMovementType) => ({ opening_balance: "رصيد افتتاحي", student_payment: "دفعة طالب", other_income: "إيراد آخر", expense: "مصروف", payroll_payment: "راتب", manual_deposit: "إيداع يدوي", manual_withdrawal: "سحب يدوي", transfer_in: "تحويل وارد", transfer_out: "تحويل صادر" }[value]);

export function treasuryErrorMessage(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as any).message ?? "") : "";
  if (message.includes("TREASURY_MANAGE_REQUIRED")) return "لا تملك صلاحية إدارة هذا الحساب أو النطاق.";
  if (message.includes("TREASURY_VIEW_REQUIRED")) return "لا تملك صلاحية عرض الخزينة.";
  if (message.includes("TREASURY_ACCOUNT_SCOPE_MISMATCH")) return "الحساب لا يطابق نطاق العملية المالية.";
  if (message.includes("TREASURY_ACCOUNT_NOT_ACTIVE")) return "الحساب غير نشط ولا يقبل حركات جديدة.";
  if (message.includes("TREASURY_ACCOUNT_NONZERO_BALANCE")) return "لا يمكن أرشفة حساب رصيده غير صفري.";
  if (message.includes("duplicate key") || message.includes("23505")) return "يوجد حساب آخر بنفس الرمز.";
  return "تعذر تنفيذ عملية الخزينة. راجع البيانات والصلاحيات.";
}
