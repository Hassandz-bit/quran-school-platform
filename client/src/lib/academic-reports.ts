import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAttendanceScope,
  type AttendanceClass,
  type AttendanceScope,
  type AttendanceStatus,
} from "./attendance";
import {
  fetchMemorizationScope,
  type MemorizationClass,
  type MemorizationScope,
  type MemorizationSessionType,
} from "./memorization";
import { getSupabaseClient } from "./supabase";

export type AcademicReportFilters = {
  dateFrom: string;
  dateTo: string;
  branchId: string;
  classId: string;
  studentId: string;
};

export type AcademicReportBranch = {
  id: string;
  name: string;
  isMain: boolean;
};

export type AcademicReportClass = {
  id: string;
  branchId: string;
  name: string;
  scheduleLabel: string | null;
};

export type AcademicReportStudent = {
  id: string;
  branchId: string;
  classId: string;
  fullName: string;
};

export type AcademicModuleAccess<T> =
  | { state: "ready"; scope: T }
  | { state: "hidden" }
  | { state: "error" };

export type AcademicReportsAccess = {
  attendance: AcademicModuleAccess<AttendanceScope>;
  memorization: AcademicModuleAccess<MemorizationScope>;
};

export type AttendanceReportRecord = {
  id: string;
  sessionId: string;
  date: string;
  studentId: string;
  studentName: string;
  branchId: string;
  classId: string;
  className: string;
  status: AttendanceStatus;
};

export type AttendanceStudentSummary = {
  studentId: string;
  studentName: string;
  branchId: string;
  classId: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  latestDate: string | null;
  latestStatus: AttendanceStatus | null;
};

export type MemorizationReportRecord = {
  id: string;
  date: string;
  studentId: string;
  studentName: string;
  branchId: string;
  classId: string;
  className: string;
  sessionType: MemorizationSessionType;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  rating: number;
  createdAt: string;
};

export type MemorizationStudentSummary = {
  studentId: string;
  studentName: string;
  branchId: string;
  classId: string;
  className: string;
  memorizationCount: number;
  reviewCount: number;
  total: number;
  latestDate: string | null;
  latestSessionType: MemorizationSessionType | null;
  latestSurahNumber: number | null;
  latestAyahStart: number | null;
  latestAyahEnd: number | null;
  latestRating: number | null;
};

export type AcademicClassSummary = {
  classId: string;
  className: string;
  branchId: string;
  studentCount: number;
  attendanceCount: number;
  absentCount: number;
  lateCount: number;
  memorizationCount: number;
  latestActivity: string | null;
};

export type AcademicOverview = {
  attendanceCount: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  memorizationCount: number;
  studentCount: number;
  latestActivity: string | null;
};

export type AcademicReportSection<T> =
  | { state: "ready"; data: T }
  | { state: "hidden" }
  | { state: "error" };

export type AcademicReportsData = {
  branches: AcademicReportBranch[];
  classes: AcademicReportClass[];
  students: AcademicReportStudent[];
  attendance: AcademicReportSection<{
    records: AttendanceReportRecord[];
    students: AttendanceStudentSummary[];
  }>;
  memorization: AcademicReportSection<{
    records: MemorizationReportRecord[];
    students: MemorizationStudentSummary[];
  }>;
  classesSummary: AcademicClassSummary[];
  overview: AcademicOverview;
};

export type AcademicCsvKind =
  | "student_summary"
  | "attendance"
  | "memorization";

type AttendanceSessionRow = {
  id: string;
  branch_id: string;
  class_id: string;
  session_date: string;
};
type AttendanceRecordRow = {
  id: string;
  session_id: string;
  student_id: string;
  branch_id: string;
  class_id: string;
  status: AttendanceStatus;
};
type MemorizationRecordRow = {
  id: string;
  student_id: string;
  branch_id: string;
  class_id: string;
  record_date: string;
  session_type: MemorizationSessionType;
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  rating: number;
  created_at: string;
};
type StudentRow = {
  id: string;
  branch_id: string;
  class_id: string | null;
  first_name: string;
  last_name: string;
};

