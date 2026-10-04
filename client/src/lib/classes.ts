import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type ClassStatus = "active" | "inactive" | "archived";

export type ClassRow = {
  id: string;
  branch_id: string;
  name: string;
  code: string;
  schedule_label: string | null;
  status: ClassStatus;
};

export type ClassBranch = {
  id: string;
  name: string;
  is_main: boolean;
};

export type ClassFormValues = {
  branchId: string;
  name: string;
  code: string;
  scheduleLabel: string;
  status: ClassStatus;
};

export type ClassInsert = {
  school_id: string;
  branch_id: string;
  name: string;
  code: string;
  schedule_label: string | null;
  status: ClassStatus;
};

type BranchLookupOptions = {
  activeOnly?: boolean;
};

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export function normalizeClassCode(value: string): string {
  return value.trim().toUpperCase();
}

export function buildClassInsert(
  schoolId: string,
  values: ClassFormValues
): ClassInsert {
  return {
    school_id: schoolId,
    branch_id: values.branchId.trim(),
    name: values.name.trim(),
    code: normalizeClassCode(values.code),
    schedule_label: optionalText(values.scheduleLabel),
    status: values.status,
  };
}

export async function fetchSchoolClasses(
  schoolId: string
): Promise<ClassRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("classes")
    .select("id, branch_id, name, code, schedule_label, status")
    .eq("school_id", schoolId)
    .order("name", { ascending: true })
    .order("code", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ClassRow[];
}

export async function fetchSchoolBranches(
  schoolId: string,
  { activeOnly = false }: BranchLookupOptions = {}
): Promise<ClassBranch[]> {
  const client = getSupabaseClient();
  let query = client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as ClassBranch[];
}

export async function addClass(
  schoolId: string,
  values: ClassFormValues
): Promise<void> {
  const payload = buildClassInsert(schoolId, values);
  const { error } = await getSupabaseClient().from("classes").insert(payload);

  if (error) throw error;
}

const statusLabels: Record<"ar" | "en", Record<ClassStatus, string>> = {
  ar: {
    active: "نشطة",
    inactive: "غير نشطة",
    archived: "مؤرشفة",
  },
  en: {
    active: "Active",
    inactive: "Inactive",
    archived: "Archived",
  },
};

export function translateClassStatus(
  status: ClassStatus,
  locale: "ar" | "en" = "ar"
): string {
  return statusLabels[locale][status];
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

const saveErrorMessages = {
  ar: {
    duplicate: "رمز الحلقة مستخدم من قبل.",
    permission: "لا تملك صلاحية إضافة الحلقات.",
    general: "تعذر حفظ بيانات الحلقة حاليًا.",
  },
  en: {
    duplicate: "This class code is already in use.",
    permission: "You do not have permission to add classes.",
    general: "The class could not be saved right now.",
  },
} as const;

export function getClassSaveErrorMessage(
  error: unknown,
  locale: "ar" | "en" = "ar"
): string {
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";
  const messages = saveErrorMessages[locale];

  if (code === "23505") {
    return messages.duplicate;
  }

  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return messages.permission;
  }

  return messages.general;
}

export type ClassDetailsStudent = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
};

export type ClassDetailsAssignment = {
  id: string;
  teacherId: string | null;
  teacherName: string | null;
  teacherStatus: string | null;
  assignmentRole: "primary" | "assistant";
  status: "active" | "inactive";
  assignedAt: string;
};

export type ClassDetailsData = {
  classItem: ClassRow;
  branchName: string | null;
  students: ClassDetailsStudent[];
  assignments: ClassDetailsAssignment[];
};

export async function fetchClassDetails(
  schoolId: string,
  classId: string
): Promise<ClassDetailsData | null> {
  const client = getSupabaseClient();
  const { data: classData, error: classError } = await client
    .from("classes")
    .select("id, branch_id, name, code, schedule_label, status")
    .eq("school_id", schoolId)
    .eq("id", classId)
    .maybeSingle();

  if (classError) throw classError;
  if (!classData) return null;

  const classItem = classData as ClassRow;
  const [branchResult, studentsResult, assignmentsResult] = await Promise.all([
    client
      .from("branches")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("id", classItem.branch_id)
      .maybeSingle(),
    client
      .from("students")
      .select("id, first_name, last_name, status")
      .eq("school_id", schoolId)
      .eq("branch_id", classItem.branch_id)
      .eq("class_id", classItem.id)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    client
      .from("class_teachers")
      .select("id, teacher_id, assignment_role, status, assigned_at")
      .eq("school_id", schoolId)
      .eq("branch_id", classItem.branch_id)
      .eq("class_id", classItem.id)
      .order("assigned_at", { ascending: false }),
  ]);

  if (branchResult.error) throw branchResult.error;
  if (studentsResult.error) throw studentsResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const studentRows = (studentsResult.data ?? []) as ClassDetailsStudent[];
  const assignmentRows = (assignmentsResult.data ?? []) as Array<{
    id: string;
    teacher_id: string;
    assignment_role: "primary" | "assistant";
    status: "active" | "inactive";
    assigned_at: string;
  }>;
  const teacherIds = [...new Set(assignmentRows.map(row => row.teacher_id))];
  let teacherRows: Array<{
    id: string;
    first_name: string;
    last_name: string;
    status: string;
  }> = [];

  if (teacherIds.length > 0) {
    const { data, error } = await client
      .from("teachers")
      .select("id, first_name, last_name, status")
      .eq("school_id", schoolId)
      .eq("branch_id", classItem.branch_id)
      .in("id", teacherIds);
    if (error) throw error;
    teacherRows = (data ?? []) as typeof teacherRows;
  }

  const teachersById = new Map(teacherRows.map(row => [row.id, row]));
  const assignments = assignmentRows.map(row => {
    const teacher = teachersById.get(row.teacher_id);
    return {
      id: row.id,
      teacherId: teacher?.id ?? null,
      teacherName: teacher ? `${teacher.first_name} ${teacher.last_name}`.trim() : null,
      teacherStatus: teacher?.status ?? null,
      assignmentRole: row.assignment_role,
      status: row.status,
      assignedAt: row.assigned_at,
    };
  });

  return {
    classItem,
    branchName: branchResult.data?.name ?? null,
    students: studentRows,
    assignments,
  };
}
