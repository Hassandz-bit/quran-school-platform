import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type RosterPermissionCode = "students.manage" | "teachers.manage";
export type ClassTeacherAssignmentRole = "primary" | "assistant";
export type ClassTeacherAssignmentStatus = "active" | "inactive";

export type RosterBranch = {
  id: string;
  name: string;
  isMain: boolean;
};

export type RosterStudent = {
  id: string;
  branchId: string;
  classId: string | null;
  fullName: string;
  status: string;
};

export type RosterClass = {
  id: string;
  branchId: string;
  name: string;
  scheduleLabel: string | null;
  status: string;
};

export type RosterTeacher = {
  id: string;
  branchId: string;
  fullName: string;
  status: string;
};

export type ClassTeacherAssignment = {
  id: string;
  schoolId: string;
  branchId: string;
  classId: string;
  teacherId: string;
  teacherName: string;
  assignmentRole: ClassTeacherAssignmentRole;
  status: ClassTeacherAssignmentStatus;
  assignedAt: string;
};

export type ClassTeacherRoster = {
  teachers: RosterTeacher[];
  assignments: ClassTeacherAssignment[];
};

export type StudentClassAssignmentInput = {
  schoolId: string;
  branchId: string;
  studentId: string;
  studentStatus: string;
  classId: string | null;
};

export type ClassTeacherAssignmentInput = {
  schoolId: string;
  branchId: string;
  classId: string;
  teacherId: string;
  assignmentRole: ClassTeacherAssignmentRole;
  assignedAt?: string;
};

export class RosterPermissionError extends Error {
  constructor() {
    super("roster_permission_required");
    this.name = "RosterPermissionError";
  }
}

export class RosterValidationError extends Error {
  constructor(message = "roster_validation_failed") {
    super(message);
    this.name = "RosterValidationError";
  }
}

type BranchRow = {
  id: string;
  name: string;
  is_main: boolean;
};

type StudentRow = {
  id: string;
  branch_id: string;
  class_id: string | null;
  first_name: string;
  last_name: string;
  status: string;
};

type ClassRow = {
  id: string;
  branch_id: string;
  name: string;
  schedule_label: string | null;
  status: string;
};

type TeacherRow = {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  status: string;
};

type AssignmentRow = {
  id: string;
  school_id: string;
  branch_id: string;
  class_id: string;
  teacher_id: string;
  assignment_role: ClassTeacherAssignmentRole;
  status: ClassTeacherAssignmentStatus;
  assigned_at: string;
};

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

function normalizeId(value: string): string {
  return value.trim();
}

function requireId(value: string, message: string): string {
  const normalized = normalizeId(value);
  if (!normalized) throw new RosterValidationError(message);
  return normalized;
}

export function buildStudentClassUpdate(classId: string | null): {
  class_id: string | null;
} {
  return {
    class_id: classId === null ? null : normalizeId(classId) || null,
  };
}

export function isActiveClassInBranch(
  classItem: Pick<RosterClass, "branchId" | "status">,
  branchId: string
): boolean {
  return classItem.status === "active" && classItem.branchId === branchId;
}

export function buildClassTeacherInsert(
  input: ClassTeacherAssignmentInput
): {
  school_id: string;
  branch_id: string;
  class_id: string;
  teacher_id: string;
  assignment_role: ClassTeacherAssignmentRole;
  status: "active";
  assigned_at: string;
} {
  return {
    school_id: requireId(input.schoolId, "school_required"),
    branch_id: requireId(input.branchId, "branch_required"),
    class_id: requireId(input.classId, "class_required"),
    teacher_id: requireId(input.teacherId, "teacher_required"),
    assignment_role: input.assignmentRole,
    status: "active",
    assigned_at: input.assignedAt ?? getTodayDateValue(),
  };
}

export function buildClassTeacherUpdate(
  assignmentRole: ClassTeacherAssignmentRole,
  assignedAt = getTodayDateValue()
): {
  assignment_role: ClassTeacherAssignmentRole;
  status: "active";
  assigned_at: string;
} {
  return {
    assignment_role: assignmentRole,
    status: "active",
    assigned_at: assignedAt,
  };
}

export function buildDeactivateClassTeacherUpdate(): { status: "inactive" } {
  return { status: "inactive" };
}

