import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";
import { QURAN_SURAHS } from "./memorization.ts";

export const MEMORIZATION_FOLLOW_UP_CATEGORIES = [
  "memorization_error",
  "revision_weakness",
  "tajweed",
  "hesitation",
  "forgetting",
  "recurring_error",
  "other",
] as const;

export const MEMORIZATION_FOLLOW_UP_STATUSES = [
  "open",
  "improved",
  "resolved",
] as const;

export type MemorizationFollowUpCategory =
  (typeof MEMORIZATION_FOLLOW_UP_CATEGORIES)[number];
export type MemorizationFollowUpStatus =
  (typeof MEMORIZATION_FOLLOW_UP_STATUSES)[number];
export type MemorizationFollowUpPriority = 1 | 2 | 3;

export const MEMORIZATION_FOLLOW_UP_CATEGORY_LABELS: Record<
  MemorizationFollowUpCategory,
  string
> = {
  memorization_error: "خطأ في الحفظ",
  revision_weakness: "ضعف في المراجعة",
  tajweed: "تجويد",
  hesitation: "تردد",
  forgetting: "نسيان",
  recurring_error: "خطأ متكرر",
  other: "أخرى",
};

export const MEMORIZATION_FOLLOW_UP_PRIORITY_LABELS: Record<
  MemorizationFollowUpPriority,
  string
> = {
  1: "عالية",
  2: "عادية",
  3: "منخفضة",
};

export const MEMORIZATION_FOLLOW_UP_STATUS_LABELS: Record<
  MemorizationFollowUpStatus,
  string
> = {
  open: "تحتاج متابعة",
  improved: "تحسّن — استمر بالمراقبة",
  resolved: "تمت المعالجة",
};

