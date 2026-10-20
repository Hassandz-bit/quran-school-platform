import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export type DemoStatus = {
  active: boolean;
  batchId: string | null;
  createdAt: string | null;
  studentCount: number;
  teacherCount: number;
  classCount: number;
};

type DemoStatusRow = {
  active: boolean;
  batch_id: string | null;
  created_at: string | null;
  student_count: number | string;
  teacher_count: number | string;
  class_count: number | string;
};

function toCount(value: number | string): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

export async function fetchDemoStatus(schoolId: string): Promise<DemoStatus> {
  const { data, error } = await getSupabaseClient().rpc("get_school_demo_status", {
    target_school_id: schoolId,
  });

  if (error) throw error;
  const row = ((data ?? []) as DemoStatusRow[])[0];

  if (!row) {
    return {
      active: false,
      batchId: null,
      createdAt: null,
      studentCount: 0,
      teacherCount: 0,
      classCount: 0,
    };
  }

  return {
    active: row.active === true,
    batchId: row.batch_id,
    createdAt: row.created_at,
    studentCount: toCount(row.student_count),
    teacherCount: toCount(row.teacher_count),
    classCount: toCount(row.class_count),
  };
}

export async function createDemoData(schoolId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("create_school_demo_data", {
    target_school_id: schoolId,
  });

  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("demo_create_missing_batch");
  }
  return data;
}

export async function clearDemoData(schoolId: string): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc("clear_school_demo_data", {
    target_school_id: schoolId,
  });

  if (error) throw error;
  const count = typeof data === "number" ? data : Number(data);
  return Number.isFinite(count) ? count : 0;
}

type SafeError = Pick<PostgrestError, "code" | "message" | "details" | "hint"> | null | undefined;

function getErrorParts(error: unknown): {
  code: string;
  message: string;
  details: string;
  hint: string;
} {
  if (!error || typeof error !== "object") {
    return { code: "", message: String(error ?? ""), details: "", hint: "" };
  }

  const value = error as Partial<SafeError> & { error_description?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : "",
    message: typeof value.message === "string" ? value.message : "",
    details: typeof value.details === "string" ? value.details : "",
    hint: typeof value.hint === "string" ? value.hint : "",
  };
}

export function getDemoErrorMessage(error: unknown): string {
  const { code, message, details, hint } = getErrorParts(error);
  const combined = [message, details, hint].join(" ");

  // Keep technical diagnostics in the browser console for support, without
  // exposing SQL, row values, or internal database details in the UI.
  console.error("[QuranOS demo cleanup] operation failed", {
    code: code || "unknown",
    message: message || "No backend message returned",
  });

  if (combined.includes("demo_already_active")) {
    return "البيانات التجريبية مفعلة بالفعل لهذه المدرسة.";
  }
  if (combined.includes("demo_requires_active_branch")) {
    return "يلزم وجود فرع نشط قبل إنشاء البيانات التجريبية.";
  }
  if (combined.includes("demo_cleanup_blocked_teacher_invitation")) {
    return "تعذر مسح العرض لأن معلّمًا تجريبيًا استُخدم في دعوة حساب حقيقية. راجع الدعوات أولًا.";
  }
  if (combined.includes("demo_cleanup_blocked_guardian_link")) {
    return "تعذر مسح العرض لأن طالبًا تجريبيًا مرتبط بولي أمر أو دعوة ولي أمر. فك الارتباط أولًا.";
  }
  if (combined.includes("demo_cleanup_blocked_real_student_in_demo_class")) {
    return "تعذر مسح العرض لأن طالبًا حقيقيًا أُضيف إلى حلقة تجريبية. انقله إلى حلقة حقيقية أولًا.";
  }
  if (combined.includes("demo_cleanup_blocked_real_memorization_with_demo_teacher")) {
    return "تعذر مسح العرض لأن معلّمًا تجريبيًا استُخدم في سجل حفظ لطالب حقيقي.";
  }
  if (code === "42501" || combined.includes("demo_access_denied")) {
    return "هذه العملية متاحة لمدير المدرسة فقط.";
  }
  if (code === "23503") {
    return "تعذر إنهاء العرض بسبب ارتباط ببيانات أخرى. لم تُحذف البيانات الحقيقية؛ أرسل رمز الخطأ 23503 للدعم الفني.";
  }
  if (code === "23505") {
    return "تعذر إنهاء العرض بسبب تعارض في سجل قاعدة البيانات. أرسل رمز الخطأ 23505 للدعم الفني.";
  }
  if (code === "23514") {
    return "تعذر إنهاء العرض بسبب شرط تحقق في قاعدة البيانات. أرسل رمز الخطأ 23514 للدعم الفني.";
  }
  if (code === "57014" || code === "statement_timeout") {
    return "استغرقت عملية إنهاء العرض وقتًا أطول من المسموح. أعد المحاولة لاحقًا، وإذا تكرر الخطأ أرسل الرمز 57014 للدعم.";
  }

  return code
    ? `تعذر تنفيذ عملية البيانات التجريبية (رمز الخطأ: ${code}). أرسل الرمز للدعم الفني.`
    : "تعذر تنفيذ عملية البيانات التجريبية حاليًا. افتح أدوات المطور (Console) أو أرسل سجل الخطأ للدعم الفني.";
}
