import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";
import type { AppLocale } from "./locale.ts";
import { DEFAULT_CURRENCY, normalizeCurrency, type CurrencyCode } from "./currency.ts";

export type OfficialReceiptType = "payment" | "registration";
export type OfficialReceiptStatus = "issued" | "reversed";

export type OfficialReceipt = {
  receiptId: string;
  schoolId: string;
  branchId: string;
  studentId: string;
  receiptType: OfficialReceiptType;
  sequenceNumber: number;
  receiptNumber: string;
  paymentId: string | null;
  chargeId: string | null;
  enrollmentStartDate: string | null;
  schoolName: string;
  branchName: string;
  studentName: string;
  guardianName: string | null;
  issuerName: string;
  chargeType: string | null;
  description: string | null;
  amount: number | null;
  currency: CurrencyCode;
  paymentMethod: string | null;
  paymentDate: string | null;
  paymentReference: string | null;
  receiptStatus: OfficialReceiptStatus;
  issuedAt: string;
  reversedAt: string | null;
};

export type OfficialReceiptListItem = Pick<
  OfficialReceipt,
  | "receiptId"
  | "receiptType"
  | "receiptNumber"
  | "studentId"
  | "studentName"
  | "branchId"
  | "branchName"
  | "description"
  | "amount"
  | "receiptStatus"
  | "issuedAt"
  | "paymentId"
  | "enrollmentStartDate"
>;

export type OfficialReceiptAccess = {
  canViewPaymentReceipts: boolean;
  canIssuePaymentReceipts: boolean;
  canIssueRegistrationReceipts: boolean;
};

