import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
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
  notes: string | null;
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

const TEACHER_DRAFT_STORAGE_PREFIX = "quran-school:teacher-draft:";

const teacherDraftStatuses = new Set<TeacherStatus>([
  "active",
  "inactive",
  "on_leave",
  "archived",
]);

const teacherDraftGenders = new Set<TeacherGender | "">([
  "",
  "male",
  "female",
]);

const getSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const sanitizeTeacherDraft = (value: unknown): TeacherFormValues | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const stringFields = [
    "branchId",
    "firstName",
    "lastName",
    "phone",
    "email",
    "specialization",
    "qualification",
    "hireDate",
    "notes",
  ] as const;

  if (stringFields.some(field => typeof candidate[field] !== "string")) {
    return null;
  }

  if (
    typeof candidate.gender !== "string" ||
    !teacherDraftGenders.has(candidate.gender as TeacherGender | "") ||
    typeof candidate.status !== "string" ||
    !teacherDraftStatuses.has(candidate.status as TeacherStatus)
  ) {
    return null;
  }

  return {
    branchId: candidate.branchId as string,
    firstName: candidate.firstName as string,
    lastName: candidate.lastName as string,
    gender: candidate.gender as TeacherGender | "",
    phone: candidate.phone as string,
    email: candidate.email as string,
    specialization: candidate.specialization as string,
    qualification: candidate.qualification as string,
    hireDate: candidate.hireDate as string,
    status: candidate.status as TeacherStatus,
    notes: candidate.notes as string,
  };
};

export function getTeacherDraftStorageKey(schoolId: string): string {
  return `${TEACHER_DRAFT_STORAGE_PREFIX}${schoolId}`;
}

export function saveTeacherDraft(
  schoolId: string,
  values: TeacherFormValues
): void {
  const storage = getSessionStorage();
  const draft = sanitizeTeacherDraft(values);
  if (!storage || !draft) return;

  try {
    storage.setItem(getTeacherDraftStorageKey(schoolId), JSON.stringify(draft));
  } catch {
    // Storage can be unavailable or full; the form must remain usable.
  }
}

export function loadTeacherDraft(schoolId: string): TeacherFormValues | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const storedDraft = storage.getItem(getTeacherDraftStorageKey(schoolId));
    if (storedDraft === null) return null;
    return sanitizeTeacherDraft(JSON.parse(storedDraft));
  } catch {
    return null;
  }
}

export function clearTeacherDraft(schoolId: string): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(getTeacherDraftStorageKey(schoolId));
  } catch {
    // Storage can be unavailable; clearing should never block navigation.
  }
}

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
      "id, branch_id, first_name, last_name, gender, phone, email, specialization, qualification, hire_date, status, notes"
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

export type TeacherUpdate = Omit<TeacherInsert, "school_id">;

export function buildTeacherUpdate(
  schoolId: string,
  values: TeacherFormValues
): TeacherUpdate {
  const payload = buildTeacherInsert(schoolId, values);
  const { school_id, ...update } = payload;
  void school_id;
  return update;
}