export type MemorizationFollowUpNote = {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  sourceRecordId: string | null;
  category: MemorizationFollowUpCategory;
  priority: MemorizationFollowUpPriority;
  status: MemorizationFollowUpStatus;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  noteText: string;
  observedOn: string;
  recurrenceCount: number;
  createdBy: string;
  lastModifiedBy: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateMemorizationFollowUpInput = {
  schoolId: string;
  branchId: string;
  classId: string;
  studentId: string;
  teacherId: string;
  sourceRecordId: string | null;
  category: MemorizationFollowUpCategory;
  priority: MemorizationFollowUpPriority;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  noteText: string;
  observedOn: string;
};

export type SetMemorizationFollowUpStatusInput = {
  schoolId: string;
  branchId: string;
  classId: string;
  noteId: string;
  status: MemorizationFollowUpStatus;
};

type FollowUpRow = {
  id: string;
  student_id: string;
  teacher_id: string;
  teacher_name: string;
  source_record_id: string | null;
  category: MemorizationFollowUpCategory;
  priority: number;
  status: MemorizationFollowUpStatus;
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  note_text: string;
  observed_on: string;
  recurrence_count: number | string;
  created_by: string;
  last_modified_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

function isCategory(value: string): value is MemorizationFollowUpCategory {
  return (MEMORIZATION_FOLLOW_UP_CATEGORIES as readonly string[]).includes(value);
}

function isStatus(value: string): value is MemorizationFollowUpStatus {
  return (MEMORIZATION_FOLLOW_UP_STATUSES as readonly string[]).includes(value);
}

function isPriority(value: number): value is MemorizationFollowUpPriority {
  return value === 1 || value === 2 || value === 3;
}

function mapRow(row: FollowUpRow): MemorizationFollowUpNote {
  if (!isCategory(row.category) || !isStatus(row.status) || !isPriority(row.priority)) {
    throw new Error("memorization_follow_up_invalid_server_row");
  }

  return {
    id: row.id,
    studentId: row.student_id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    sourceRecordId: row.source_record_id,
    category: row.category,
    priority: row.priority,
    status: row.status,
    surahNumber: row.surah_number,
    ayahStart: row.ayah_start,
    ayahEnd: row.ayah_end,
    noteText: row.note_text,
    observedOn: row.observed_on,
    recurrenceCount: Number(row.recurrence_count),
    createdBy: row.created_by,
    lastModifiedBy: row.last_modified_by,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateCreateInput(input: CreateMemorizationFollowUpInput): void {
  if (!input.schoolId || !input.branchId || !input.classId || !input.studentId) {
    throw new Error("memorization_follow_up_scope_required");
  }
  if (!input.teacherId) {
    throw new Error("memorization_follow_up_teacher_required");
  }
  if (!isCategory(input.category)) {
    throw new Error("memorization_follow_up_category_invalid");
  }
  if (!isPriority(input.priority)) {
    throw new Error("memorization_follow_up_priority_invalid");
  }

  const surah = QURAN_SURAHS[input.surahNumber - 1];
  if (!surah || surah.number !== input.surahNumber) {
    throw new Error("memorization_follow_up_surah_invalid");
  }
  if (
    !Number.isInteger(input.ayahStart) ||
    !Number.isInteger(input.ayahEnd) ||
    input.ayahStart < 1 ||
    input.ayahEnd < input.ayahStart ||
    input.ayahEnd > surah.ayahCount
  ) {
    throw new Error("memorization_follow_up_ayah_range_invalid");
  }

  const noteText = input.noteText.trim();
  if (noteText.length < 1 || noteText.length > 1000) {
    throw new Error("memorization_follow_up_note_invalid");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.observedOn)) {
    throw new Error("memorization_follow_up_date_invalid");
  }
}

function scopedArgs(
  schoolId: string,
  branchId: string,
  classId: string,
  studentId: string,
  targetLimit: number
) {
  return {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_class_id: classId,
    target_student_id: studentId,
    target_limit: targetLimit,
  };
}

export async function fetchMemorizationFocusNotes(
  schoolId: string,
  branchId: string,
  classId: string,
  studentId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<MemorizationFollowUpNote[]> {
  const { data, error } = await client.rpc("list_memorization_focus_notes", {
    ...scopedArgs(schoolId, branchId, classId, studentId, 20),
  });

  if (error) throw error;
  return ((data ?? []) as FollowUpRow[]).map(mapRow);
}

export async function fetchMemorizationFollowUpHistory(
  schoolId: string,
  branchId: string,
  classId: string,
  studentId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<MemorizationFollowUpNote[]> {
  const { data, error } = await client.rpc(
    "list_memorization_follow_up_history",
    {
      ...scopedArgs(schoolId, branchId, classId, studentId, 100),
    }
  );

  if (error) throw error;
  return ((data ?? []) as FollowUpRow[]).map(mapRow);
}

export async function createMemorizationFollowUpNote(
  input: CreateMemorizationFollowUpInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<string> {
  validateCreateInput(input);

  const { data, error } = await client.rpc("create_memorization_follow_up_note", {
    target_school_id: input.schoolId,
    target_branch_id: input.branchId,
    target_class_id: input.classId,
    target_student_id: input.studentId,
    target_teacher_id: input.teacherId,
    target_source_record_id: input.sourceRecordId,
    target_category: input.category,
    target_priority: input.priority,
    target_surah_number: input.surahNumber,
    target_ayah_start: input.ayahStart,
    target_ayah_end: input.ayahEnd,
    target_note_text: input.noteText.trim(),
    target_observed_on: input.observedOn,
  });

  if (error) throw error;
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("memorization_follow_up_create_failed");
  }
  return data;
}

export async function setMemorizationFollowUpStatus(
  input: SetMemorizationFollowUpStatusInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  if (!input.schoolId || !input.branchId || !input.classId || !input.noteId) {
    throw new Error("memorization_follow_up_scope_required");
  }
  if (!isStatus(input.status)) {
    throw new Error("memorization_follow_up_status_invalid");
  }

  const { data, error } = await client.rpc(
    "set_memorization_follow_up_note_status",
    {
      target_school_id: input.schoolId,
      target_branch_id: input.branchId,
      target_class_id: input.classId,
      target_note_id: input.noteId,
      target_status: input.status,
    }
  );

  if (error) throw error;
  if (data !== true) throw new Error("memorization_follow_up_not_found");
}

export function getMemorizationFollowUpErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";

  if (raw.includes("AUTH_REQUIRED")) return "يجب تسجيل الدخول أولًا.";
  if (raw.includes("MANAGE_REQUIRED")) return "لا تملك صلاحية تعديل نقاط المتابعة في هذه الحلقة.";
  if (raw.includes("VIEW_REQUIRED")) return "لا تملك صلاحية عرض نقاط المتابعة في هذه الحلقة.";
  if (raw.includes("STUDENT_SCOPE_DENIED")) return "الطالب لم يعد ضمن الحلقة النشطة المحددة.";
  if (raw.includes("TEACHER_NOT_ASSIGNED") || raw.includes("teacher_required")) {
    return "يجب اختيار معلم نشط ومعيّن للحلقة.";
  }
  if (raw.includes("TEACHER_IDENTITY_MISMATCH")) {
    return "لا يمكن للمعلم تسجيل الملاحظة باسم معلم آخر.";
  }
  if (raw.includes("CATEGORY_INVALID") || raw.includes("category_invalid")) {
    return "اختر نوع ملاحظة صحيحًا.";
  }
  if (raw.includes("PRIORITY_INVALID") || raw.includes("priority_invalid")) {
    return "اختر أولوية متابعة صحيحة.";
  }
  if (raw.includes("SURAH_INVALID") || raw.includes("surah_invalid")) {
    return "اختر سورة صحيحة.";
  }
  if (raw.includes("AYAH_RANGE_INVALID") || raw.includes("ayah_range_invalid")) {
    return "تحقق من نطاق الآيات المحدد.";
  }
  if (raw.includes("NOTE_INVALID") || raw.includes("note_invalid")) {
    return "اكتب ملاحظة من 1 إلى 1000 حرف.";
  }
  if (raw.includes("SOURCE_RECORD_SCOPE_INVALID")) {
    return "تعذر ربط الملاحظة بسجل التسميع الحالي. أعد تحميل الصفحة ثم حاول مجددًا.";
  }
  if (raw.includes("not_found")) return "تعذر العثور على ملاحظة المتابعة.";

  return "تعذر تنفيذ عملية نقاط المتابعة حاليًا. حاول مرة أخرى.";
}
