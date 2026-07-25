import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "excused_absence",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type AttendancePermissionCode =
  | "attendance.view"
  | "attendance.manage";

export type AttendanceBranch = {
  id: string;
  name: string;
  isMain: boolean;
  canManage: boolean;
};

export type AttendanceClass = {
  id: string;
  branchId: string;
  name: string;
  scheduleLabel: string | null;
  canManage: boolean;
};

export type AttendanceScope = {
  canView: boolean;
  canManage: boolean;
  branches: AttendanceBranch[];
  classes: AttendanceClass[];
};

export type AttendanceStudent = {
  id: string;
  fullName: string;
};

export type AttendanceDraftRow = AttendanceStudent & {
  recordId: string | null;
  status: AttendanceStatus | null;
  arrivalTime: string;
  note: string;
};

export type AttendanceSummary = Record<AttendanceStatus, number>;

export type AttendanceRoster = {
  sessionId: string | null;
  rows: AttendanceDraftRow[];
};

export type SaveAttendanceInput = {
  schoolId: string;
  branchId: string;
  classId: string;
  sessionDate: string;
  rows: AttendanceDraftRow[];
};

export type SaveAttendanceResult = {
  sessionId: string;
  savedCount: number;
};

type BranchRow = {
  id: string;
  name: string;
  is_main: boolean;
};

type BranchCandidateRow = {
  id: string;
};

type ClassRow = {
  id: string;
  branch_id: string;
  name: string;
  schedule_label: string | null;
};

type ClassCandidateRow = {
  id: string;
  branch_id: string;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type SessionRow = {
  id: string;
};

type RecordRow = {
  id: string;
  student_id: string;
  status: AttendanceStatus;
  arrival_time: string | null;
  note: string | null;
};

type ExistingRecordRow = {
  id: string;
  student_id: string;
};

type ClassAccess = {
  view: boolean;
  manage: boolean;
};

type BranchAccess = ClassAccess;

export class AttendancePermissionError extends Error {
  constructor() {
    super("attendance_permission_required");
    this.name = "AttendancePermissionError";
  }
}

export class AttendanceValidationError extends Error {
  constructor(message = "attendance_validation_failed") {
    super(message);
    this.name = "AttendanceValidationError";
  }
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
  );
}

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permissionCode: AttendancePermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