export type RegistrationReceiptStudent = {
  studentId: string;
  branchId: string;
  studentName: string;
  guardianName: string;
  enrollmentStartDate: string;
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapReceipt = (row: Record<string, unknown>): OfficialReceipt => ({
  receiptId: String(row.receipt_id),
  schoolId: String(row.school_id),
  branchId: String(row.branch_id),
  studentId: String(row.student_id),
  receiptType: row.receipt_type as OfficialReceiptType,
  sequenceNumber: Number(row.sequence_number),
  receiptNumber: String(row.receipt_number),
  paymentId: row.payment_id ? String(row.payment_id) : null,
  chargeId: row.charge_id ? String(row.charge_id) : null,
  enrollmentStartDate: row.enrollment_start_date
    ? String(row.enrollment_start_date)
    : null,
  schoolName: String(row.school_name),
  branchName: String(row.branch_name),
  studentName: String(row.student_name),
  guardianName: row.guardian_name ? String(row.guardian_name) : null,
  issuerName: String(row.issuer_name),
  chargeType: row.charge_type ? String(row.charge_type) : null,
  description: row.description ? String(row.description) : null,
  amount: asNumber(row.amount),
  currency: normalizeCurrency(row.currency),
  paymentMethod: row.payment_method ? String(row.payment_method) : null,
  paymentDate: row.payment_date ? String(row.payment_date) : null,
  paymentReference: row.payment_reference ? String(row.payment_reference) : null,
  receiptStatus: row.receipt_status as OfficialReceiptStatus,
  issuedAt: String(row.issued_at),
  reversedAt: row.reversed_at ? String(row.reversed_at) : null,
});

export async function fetchOfficialReceiptAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<OfficialReceiptAccess> {
  const { data, error } = await client.rpc("get_official_receipt_access", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    canViewPaymentReceipts: row?.can_view_payment_receipts === true,
    canIssuePaymentReceipts: row?.can_issue_payment_receipts === true,
    canIssueRegistrationReceipts: row?.can_issue_registration_receipts === true,
  };
}

export async function issuePaymentReceipt(
  paymentId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<OfficialReceipt> {
  const { data: receiptId, error } = await client.rpc("issue_payment_receipt", {
    target_payment_id: paymentId,
  });
  if (error) throw error;
  if (!receiptId) throw new Error("receipt_issue_failed");
  return fetchOfficialReceipt(String(receiptId), client);
}

export async function issueRegistrationReceipt(
  studentId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<OfficialReceipt> {
  const { data: receiptId, error } = await client.rpc(
    "issue_registration_receipt",
    { target_student_id: studentId }
  );
  if (error) throw error;
  if (!receiptId) throw new Error("receipt_issue_failed");
  return fetchOfficialReceipt(String(receiptId), client);
}

export async function fetchOfficialReceipt(
  receiptId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<OfficialReceipt> {
  const { data, error } = await client.rpc("get_official_receipt", {
    target_receipt_id: receiptId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("receipt_not_found");
  return mapReceipt(row as Record<string, unknown>);
}

export async function listOfficialReceipts(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<OfficialReceiptListItem[]> {
  const { data, error } = await client.rpc("list_my_official_receipts", {
    target_school_id: schoolId,
    target_limit: 500,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    receiptId: String(row.receipt_id),
    receiptType: row.receipt_type as OfficialReceiptType,
    receiptNumber: String(row.receipt_number),
    studentId: String(row.student_id),
    studentName: String(row.student_name),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    description: row.description ? String(row.description) : null,
    amount: asNumber(row.amount),
    receiptStatus: row.receipt_status as OfficialReceiptStatus,
    issuedAt: String(row.issued_at),
    paymentId: row.payment_id ? String(row.payment_id) : null,
    enrollmentStartDate: row.enrollment_start_date
      ? String(row.enrollment_start_date)
      : null,
  }));
}

export async function listRegistrationReceiptStudents(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<RegistrationReceiptStudent[]> {
  const { data, error } = await client.rpc("list_registration_receipt_students", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    studentId: String(row.student_id),
    branchId: String(row.branch_id),
    studentName: String(row.student_name),
    guardianName: String(row.guardian_name),
    enrollmentStartDate: String(row.enrollment_start_date),
  }));
}

export function getReceiptErrorMessage(error: unknown, locale: AppLocale): string {
  const text =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";

  if (text.includes("official_receipt_demo_record")) {
    return locale === "ar"
      ? "لا تُصدر أرقام وصولات رسمية لبيانات Demo. استخدم بيانات حقيقية."
      : "Official receipt numbers are not issued for Demo data. Use real records.";
  }
  if (text.includes("receipt issue denied") || text.includes("42501")) {
    return locale === "ar"
      ? "لا تملك صلاحية إصدار هذا الوصل."
      : "You do not have permission to issue this receipt.";
  }
  return locale === "ar"
    ? "تعذر تجهيز الوصل حاليًا. حاول مرة أخرى."
    : "The receipt could not be prepared. Please try again.";
}

const AR_SMALL = [
  "صفر",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
] as const;

const AR_TENS: Record<number, string> = {
  20: "عشرون",
  30: "ثلاثون",
  40: "أربعون",
  50: "خمسون",
  60: "ستون",
  70: "سبعون",
  80: "ثمانون",
  90: "تسعون",
};

const AR_HUNDREDS: Record<number, string> = {
  1: "مائة",
  2: "مائتان",
  3: "ثلاثمائة",
  4: "أربعمائة",
  5: "خمسمائة",
  6: "ستمائة",
  7: "سبعمائة",
  8: "ثمانمائة",
  9: "تسعمائة",
};

function arUnder1000(value: number): string {
  if (value < 20) return AR_SMALL[value];
  if (value < 100) {
    const tens = Math.floor(value / 10) * 10;
    const ones = value % 10;
    return ones === 0 ? AR_TENS[tens] : `${AR_SMALL[ones]} و${AR_TENS[tens]}`;
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return rest === 0
    ? AR_HUNDREDS[hundreds]
    : `${AR_HUNDREDS[hundreds]} و${arUnder1000(rest)}`;
}

function arScale(value: number, singular: string, dual: string, plural: string): string {
  if (value === 1) return singular;
  if (value === 2) return dual;
  if (value >= 3 && value <= 10) return `${arUnder1000(value)} ${plural}`;
  return `${arUnder1000(value)} ${singular}`;
}

function integerToArabicWords(value: number): string {
  if (value === 0) return AR_SMALL[0];
  const groups = [
    { size: 1_000_000_000, singular: "مليار", dual: "ملياران", plural: "مليارات" },
    { size: 1_000_000, singular: "مليون", dual: "مليونان", plural: "ملايين" },
    { size: 1_000, singular: "ألف", dual: "ألفان", plural: "آلاف" },
  ];
  let remaining = value;
  const parts: string[] = [];
  for (const group of groups) {
    const count = Math.floor(remaining / group.size);
    if (count > 0) {
      parts.push(arScale(count, group.singular, group.dual, group.plural));
      remaining %= group.size;
    }
  }
  if (remaining > 0) parts.push(arUnder1000(remaining));
  return parts.join(" و");
}

const EN_SMALL = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
] as const;
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"] as const;

function enUnder1000(value: number): string {
  if (value < 20) return EN_SMALL[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return ones === 0 ? EN_TENS[tens] : `${EN_TENS[tens]}-${EN_SMALL[ones]}`;
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return rest === 0
    ? `${EN_SMALL[hundreds]} hundred`
    : `${EN_SMALL[hundreds]} hundred and ${enUnder1000(rest)}`;
}

function integerToEnglishWords(value: number): string {
  if (value === 0) return EN_SMALL[0];
  const groups = [
    { size: 1_000_000_000, name: "billion" },
    { size: 1_000_000, name: "million" },
    { size: 1_000, name: "thousand" },
  ];
  let remaining = value;
  const parts: string[] = [];
  for (const group of groups) {
    const count = Math.floor(remaining / group.size);
    if (count > 0) {
      parts.push(`${enUnder1000(count)} ${group.name}`);
      remaining %= group.size;
    }
  }
  if (remaining > 0) parts.push(enUnder1000(remaining));
  return parts.join(" ");
}

export function amountToWords(
  amount: number,
  locale: AppLocale,
  currency: CurrencyCode = DEFAULT_CURRENCY
): string {
  const normalized = Math.max(0, Math.round(amount * 100) / 100);
  const dinars = Math.floor(normalized);
  const centimes = Math.round((normalized - dinars) * 100);

  if (currency !== "DZD") {
    const currencyName = new Intl.DisplayNames(
      [locale === "ar" ? "ar-DZ" : "en"],
      { type: "currency" }
    ).of(currency) ?? currency;
    const integerWords = locale === "ar"
      ? integerToArabicWords(dinars)
      : integerToEnglishWords(dinars);
    const fraction = centimes === 0
      ? ""
      : ` ${centimes.toString().padStart(2, "0")}/100`;
    return `${integerWords} ${currencyName}${fraction}`;
  }

  if (locale === "en") {
    const dinarWords = `${integerToEnglishWords(dinars)} Algerian dinar${dinars === 1 ? "" : "s"}`;
    return centimes === 0
      ? dinarWords
      : `${dinarWords} and ${integerToEnglishWords(centimes)} centime${centimes === 1 ? "" : "s"}`;
  }

  const dinarWords = `${integerToArabicWords(dinars)} دينار جزائري`;
  return centimes === 0
    ? dinarWords
    : `${dinarWords} و${integerToArabicWords(centimes)} سنتيم`;
}