export class AcademicReportsPermissionError extends Error {
  constructor() {
    super("academic_reports_permission_required");
    this.name = "AcademicReportsPermissionError";
  }
}

export class AcademicReportsValidationError extends Error {
  constructor() {
    super("academic_reports_invalid_filters");
    this.name = "AcademicReportsValidationError";
  }
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return [year, month, day].join("-");
}

export function getDefaultAcademicReportFilters(
  now = new Date()
): AcademicReportFilters {
  const dateTo = new Date(now);
  const dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - 29);
  return {
    dateFrom: dateInputValue(dateFrom),
    dateTo: dateInputValue(dateTo),
    branchId: "",
    classId: "",
    studentId: "",
  };
}

function moduleAccess<T extends { canView: boolean }>(
  result: PromiseSettledResult<T>
): AcademicModuleAccess<T> {
  if (result.status === "rejected") return { state: "error" };
  return result.value.canView
    ? { state: "ready", scope: result.value }
    : { state: "hidden" };
}

export async function fetchAcademicReportsAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<AcademicReportsAccess> {
  const [attendance, memorization] = await Promise.allSettled([
    fetchAttendanceScope(schoolId, client),
    fetchMemorizationScope(schoolId, client),
  ]);
  return {
    attendance: moduleAccess(attendance),
    memorization: moduleAccess(memorization),
  };
}

export function hasAnyAcademicReportsAccess(
  access: AcademicReportsAccess
): boolean {
  return (
    access.attendance.state === "ready" ||
    access.memorization.state === "ready"
  );
}

function validateFilters(filters: AcademicReportFilters): void {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !pattern.test(filters.dateFrom) ||
    !pattern.test(filters.dateTo) ||
    filters.dateFrom > filters.dateTo
  ) {
    throw new AcademicReportsValidationError();
  }
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map(row => [row.id, row])).values()];
}

function scopeBranches(access: AcademicReportsAccess): AcademicReportBranch[] {
  const branches = [
    ...(access.attendance.state === "ready"
      ? access.attendance.scope.branches
      : []),
    ...(access.memorization.state === "ready"
      ? access.memorization.scope.branches
      : []),
  ];
  return uniqueById(branches)
    .map(branch => ({
      id: branch.id,
      name: branch.name,
      isMain: branch.isMain,
    }))
    .sort(
      (left, right) =>
        Number(right.isMain) - Number(left.isMain) ||
        left.name.localeCompare(right.name, "ar")
    );
}

function normalizeClasses(
  classes: Array<AttendanceClass | MemorizationClass>
): AcademicReportClass[] {
  return uniqueById(classes)
    .map(item => ({
      id: item.id,
      branchId: item.branchId,
      name: item.name,
      scheduleLabel: item.scheduleLabel,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));
}

function scopeClasses(access: AcademicReportsAccess): AcademicReportClass[] {
  return normalizeClasses([
    ...(access.attendance.state === "ready"
      ? access.attendance.scope.classes
      : []),
    ...(access.memorization.state === "ready"
      ? access.memorization.scope.classes
      : []),
  ]);
}

function filteredModuleClassIds(
  module: AcademicModuleAccess<AttendanceScope | MemorizationScope>,
  filters: AcademicReportFilters
): string[] {
  if (module.state !== "ready") return [];
  return module.scope.classes
    .filter(
      item =>
        (!filters.branchId || item.branchId === filters.branchId) &&
        (!filters.classId || item.id === filters.classId)
    )
    .map(item => item.id);
}

function assertFilterScope(
  filters: AcademicReportFilters,
  branches: AcademicReportBranch[],
  classes: AcademicReportClass[]
): void {
  if (
    (filters.branchId &&
      !branches.some(branch => branch.id === filters.branchId)) ||
    (filters.classId &&
      !classes.some(
        item =>
          item.id === filters.classId &&
          (!filters.branchId || item.branchId === filters.branchId)
      ))
  ) {
    throw new AcademicReportsPermissionError();
  }
}

async function fetchStudents(
  client: SupabaseClient,
  schoolId: string,
  filters: AcademicReportFilters,
  classIds: string[]
): Promise<AcademicReportStudent[]> {
  if (classIds.length === 0) return [];
  let query = client
    .from("students")
    .select("id, branch_id, class_id, first_name, last_name")
    .eq("school_id", schoolId)
    .in("class_id", classIds)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.classId) query = query.eq("class_id", filters.classId);
  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as StudentRow[])
    .filter((row): row is StudentRow & { class_id: string } =>
      Boolean(row.class_id && classIds.includes(row.class_id))
    )
    .map(row => ({
      id: row.id,
      branchId: row.branch_id,
      classId: row.class_id,
      fullName: [row.first_name, row.last_name].join(" ").trim(),
    }));
}