async function hasBranchPermission(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  permissionCode: AttendancePermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

export async function canAccessAttendanceClass(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  classId: string,
  permissionCode: AttendancePermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("can_access_attendance_class", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_class_id: classId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

async function getClassAccess(
  client: SupabaseClient,
  schoolId: string,
  row: ClassCandidateRow
): Promise<ClassAccess> {
  const [view, manage] = await Promise.all([
    canAccessAttendanceClass(
      client,
      schoolId,
      row.branch_id,
      row.id,
      "attendance.view"
    ),
    canAccessAttendanceClass(
      client,
      schoolId,
      row.branch_id,
      row.id,
      "attendance.manage"
    ),
  ]);

  return { view, manage };
}

export async function fetchAttendanceScope(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<AttendanceScope> {
  const [branchCandidatesResult, classCandidatesResult, schoolView, schoolManage] =
    await Promise.all([
      client
        .from("branches")
        .select("id")
        .eq("school_id", schoolId)
        .eq("status", "active"),
      client
        .from("classes")
        .select("id, branch_id")
        .eq("school_id", schoolId)
        .eq("status", "active"),
      hasSchoolPermission(client, schoolId, "attendance.view"),
      hasSchoolPermission(client, schoolId, "attendance.manage"),
    ]);

  if (branchCandidatesResult.error) throw branchCandidatesResult.error;
  if (classCandidatesResult.error) throw classCandidatesResult.error;

  const branchCandidates = (branchCandidatesResult.data ??
    []) as BranchCandidateRow[];
  const classCandidates = (classCandidatesResult.data ??
    []) as ClassCandidateRow[];

  const [branchAccessEntries, classAccessEntries] = await Promise.all([
    Promise.all(
      branchCandidates.map(async branch => {
        const [view, manage] = await Promise.all([
          hasBranchPermission(
            client,
            schoolId,
            branch.id,
            "attendance.view"
          ),
          hasBranchPermission(
            client,
            schoolId,
            branch.id,
            "attendance.manage"
          ),
        ]);
        return [branch.id, { view, manage }] as const;
      })
    ),
    Promise.all(
      classCandidates.map(
        async row =>
          [row.id, await getClassAccess(client, schoolId, row)] as const
      )
    ),
  ]);

  const branchAccess = new Map<string, BranchAccess>(branchAccessEntries);
  const classAccess = new Map<string, ClassAccess>(classAccessEntries);
  const allowedBranchIds = branchCandidates
    .filter(branch => {
      const access = branchAccess.get(branch.id);
      return Boolean(access && (access.view || access.manage));
    })
    .map(branch => branch.id);
  const allowedBranchIdSet = new Set(allowedBranchIds);
  const allowedClassIds = classCandidates
    .filter(row => {
      const access = classAccess.get(row.id);
      return (
        allowedBranchIdSet.has(row.branch_id) &&
        Boolean(access && (access.view || access.manage))
      );
    })
    .map(row => row.id);

  const [branchDetailsResult, classDetailsResult] = await Promise.all([
    allowedBranchIds.length > 0
      ? client
          .from("branches")
          .select("id, name, is_main")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .in("id", allowedBranchIds)
          .order("is_main", { ascending: false })
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    allowedClassIds.length > 0
      ? client
          .from("classes")
          .select("id, branch_id, name, schedule_label")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .in("id", allowedClassIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (branchDetailsResult.error) throw branchDetailsResult.error;
  if (classDetailsResult.error) throw classDetailsResult.error;

  const branches = (
    (branchDetailsResult.data ?? []) as BranchRow[]
  ).map<AttendanceBranch>(branch => ({
    id: branch.id,
    name: branch.name,
    isMain: branch.is_main,
    canManage: branchAccess.get(branch.id)?.manage === true,
  }));
  const classes = (
    (classDetailsResult.data ?? []) as ClassRow[]
  ).map<AttendanceClass>(row => ({
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    scheduleLabel: row.schedule_label,
    canManage: classAccess.get(row.id)?.manage === true,
  }));

  const branchCanView = [...branchAccess.values()].some(
    access => access.view || access.manage
  );

  return {
    canView: schoolView || schoolManage || branchCanView,
    canManage: classes.some(attendanceClass => attendanceClass.canManage),
    branches,
    classes,
  };
}

function normalizeArrivalTime(value: string | null): string {
  return value?.slice(0, 5) ?? "";
}

export function buildAttendanceDraft(
  students: AttendanceStudent[],
  records: RecordRow[]
): AttendanceDraftRow[] {
  const recordByStudentId = new Map(
    records.map(record => [record.student_id, record])
  );

  return students.map(student => {
    const record = recordByStudentId.get(student.id);

    return {
      ...student,
      recordId: record?.id ?? null,
      status: record?.status ?? null,
      arrivalTime: normalizeArrivalTime(record?.arrival_time ?? null),
      note: record?.note ?? "",
    };
  });
}

export function markAllPresent(
  rows: AttendanceDraftRow[]
): AttendanceDraftRow[] {
  return rows.map(row => ({
    ...row,
    status: "present",
    arrivalTime: "",
  }));
}

export function updateAttendanceDraft(
  rows: AttendanceDraftRow[],
  studentId: string,
  update: Partial<Pick<AttendanceDraftRow, "status" | "arrivalTime" | "note">>
): AttendanceDraftRow[] {
  return rows.map(row => {
    if (row.id !== studentId) return row;

    const next = { ...row, ...update };
    if (next.status !== "late") {
      next.arrivalTime = "";
    }
    return next;
  });
}

export function summarizeAttendance(
  rows: AttendanceDraftRow[]
): AttendanceSummary {
  return rows.reduce<AttendanceSummary>(
    (summary, row) => {
      if (row.status) summary[row.status] += 1;
      return summary;
    },
    {
      present: 0,
      absent: 0,
      late: 0,
      excused_absence: 0,
    }
  );
}

export function getTodayInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function assertClassAccess(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  classId: string,
  permission: AttendancePermissionCode
): Promise<void> {
  const allowed = await canAccessAttendanceClass(
    client,
    schoolId,
    branchId,
    classId,
    permission
  );

  if (!allowed) throw new AttendancePermissionError();
}

export async function fetchAttendanceRoster(
  schoolId: string,
  branchId: string,
  classId: string,
  sessionDate: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<AttendanceRoster> {
  const [canView, canManage] = await Promise.all([
    canAccessAttendanceClass(
      client,
      schoolId,
      branchId,
      classId,
      "attendance.view"
    ),
    canAccessAttendanceClass(
      client,
      schoolId,
      branchId,
      classId,
      "attendance.manage"
    ),
  ]);

  if (!canView && !canManage) throw new AttendancePermissionError();

  const [studentsResult, sessionResult] = await Promise.all([
    client
      .from("students")
      .select("id, first_name, last_name")
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("class_id", classId)
      .eq("status", "active")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    client
      .from("attendance_sessions")
      .select("id")
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("class_id", classId)
      .eq("session_date", sessionDate)
      .maybeSingle(),
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (sessionResult.error) throw sessionResult.error;

  const studentRows = (studentsResult.data ?? []) as StudentRow[];
  const students = studentRows.map<AttendanceStudent>(student => ({
    id: student.id,
    fullName: `${student.first_name} ${student.last_name}`.trim(),
  }));
  const session = sessionResult.data as SessionRow | null;

  if (!session) {
    return {
      sessionId: null,
      rows: buildAttendanceDraft(students, []),
    };
  }

  const { data: recordData, error: recordError } = await client
    .from("attendance_records")
    .select("id, student_id, status, arrival_time, note")
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .eq("class_id", classId)
    .eq("session_id", session.id);

  if (recordError) throw recordError;

  return {
    sessionId: session.id,
    rows: buildAttendanceDraft(students, (recordData ?? []) as RecordRow[]),
  };
}

function validateSaveInput(input: SaveAttendanceInput): void {
  if (
    !input.schoolId ||
    !input.branchId ||
    !input.classId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate) ||
    input.rows.length === 0
  ) {
    throw new AttendanceValidationError();
  }

  const studentIds = new Set<string>();
  for (const row of input.rows) {
    if (
      !row.id ||
      !row.status ||
      !ATTENDANCE_STATUSES.includes(row.status) ||
      row.note.trim().length > 500 ||
      studentIds.has(row.id)
    ) {
      throw new AttendanceValidationError();
    }
    studentIds.add(row.id);
  }
}

async function verifyRoster(
  client: SupabaseClient,
  input: SaveAttendanceInput
): Promise<void> {
  const { data, error } = await client
    .from("students")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("branch_id", input.branchId)
    .eq("class_id", input.classId)
    .eq("status", "active")
    .in(
      "id",
      input.rows.map(row => row.id)
    );

  if (error) throw error;
  const allowedIds = new Set(
    ((data ?? []) as Array<{ id: string }>).map(row => row.id)
  );

  if (
    allowedIds.size !== input.rows.length ||
    input.rows.some(row => !allowedIds.has(row.id))
  ) {
    throw new AttendancePermissionError();
  }
}

async function findAttendanceSession(
  client: SupabaseClient,
  input: SaveAttendanceInput
): Promise<SessionRow | null> {
  const { data, error } = await client
    .from("attendance_sessions")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("branch_id", input.branchId)
    .eq("class_id", input.classId)
    .eq("session_date", input.sessionDate)
    .maybeSingle();

  if (error) throw error;
  return data as SessionRow | null;
}

async function getOrCreateAttendanceSession(
  client: SupabaseClient,
  input: SaveAttendanceInput
): Promise<SessionRow> {
  const existing = await findAttendanceSession(client, input);
  if (existing) return existing;

  const { data, error } = await client
    .from("attendance_sessions")
    .insert({
      school_id: input.schoolId,
      branch_id: input.branchId,
      class_id: input.classId,
      session_date: input.sessionDate,
    })
    .select("id")
    .single();

  if (!error && data) return data as SessionRow;

  if (isPostgrestError(error) && error.code === "23505") {
    const racedSession = await findAttendanceSession(client, input);
    if (racedSession) return racedSession;
  }

  throw error ?? new Error("attendance_session_create_failed");
}

function normalizeWriteRow(row: AttendanceDraftRow) {
  return {
    status: row.status as AttendanceStatus,
    arrival_time:
      row.status === "late" && row.arrivalTime
        ? row.arrivalTime
        : null,
    note: row.note.trim() || null,
  };
}

async function fetchExistingRecords(
  client: SupabaseClient,
  input: SaveAttendanceInput,
  sessionId: string
): Promise<Map<string, ExistingRecordRow>> {
  const { data, error } = await client
    .from("attendance_records")
    .select("id, student_id")
    .eq("school_id", input.schoolId)
    .eq("branch_id", input.branchId)
    .eq("class_id", input.classId)
    .eq("session_id", sessionId)
    .in(
      "student_id",
      input.rows.map(row => row.id)
    );

  if (error) throw error;
  return new Map(
    ((data ?? []) as ExistingRecordRow[]).map(row => [row.student_id, row])
  );
}

async function updateExistingRecords(
  client: SupabaseClient,
  input: SaveAttendanceInput,
  sessionId: string,
  existingRecords: Map<string, ExistingRecordRow>
): Promise<void> {
  const updates = input.rows.flatMap(row => {
    const existing = existingRecords.get(row.id);
    if (!existing) return [];

    return [
      client
        .from("attendance_records")
        .update(normalizeWriteRow(row))
        .eq("id", existing.id)
        .eq("session_id", sessionId)
        .select("id"),
    ];
  });
  const results = await Promise.all(updates);

  for (const result of results) {
    if (result.error) throw result.error;
    if ((result.data ?? []).length !== 1) {
      throw new AttendancePermissionError();
    }
  }
}

async function insertNewRecords(
  client: SupabaseClient,
  input: SaveAttendanceInput,
  sessionId: string,
  existingRecords: Map<string, ExistingRecordRow>
): Promise<void> {
  const inserts = input.rows.flatMap(row => {
    if (existingRecords.has(row.id)) return [];

    return [
      {
        session_id: sessionId,
        student_id: row.id,
        ...normalizeWriteRow(row),
      },
    ];
  });

  if (inserts.length === 0) return;

  const { error } = await client
    .from("attendance_records")
    .insert(inserts);

  if (error) throw error;
}

export async function saveAttendance(
  input: SaveAttendanceInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<SaveAttendanceResult> {
  await assertClassAccess(
    client,
    input.schoolId,
    input.branchId,
    input.classId,
    "attendance.manage"
  );
  validateSaveInput(input);
  await verifyRoster(client, input);

  const session = await getOrCreateAttendanceSession(client, input);
  let existingRecords = await fetchExistingRecords(
    client,
    input,
    session.id
  );

  await updateExistingRecords(client, input, session.id, existingRecords);

  try {
    await insertNewRecords(client, input, session.id, existingRecords);
  } catch (error) {
    if (!isPostgrestError(error) || error.code !== "23505") throw error;

    existingRecords = await fetchExistingRecords(
      client,
      input,
      session.id
    );
    await updateExistingRecords(client, input, session.id, existingRecords);
    await insertNewRecords(client, input, session.id, existingRecords);
  }

  return {
    sessionId: session.id,
    savedCount: input.rows.length,
  };
}

export function getAttendanceErrorMessage(error: unknown): string {
  if (error instanceof AttendancePermissionError) {
    return "لا تملك صلاحية تنفيذ هذه العملية ضمن الحلقة المحددة.";
  }

  if (error instanceof AttendanceValidationError) {
    return "حدّد حالة صحيحة لكل طالب قبل الحفظ.";
  }

  const safeError = error as Partial<PostgrestError> | null;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (
    safeError?.code === "42501" ||
    safeError?.code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "رفضت قاعدة البيانات العملية لأنها خارج نطاق صلاحيتك.";
  }

  return "تعذر إتمام عملية الحضور حاليًا. حاول مرة أخرى.";
}