export async function updateTeacher(
  schoolId: string,
  teacherId: string,
  values: TeacherFormValues
): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from("teachers")
    .update(buildTeacherUpdate(schoolId, values))
    .eq("school_id", schoolId)
    .eq("id", teacherId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("teacher_not_updatable");
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

export type TeacherClassAssignmentDetails = {
  id: string;
  classId: string;
  className: string;
  classCode: string;
  scheduleLabel: string | null;
  classStatus: string;
  assignmentRole: "primary" | "assistant";
  assignmentStatus: "active" | "inactive";
  assignedAt: string;
};

export type TeacherDetailsData = {
  teacher: TeacherRow;
  branchName: string | null;
  assignments: TeacherClassAssignmentDetails[];
};

export async function fetchTeacherDetails(
  schoolId: string,
  teacherId: string
): Promise<TeacherDetailsData | null> {
  const client = getSupabaseClient();
  const { data: teacherData, error: teacherError } = await client
    .from("teachers")
    .select(
      "id, branch_id, first_name, last_name, gender, phone, email, specialization, qualification, hire_date, status, notes"
    )
    .eq("school_id", schoolId)
    .eq("id", teacherId)
    .maybeSingle();

  if (teacherError) throw teacherError;
  if (!teacherData) return null;

  const teacher = teacherData as TeacherRow;
  const [branchResult, assignmentResult] = await Promise.all([
    client
      .from("branches")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("id", teacher.branch_id)
      .maybeSingle(),
    client
      .from("class_teachers")
      .select("id, class_id, assignment_role, status, assigned_at")
      .eq("school_id", schoolId)
      .eq("branch_id", teacher.branch_id)
      .eq("teacher_id", teacher.id)
      .order("assigned_at", { ascending: false }),
  ]);

  if (branchResult.error) throw branchResult.error;
  if (assignmentResult.error) throw assignmentResult.error;

  const assignmentRows = (assignmentResult.data ?? []) as Array<{
    id: string;
    class_id: string;
    assignment_role: "primary" | "assistant";
    status: "active" | "inactive";
    assigned_at: string;
  }>;
  const classIds = [...new Set(assignmentRows.map(row => row.class_id))];
  let classRows: Array<{
    id: string;
    name: string;
    code: string;
    schedule_label: string | null;
    status: string;
  }> = [];

  if (classIds.length > 0) {
    const { data, error } = await client
      .from("classes")
      .select("id, name, code, schedule_label, status")
      .eq("school_id", schoolId)
      .eq("branch_id", teacher.branch_id)
      .in("id", classIds);
    if (error) throw error;
    classRows = (data ?? []) as typeof classRows;
  }

  const classesById = new Map(classRows.map(row => [row.id, row]));
  const assignments = assignmentRows.flatMap(row => {
    const classItem = classesById.get(row.class_id);
    if (!classItem) return [];
    return [{
      id: row.id,
      classId: classItem.id,
      className: classItem.name,
      classCode: classItem.code,
      scheduleLabel: classItem.schedule_label,
      classStatus: classItem.status,
      assignmentRole: row.assignment_role,
      assignmentStatus: row.status,
      assignedAt: row.assigned_at,
    }];
  });

  return {
    teacher,
    branchName: branchResult.data?.name ?? null,
    assignments,
  };
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


export async function hasTeacherManagePermission(
  schoolId: string,
  branchId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: "teachers.manage",
  });
  return !error && data === true;
}

export async function fetchTeacherManageableBranchIds(
  schoolId: string,
  branchIds: readonly string[],
  client: SupabaseClient = getSupabaseClient()
): Promise<Set<string>> {
  const uniqueBranchIds = [...new Set(branchIds.filter(Boolean))];
  const results = await Promise.all(uniqueBranchIds.map(async branchId => {
    const allowed = await hasTeacherManagePermission(schoolId, branchId, client);
    return allowed ? branchId : null;
  }));
  return new Set(results.filter((branchId): branchId is string => branchId !== null));
}

export type TeacherEditRecord = {
  teacher: TeacherRow;
  branchName: string | null;
  assignmentHistoryKnown: boolean;
  assignmentCount: number;
};

export async function fetchTeacherEditRecord(
  schoolId: string,
  teacherId: string
): Promise<TeacherEditRecord | null> {
  const client = getSupabaseClient();
  const { data: teacherData, error: teacherError } = await client
    .from("teachers")
    .select("id, branch_id, first_name, last_name, gender, phone, email, specialization, qualification, hire_date, status, notes")
    .eq("school_id", schoolId)
    .eq("id", teacherId)
    .maybeSingle();

  if (teacherError) throw teacherError;
  if (!teacherData) return null;
  const teacher = teacherData as TeacherRow;

  const [branchResult, assignmentResult, viewPermissionResult] = await Promise.all([
    client.from("branches").select("id, name").eq("school_id", schoolId).eq("id", teacher.branch_id).maybeSingle(),
    client.from("class_teachers").select("id").eq("school_id", schoolId).eq("teacher_id", teacher.id),
    client.rpc("has_branch_permission", { target_school_id: schoolId, target_branch_id: teacher.branch_id, target_permission_code: "teachers.view" }),
  ]);

  return {
    teacher,
    branchName: branchResult.error ? null : (branchResult.data?.name ?? null),
    assignmentHistoryKnown: !assignmentResult.error && !viewPermissionResult.error && viewPermissionResult.data === true,
    assignmentCount: assignmentResult.error ? 0 : (assignmentResult.data ?? []).length,
  };
}