async function fetchAttendanceReport(
  client: SupabaseClient,
  schoolId: string,
  filters: AcademicReportFilters,
  classIds: string[],
  studentsById: Map<string, AcademicReportStudent>,
  classesById: Map<string, AcademicReportClass>
) {
  if (classIds.length === 0) return { records: [], students: [] };
  let sessionsQuery = client
    .from("attendance_sessions")
    .select("id, branch_id, class_id, session_date")
    .eq("school_id", schoolId)
    .in("class_id", classIds)
    .gte("session_date", filters.dateFrom)
    .lte("session_date", filters.dateTo)
    .order("session_date", { ascending: false });
  if (filters.branchId) {
    sessionsQuery = sessionsQuery.eq("branch_id", filters.branchId);
  }
  if (filters.classId) {
    sessionsQuery = sessionsQuery.eq("class_id", filters.classId);
  }
  const { data: sessionsData, error: sessionsError } = await sessionsQuery;
  if (sessionsError) throw sessionsError;
  const sessions = (sessionsData ?? []) as AttendanceSessionRow[];
  if (sessions.length === 0) return { records: [], students: [] };

  const sessionById = new Map(sessions.map(session => [session.id, session]));
  let recordsQuery = client
    .from("attendance_records")
    .select("id, session_id, student_id, branch_id, class_id, status")
    .eq("school_id", schoolId)
    .in("class_id", classIds)
    .in(
      "session_id",
      sessions.map(session => session.id)
    );
  if (filters.branchId) {
    recordsQuery = recordsQuery.eq("branch_id", filters.branchId);
  }
  if (filters.classId) {
    recordsQuery = recordsQuery.eq("class_id", filters.classId);
  }
  if (filters.studentId) {
    recordsQuery = recordsQuery.eq("student_id", filters.studentId);
  }
  const { data: recordsData, error: recordsError } = await recordsQuery;
  if (recordsError) throw recordsError;

  const records = ((recordsData ?? []) as AttendanceRecordRow[])
    .flatMap<AttendanceReportRecord>(row => {
      const session = sessionById.get(row.session_id);
      const student = studentsById.get(row.student_id);
      const reportClass = classesById.get(row.class_id);
      if (
        !session ||
        !student ||
        !reportClass ||
        session.class_id !== row.class_id ||
        session.branch_id !== row.branch_id
      ) {
        return [];
      }
      return [{
        id: row.id,
        sessionId: row.session_id,
        date: session.session_date,
        studentId: row.student_id,
        studentName: student.fullName,
        branchId: row.branch_id,
        classId: row.class_id,
        className: reportClass.name,
        status: row.status,
      }];
    })
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        left.studentName.localeCompare(right.studentName, "ar")
    );
  return { records, students: summarizeAttendanceStudents(records) };
}

