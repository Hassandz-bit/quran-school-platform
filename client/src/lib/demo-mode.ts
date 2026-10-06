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

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

export function getDemoErrorMessage(error: unknown): string {
  const safe = error as SafeError;
  const message = safe?.message ?? "";

  if (message.includes("demo_already_active")) {
    return "البيانات التجريبية مفعلة بالفعل لهذه المدرسة.";
  }
  if (message.includes("demo_requires_active_branch")) {
    return "يلزم وجود فرع نشط قبل إنشاء البيانات التجريبية.";
  }
  if (message.includes("demo_cleanup_blocked_teacher_invitation")) {
    return "تعذر مسح العرض لأن معلّمًا تجريبيًا استُخدم في دعوة حساب حقيقية. راجع الدعوات أولًا.";
  }
  if (message.includes("demo_cleanup_blocked_guardian_link")) {
    return "تعذر مسح العرض لأن طالبًا تجريبيًا مرتبط بولي أمر أو دعوة ولي أمر. فك الارتباط أولًا.";
  }
  if (message.includes("demo_cleanup_blocked_real_student_in_demo_class")) {
    return "تعذر مسح العرض لأن طالبًا حقيقيًا أُضيف إلى حلقة تجريبية. انقله إلى حلقة حقيقية أولًا.";
  }
  if (message.includes("demo_cleanup_blocked_real_memorization_with_demo_teacher")) {
    return "تعذر مسح العرض لأن معلّمًا تجريبيًا استُخدم في سجل حفظ لطالب حقيقي.";
  }
  if (message.includes("demo_cleanup_blocked_student_photo")) {
    return "تعذر مسح العرض لأن الطالب التجريبي لديه صورة شخصية. أزل الصورة أو احفظها خارج المنصة ثم أعد المحاولة.";
  }
  if (message.includes("demo_cleanup_blocked_student_documents")) {
    return "تعذر مسح العرض لأن طالبًا تجريبيًا لديه وثائق مرفقة. انقل الوثائق أو احذفها أولًا؛ لم تُحذف.";
  }
  if (message.includes("demo_cleanup_blocked_student_import_history")) {
    return "تعذر مسح العرض لأن سجل استيراد يحتفظ بمرجع إلى طالب تجريبي. راجع سجل الاستيراد أولًا.";
  }
  if (message.includes("demo_cleanup_blocked_real_school_track_result")) {
    return "تعذر مسح العرض لأن نتيجة مسار مدرسي لطالب حقيقي مرتبطة بحلقة تجريبية. صحح ربط النتيجة أولًا.";
  }
  if (message.includes("demo_cleanup_blocked_real_follow_up_note")) {
    return "تعذر مسح العرض لأن ملاحظة متابعة لطالب حقيقي مرتبطة بحلقة أو معلم تجريبي. انقلها أو صحح الربط أولًا.";
  }
  if (message.includes("demo_cleanup_blocked_demo_teacher_payroll")) {
    return "تعذر مسح العرض لأن المعلم التجريبي مرتبط ببيانات موظف أو رواتب. عالج ارتباطات الرواتب أولًا.";
  }
  if (message.includes("demo_cleanup_blocked_related_record") || safe?.code === "23503") {
    return "تعذر مسح العرض لوجود سجل مرتبط غير معروف؛ لم يُحذف شيء. أرسل رمز الخطأ إلى مسؤول الدعم.";
  }
  if (safe?.code === "PGRST202" || message.includes("clear_school_demo_data")) {
    return "إجراء إنهاء العرض غير متاح في قاعدة البيانات بعد. طبّق تحديثات قاعدة البيانات ثم أعد المحاولة.";
  }
  if (safe?.code === "42501" || message.includes("demo_access_denied")) {
    return "هذه العملية متاحة لمدير المدرسة فقط.";
  }

  return "تعذر تنفيذ عملية البيانات التجريبية حاليًا.";
}
