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