async function fetchMemorizationReport(
  client: SupabaseClient,
  schoolId: string,
  filters: AcademicReportFilters,
  classIds: string[],
  studentsById: Map<string, AcademicReportStudent>,
  classesById: Map<string, AcademicReportClass>
) {
  if (classIds.length === 0) return { records: [], students: [] };
  let query = client
    .from("memorization_records")
    .select(
      "id, student_id, branch_id, class_id, record_date, session_type, surah_number, ayah_start, ayah_end, rating, created_at"
    )
    .eq("school_id", schoolId)
    .in("class_id", classIds)
    .gte("record_date", filters.dateFrom)
    .lte("record_date", filters.dateTo)
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.classId) query = query.eq("class_id", filters.classId);
  if (filters.studentId) query = query.eq("student_id", filters.studentId);
  const { data, error } = await query;
  if (error) throw error;

  const records = ((data ?? []) as MemorizationRecordRow[])
    .flatMap<MemorizationReportRecord>(row => {
      const student = studentsById.get(row.student_id);
      const reportClass = classesById.get(row.class_id);
      if (!student || !reportClass) return [];
      return [{
        id: row.id,
        date: row.record_date,
        studentId: row.student_id,
        studentName: student.fullName,
        branchId: row.branch_id,
        classId: row.class_id,
        className: reportClass.name,
        sessionType: row.session_type,
        surahNumber: row.surah_number,
        ayahStart: row.ayah_start,
        ayahEnd: row.ayah_end,
        rating: row.rating,
        createdAt: row.created_at,
      }];
    })
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.createdAt.localeCompare(left.createdAt)
    );
  return { records, students: summarizeMemorizationStudents(records) };
}

export function summarizeAttendanceStudents(
  records: AttendanceReportRecord[]
): AttendanceStudentSummary[] {
  const summaries = new Map<string, AttendanceStudentSummary>();
  for (const record of records) {
    const current = summaries.get(record.studentId) ?? {
      studentId: record.studentId,
      studentName: record.studentName,
      branchId: record.branchId,
      classId: record.classId,
      className: record.className,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total: 0,
      latestDate: null,
      latestStatus: null,
    };
    current.total += 1;
    if (record.status === "present") current.present += 1;
    if (record.status === "absent") current.absent += 1;
    if (record.status === "late") current.late += 1;
    if (record.status === "excused_absence") current.excused += 1;
    if (!current.latestDate || record.date > current.latestDate) {
      current.latestDate = record.date;
      current.latestStatus = record.status;
    }
    summaries.set(record.studentId, current);
  }
  return [...summaries.values()].sort((left, right) =>
    left.studentName.localeCompare(right.studentName, "ar")
  );
}

export function summarizeMemorizationStudents(
  records: MemorizationReportRecord[]
): MemorizationStudentSummary[] {
  const summaries = new Map<string, MemorizationStudentSummary>();
  const newestFirst = [...records].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      right.createdAt.localeCompare(left.createdAt)
  );
  for (const record of newestFirst) {
    const current = summaries.get(record.studentId) ?? {
      studentId: record.studentId,
      studentName: record.studentName,
      branchId: record.branchId,
      classId: record.classId,
      className: record.className,
      memorizationCount: 0,
      reviewCount: 0,
      total: 0,
      latestDate: null,
      latestSessionType: null,
      latestSurahNumber: null,
      latestAyahStart: null,
      latestAyahEnd: null,
      latestRating: null,
    };
    current.total += 1;
    if (record.sessionType === "new_memorization") {
      current.memorizationCount += 1;
    }
    if (
      record.sessionType === "near_revision" ||
      record.sessionType === "distant_revision"
    ) {
      current.reviewCount += 1;
    }
    if (!current.latestDate || record.date > current.latestDate) {
      current.latestDate = record.date;
      current.latestSessionType = record.sessionType;
      current.latestSurahNumber = record.surahNumber;
      current.latestAyahStart = record.ayahStart;
      current.latestAyahEnd = record.ayahEnd;
      current.latestRating = record.rating;
    }
    summaries.set(record.studentId, current);
  }
  return [...summaries.values()].sort((left, right) =>
    left.studentName.localeCompare(right.studentName, "ar")
  );
}