export function getTodayDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function hasBranchPermission(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  permissionCode: RosterPermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

export async function fetchManageableRosterBranches(
  schoolId: string,
  permissionCode: RosterPermissionCode,
  client: SupabaseClient = getSupabaseClient()
): Promise<RosterBranch[]> {
  const normalizedSchoolId = requireId(schoolId, "school_required");
  const { data, error } = await client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", normalizedSchoolId)
    .eq("status", "active")
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as BranchRow[];
  const accessEntries = await Promise.all(
    rows.map(async row => [
      row.id,
      await hasBranchPermission(
        client,
        normalizedSchoolId,
        row.id,
        permissionCode
      ),
    ] as const)
  );
  const accessByBranch = new Map(accessEntries);

  return rows
    .filter(row => accessByBranch.get(row.id) === true)
    .map(row => ({ id: row.id, name: row.name, isMain: row.is_main }));
}

export async function fetchAssignableStudents(
  schoolId: string,
  manageableBranchIds: string[],
  client: SupabaseClient = getSupabaseClient()
): Promise<RosterStudent[]> {
  const normalizedSchoolId = requireId(schoolId, "school_required");
  const branchIds = [...new Set(manageableBranchIds.map(normalizeId).filter(Boolean))];
  if (branchIds.length === 0) return [];

  const { data, error } = await client
    .from("students")
    .select("id, branch_id, class_id, first_name, last_name, status")
    .eq("school_id", normalizedSchoolId)
    .eq("status", "active")
    .in("branch_id", branchIds)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  const allowedBranches = new Set(branchIds);

  return ((data ?? []) as StudentRow[])
    .filter(row => row.status === "active" && allowedBranches.has(row.branch_id))
    .map(row => ({
      id: row.id,
      branchId: row.branch_id,
      classId: row.class_id,
      fullName: `${row.first_name} ${row.last_name}`.trim(),
      status: row.status,
    }));
}

export async function fetchActiveClassesForBranches(
  schoolId: string,
  manageableBranchIds: string[],
  client: SupabaseClient = getSupabaseClient()
): Promise<RosterClass[]> {
  const normalizedSchoolId = requireId(schoolId, "school_required");
  const branchIds = [...new Set(manageableBranchIds.map(normalizeId).filter(Boolean))];
  if (branchIds.length === 0) return [];

  const { data, error } = await client
    .from("classes")
    .select("id, branch_id, name, schedule_label, status")
    .eq("school_id", normalizedSchoolId)
    .eq("status", "active")
    .in("branch_id", branchIds)
    .order("name", { ascending: true });

  if (error) throw error;
  const allowedBranches = new Set(branchIds);

  return ((data ?? []) as ClassRow[])
    .filter(row => row.status === "active" && allowedBranches.has(row.branch_id))
    .map(row => ({
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      scheduleLabel: row.schedule_label,
      status: row.status,
    }));
}

export async function updateStudentClassAssignment(
  input: StudentClassAssignmentInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<string | null> {
  const schoolId = requireId(input.schoolId, "school_required");
  const branchId = requireId(input.branchId, "branch_required");
  const studentId = requireId(input.studentId, "student_required");

  if (input.studentStatus !== "active") {
    throw new RosterValidationError("student_not_active");
  }

  if (!(await hasBranchPermission(client, schoolId, branchId, "students.manage"))) {
    throw new RosterPermissionError();
  }

  const payload = buildStudentClassUpdate(input.classId);

  if (payload.class_id !== null) {
    const { data: classData, error: classError } = await client
      .from("classes")
      .select("id, branch_id, status")
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("id", payload.class_id)
      .eq("status", "active")
      .maybeSingle();

    if (classError) throw classError;
    const classRow = classData as Pick<ClassRow, "id" | "branch_id" | "status"> | null;
    if (!classRow || classRow.branch_id !== branchId || classRow.status !== "active") {
      throw new RosterValidationError("class_outside_student_scope");
    }
  }

  const { data, error } = await client
    .from("students")
    .update(payload)
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .eq("status", "active")
    .select("id, class_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new RosterValidationError("student_not_updatable");

  return (data as { class_id: string | null }).class_id;
}

export async function fetchClassTeacherRoster(
  schoolId: string,
  branchId: string,
  classId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<ClassTeacherRoster> {
  const normalizedSchoolId = requireId(schoolId, "school_required");
  const normalizedBranchId = requireId(branchId, "branch_required");
  const normalizedClassId = requireId(classId, "class_required");

  if (
    !(await hasBranchPermission(
      client,
      normalizedSchoolId,
      normalizedBranchId,
      "teachers.manage"
    ))
  ) {
    throw new RosterPermissionError();
  }

  const [classResult, teachersResult, assignmentsResult] = await Promise.all([
    client
      .from("classes")
      .select("id, branch_id, status")
      .eq("school_id", normalizedSchoolId)
      .eq("branch_id", normalizedBranchId)
      .eq("id", normalizedClassId)
      .eq("status", "active")
      .maybeSingle(),
    client
      .from("teachers")
      .select("id, branch_id, first_name, last_name, status")
      .eq("school_id", normalizedSchoolId)
      .eq("branch_id", normalizedBranchId)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    client
      .from("class_teachers")
      .select(
        "id, school_id, branch_id, class_id, teacher_id, assignment_role, status, assigned_at"
      )
      .eq("school_id", normalizedSchoolId)
      .eq("branch_id", normalizedBranchId)
      .eq("class_id", normalizedClassId)
      .order("status", { ascending: true })
      .order("assigned_at", { ascending: false }),
  ]);

  if (classResult.error) throw classResult.error;
  if (teachersResult.error) throw teachersResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (!classResult.data) throw new RosterValidationError("class_not_active");

  const teacherRows = (teachersResult.data ?? []) as TeacherRow[];
  const teacherNames = new Map(
    teacherRows.map(row => [
      row.id,
      `${row.first_name} ${row.last_name}`.trim(),
    ])
  );

  const teachers = teacherRows
    .filter(row => row.status === "active" && row.branch_id === normalizedBranchId)
    .map<RosterTeacher>(row => ({
      id: row.id,
      branchId: row.branch_id,
      fullName: teacherNames.get(row.id) ?? "—",
      status: row.status,
    }));

  const assignments = ((assignmentsResult.data ?? []) as AssignmentRow[])
    .filter(
      row =>
        row.school_id === normalizedSchoolId &&
        row.branch_id === normalizedBranchId &&
        row.class_id === normalizedClassId
    )
    .map<ClassTeacherAssignment>(row => ({
      id: row.id,
      schoolId: row.school_id,
      branchId: row.branch_id,
      classId: row.class_id,
      teacherId: row.teacher_id,
      teacherName: teacherNames.get(row.teacher_id) ?? "معلم غير متاح",
      assignmentRole: row.assignment_role,
      status: row.status,
      assignedAt: row.assigned_at,
    }));

  return { teachers, assignments };
}

async function assertActiveClassAndTeacher(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  classId: string,
  teacherId: string
): Promise<void> {
  const [classResult, teacherResult] = await Promise.all([
    client
      .from("classes")
      .select("id, branch_id, status")
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("id", classId)
      .eq("status", "active")
      .maybeSingle(),
    client
      .from("teachers")
      .select("id, branch_id, status")
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("id", teacherId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (classResult.error) throw classResult.error;
  if (teacherResult.error) throw teacherResult.error;
  if (!classResult.data) throw new RosterValidationError("class_not_active");
  if (!teacherResult.data) throw new RosterValidationError("teacher_not_active");
}

export async function saveClassTeacherAssignment(
  input: ClassTeacherAssignmentInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const payload = buildClassTeacherInsert(input);

  if (
    !(await hasBranchPermission(
      client,
      payload.school_id,
      payload.branch_id,
      "teachers.manage"
    ))
  ) {
    throw new RosterPermissionError();
  }

  await assertActiveClassAndTeacher(
    client,
    payload.school_id,
    payload.branch_id,
    payload.class_id,
    payload.teacher_id
  );

  const { data: existingData, error: existingError } = await client
    .from("class_teachers")
    .select("id, school_id, branch_id, class_id, teacher_id, status")
    .eq("school_id", payload.school_id)
    .eq("branch_id", payload.branch_id)
    .eq("class_id", payload.class_id)
    .eq("teacher_id", payload.teacher_id)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingData) {
    const existing = existingData as Pick<
      AssignmentRow,
      "id" | "school_id" | "branch_id" | "class_id" | "teacher_id" | "status"
    >;
    const { data, error } = await client
      .from("class_teachers")
      .update(buildClassTeacherUpdate(payload.assignment_role, payload.assigned_at))
      .eq("id", existing.id)
      .eq("school_id", payload.school_id)
      .eq("branch_id", payload.branch_id)
      .eq("class_id", payload.class_id)
      .eq("teacher_id", payload.teacher_id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new RosterValidationError("assignment_not_updatable");
    return;
  }

  const { error } = await client.from("class_teachers").insert(payload);
  if (error) throw error;
}

export async function deactivateClassTeacherAssignment(
  assignment: Pick<
    ClassTeacherAssignment,
    "id" | "schoolId" | "branchId" | "classId" | "teacherId"
  >,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  if (
    !(await hasBranchPermission(
      client,
      assignment.schoolId,
      assignment.branchId,
      "teachers.manage"
    ))
  ) {
    throw new RosterPermissionError();
  }

  const { data, error } = await client
    .from("class_teachers")
    .update(buildDeactivateClassTeacherUpdate())
    .eq("id", assignment.id)
    .eq("school_id", assignment.schoolId)
    .eq("branch_id", assignment.branchId)
    .eq("class_id", assignment.classId)
    .eq("teacher_id", assignment.teacherId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new RosterValidationError("assignment_not_updatable");
}

export function getRosterErrorMessage(error: unknown): string {
  if (error instanceof RosterPermissionError) {
    return "لا تملك صلاحية إدارة هذا الربط.";
  }

  if (error instanceof RosterValidationError) {
    if (error.message === "student_not_active") {
      return "لا يمكن تعديل حلقة طالب غير نشط.";
    }
    if (error.message === "class_outside_student_scope") {
      return "الحلقة المختارة ليست نشطة في فرع الطالب.";
    }
    if (error.message === "teacher_not_active") {
      return "المعلم المختار غير نشط أو خارج فرع الحلقة.";
    }
    if (error.message === "class_not_active") {
      return "الحلقة غير نشطة أو خارج النطاق المسموح.";
    }
    return "تعذر التحقق من نطاق الربط المطلوب.";
  }

  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "لا تملك صلاحية إدارة هذا الربط.";
  }

  if (code === "23503") {
    return "تعذر ربط عناصر من مدارس أو فروع مختلفة.";
  }

  if (code === "23505") {
    return "التعيين موجود بالفعل أو توجد حلقة بمعلم أساسي نشط آخر.";
  }

  return "تعذر حفظ الربط حاليًا.";
}
