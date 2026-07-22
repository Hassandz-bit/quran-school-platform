import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type TeacherStatus = "active" | "inactive" | "on_leave" | "archived";

export type TeacherGender = "male" | "female";

export type TeacherRow = {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  gender: TeacherGender;
  phone: string | null;
  email: string | null;
  specialization: string | null;
  qualification: string | null;
  hire_date: string;
  status: TeacherStatus;
};

export type TeacherBranch = {
  id: string;
  name: string;
  is_main: boolean;
};

export type TeacherFormValues = {
  branchId: string;
  firstName: string;
  lastName: string;
  gender: TeacherGender | "";
  phone: string;
  email: string;
  specialization: string;
  qualification: string;
  hireDate: string;
  status: TeacherStatus;
  notes: string;
};

export type TeacherInsert = {
  school_id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  gender: TeacherGender;
  phone: string | null;
  email: string | null;
  specialization: string | null;
  qualification: string | null;
  hire_date: string;
  status: TeacherStatus;
  notes: string | null;
};

type BranchLookupOptions = {
  activeOnly?: boolean;
};

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export function buildTeacherInsert(
  schoolId: string,
  values: TeacherFormValues
): TeacherInsert {
  return {
    school_id: schoolId,
    branch_id: values.branchId.trim(),
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    gender: values.gender as TeacherGender,
    phone: optionalText(values.phone),
    email: optionalText(values.email),
    specialization: optionalText(values.specialization),
    qualification: optionalText(values.qualification),
    hire_date: values.hireDate.trim(),
    status: values.status,
    notes: optionalText(values.notes),
  };
}

export async function fetchSchoolTeachers(
  schoolId: string
): Promise<TeacherRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("teachers")
    .select(
      "id, branch_id, first_name, last_name, gender, phone, email, specialization, qualification, hire_date, status"
    )
    .eq("school_id", schoolId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TeacherRow[];
}

export async function fetchTeacherBranches(
  schoolId: string,
  { activeOnly = false }: BranchLookupOptions = {}
): Promise<TeacherBranch[]> {
  let query = getSupabaseClient()
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

  return (data ?? []) as TeacherBranch[];
}

export async function addTeacher(
  schoolId: string,
  values: TeacherFormValues
): Promise<void> {
  const payload = buildTeacherInsert(schoolId, values);
  const { error } = await getSupabaseClient().from("teachers").insert(payload);

  if (error) throw error;
}

const statusLabels: Record<"ar" | "en", Record<TeacherStatus, string>> = {
  ar: {
    active: "نشط",
    inactive: "غير نشط",
    on_leave: "في إجازة",
    archived: "مؤرشف",
  },
  en: {
    active: "Active",
    inactive: "Inactive",
    on_leave: "On leave",
    archived: "Archived",
  },
};

const genderLabels: Record<"ar" | "en", Record<TeacherGender, string>> = {
  ar: {
    male: "ذكر",
    female: "أنثى",
  },
  en: {
    male: "Male",
    female: "Female",
  },
};

export function translateTeacherStatus(
  status: TeacherStatus,
  locale: "ar" | "en" = "ar"
): string {
  return statusLabels[locale][status];
}

export function translateTeacherGender(
  gender: TeacherGender,
  locale: "ar" | "en" = "ar"
): string {
  return genderLabels[locale][gender];
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

const saveErrorMessages = {
  ar: {
    permission: "لا تملك صلاحية إضافة المعلمين.",
    branch: "تعذر التحقق من الفرع المختار.",
    constraint: "بعض بيانات المعلم غير صحيحة.",
    general: "تعذر حفظ بيانات المعلم حاليًا.",
  },
  en: {
    permission: "You do not have permission to add teachers.",
    branch: "The selected branch could not be verified.",
    constraint: "Some teacher details are invalid.",
    general: "The teacher could not be saved right now.",
  },
} as const;

export function getTeacherSaveErrorMessage(
  error: unknown,
  locale: "ar" | "en" = "ar"
): string {
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";
  const messages = saveErrorMessages[locale];

  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return messages.permission;
  }

  if (code === "23503") {
    return messages.branch;
  }

  if (code === "23514") {
    return messages.constraint;
  }

  return messages.general;
}