function latestDate(values: Array<string | null>): string | null {
  const sorted = values
    .filter((value): value is string => Boolean(value))
    .sort();
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

export function buildAcademicClassSummaries(
  classes: AcademicReportClass[],
  attendance: AttendanceReportRecord[],
  memorization: MemorizationReportRecord[]
): AcademicClassSummary[] {
  return classes.map(reportClass => {
    const attendanceRows = attendance.filter(
      row => row.classId === reportClass.id
    );
    const memorizationRows = memorization.filter(
      row => row.classId === reportClass.id
    );
    const studentIds = new Set([
      ...attendanceRows.map(row => row.studentId),
      ...memorizationRows.map(row => row.studentId),
    ]);
    return {
      classId: reportClass.id,
      className: reportClass.name,
      branchId: reportClass.branchId,
      studentCount: studentIds.size,
      attendanceCount: attendanceRows.length,
      absentCount: attendanceRows.filter(row => row.status === "absent").length,
      lateCount: attendanceRows.filter(row => row.status === "late").length,
      memorizationCount: memorizationRows.length,
      latestActivity: latestDate([
        ...attendanceRows.map(row => row.date),
        ...memorizationRows.map(row => row.date),
      ]),
    };
  });
}

export async function fetchAcademicReportsData(
  schoolId: string,
  filters: AcademicReportFilters,
  access: AcademicReportsAccess,
  client: SupabaseClient = getSupabaseClient()
): Promise<AcademicReportsData> {
  validateFilters(filters);
  if (!hasAnyAcademicReportsAccess(access)) {
    throw new AcademicReportsPermissionError();
  }
  const branches = scopeBranches(access);
  const classes = scopeClasses(access);
  assertFilterScope(filters, branches, classes);
  const attendanceClassIds = filteredModuleClassIds(access.attendance, filters);
  const memorizationClassIds = filteredModuleClassIds(
    access.memorization,
    filters
  );
  const visibleClassIds = [
    ...new Set([...attendanceClassIds, ...memorizationClassIds]),
  ];
  const students = await fetchStudents(
    client,
    schoolId,
    filters,
    visibleClassIds
  );
  if (filters.studentId && !students.some(item => item.id === filters.studentId)) {
    throw new AcademicReportsPermissionError();
  }
  const studentsById = new Map(students.map(student => [student.id, student]));
  const classesById = new Map(classes.map(item => [item.id, item]));
  const [attendanceResult, memorizationResult] = await Promise.allSettled([
    access.attendance.state === "ready"
      ? fetchAttendanceReport(
          client,
          schoolId,
          filters,
          attendanceClassIds,
          studentsById,
          classesById
        )
      : Promise.resolve(null),
    access.memorization.state === "ready"
      ? fetchMemorizationReport(
          client,
          schoolId,
          filters,
          memorizationClassIds,
          studentsById,
          classesById
        )
      : Promise.resolve(null),
  ]);

  const attendance: AcademicReportsData["attendance"] =
    access.attendance.state !== "ready"
      ? { state: access.attendance.state }
      : attendanceResult.status === "rejected" || !attendanceResult.value
        ? { state: "error" }
        : { state: "ready", data: attendanceResult.value };
  const memorization: AcademicReportsData["memorization"] =
    access.memorization.state !== "ready"
      ? { state: access.memorization.state }
      : memorizationResult.status === "rejected" || !memorizationResult.value
        ? { state: "error" }
        : { state: "ready", data: memorizationResult.value };
  const attendanceRecords =
    attendance.state === "ready" ? attendance.data.records : [];
  const memorizationRecords =
    memorization.state === "ready" ? memorization.data.records : [];
  const reportStudentIds = new Set([
    ...attendanceRecords.map(row => row.studentId),
    ...memorizationRecords.map(row => row.studentId),
  ]);
  const classesSummary = buildAcademicClassSummaries(
    classes.filter(
      item =>
        (!filters.branchId || item.branchId === filters.branchId) &&
        (!filters.classId || item.id === filters.classId)
    ),
    attendanceRecords,
    memorizationRecords
  );
  return {
    branches,
    classes,
    students,
    attendance,
    memorization,
    classesSummary,
    overview: {
      attendanceCount: attendanceRecords.length,
      presentCount: attendanceRecords.filter(row => row.status === "present")
        .length,
      absentCount: attendanceRecords.filter(row => row.status === "absent")
        .length,
      lateCount: attendanceRecords.filter(row => row.status === "late").length,
      excusedCount: attendanceRecords.filter(
        row => row.status === "excused_absence"
      ).length,
      memorizationCount: memorizationRecords.length,
      studentCount: reportStudentIds.size,
      latestActivity: latestDate([
        ...attendanceRecords.map(row => row.date),
        ...memorizationRecords.map(row => row.date),
      ]),
    },
  };
}

const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused_absence: "بعذر",
};
const sessionTypeLabels: Record<MemorizationSessionType, string> = {
  new_memorization: "حفظ جديد",
  near_revision: "مراجعة قريبة",
  distant_revision: "مراجعة بعيدة",
  assessment: "تقييم",
};

export function getAttendanceStatusLabel(status: AttendanceStatus): string {
  return attendanceStatusLabels[status];
}
export function getMemorizationSessionTypeLabel(
  sessionType: MemorizationSessionType
): string {
  return sessionTypeLabels[sessionType];
}
export function getSurahLabel(surahNumber: number): string {
  return "سورة رقم " + surahNumber;
}

function csvCell(value: string | number | null): string {
  const normalized = value === null ? "" : String(value);
  return '"' + normalized.split('"').join('""') + '"';
}

export function buildAcademicReportsCsv(
  kind: AcademicCsvKind,
  data: AcademicReportsData
): string {
  let rows: Array<Array<string | number | null>>;
  if (kind === "attendance") {
    rows = [
      ["التاريخ", "الطالب", "الحلقة", "الحالة"],
      ...(data.attendance.state === "ready"
        ? data.attendance.data.records.map(row => [
            row.date,
            row.studentName,
            row.className,
            getAttendanceStatusLabel(row.status),
          ])
        : []),
    ];
  } else if (kind === "memorization") {
    rows = [
      [
        "التاريخ",
        "الطالب",
        "الحلقة",
        "نوع الجلسة",
        "السورة",
        "من آية",
        "إلى آية",
        "التقييم",
      ],
      ...(data.memorization.state === "ready"
        ? data.memorization.data.records.map(row => [
            row.date,
            row.studentName,
            row.className,
            getMemorizationSessionTypeLabel(row.sessionType),
            getSurahLabel(row.surahNumber),
            row.ayahStart,
            row.ayahEnd,
            row.rating,
          ])
        : []),
    ];
  } else {
    const attendanceByStudent = new Map(
      data.attendance.state === "ready"
        ? data.attendance.data.students.map(row => [row.studentId, row])
        : []
    );
    const memorizationByStudent = new Map(
      data.memorization.state === "ready"
        ? data.memorization.data.students.map(row => [row.studentId, row])
        : []
    );
    const studentIds = [
      ...new Set([
        ...attendanceByStudent.keys(),
        ...memorizationByStudent.keys(),
      ]),
    ];
    rows = [
      [
        "الطالب",
        "الحلقة",
        "حاضر",
        "غائب",
        "متأخر",
        "بعذر",
        "جلسات الحفظ",
        "جلسات المراجعة",
        "آخر متابعة",
      ],
      ...studentIds.map(studentId => {
        const attendance = attendanceByStudent.get(studentId);
        const memorization = memorizationByStudent.get(studentId);
        return [
          attendance?.studentName ?? memorization?.studentName ?? "",
          attendance?.className ?? memorization?.className ?? "",
          attendance?.present ?? 0,
          attendance?.absent ?? 0,
          attendance?.late ?? 0,
          attendance?.excused ?? 0,
          memorization?.memorizationCount ?? 0,
          memorization?.reviewCount ?? 0,
          latestDate([
            attendance?.latestDate ?? null,
            memorization?.latestDate ?? null,
          ]),
        ];
      }),
    ];
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
