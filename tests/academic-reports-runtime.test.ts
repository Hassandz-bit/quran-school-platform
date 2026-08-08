import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import {
  AcademicReportsPermissionError,
  buildAcademicReportsCsv,
  fetchAcademicReportsData,
  summarizeAttendanceStudents,
  summarizeMemorizationStudents,
  type AcademicReportsAccess,
  type AttendanceReportRecord,
  type MemorizationReportRecord,
} from "@/lib/academic-reports";

const filters = {
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
  branchId: "",
  classId: "",
  studentId: "",
};

const access: AcademicReportsAccess = {
  attendance: {
    state: "ready",
    scope: {
      canView: true,
      canManage: false,
      branches: [
        { id: "branch-1", name: "الفرع الأول", isMain: true, canManage: false },
      ],
      classes: [
        {
          id: "class-1",
          branchId: "branch-1",
          name: "حلقة الفجر",
          scheduleLabel: null,
          canManage: false,
        },
      ],
    },
  },
  memorization: {
    state: "ready",
    scope: {
      canView: true,
      canManage: false,
      branches: [
        { id: "branch-1", name: "الفرع الأول", isMain: true, canManage: false },
      ],
      classes: [
        {
          id: "class-1",
          branchId: "branch-1",
          name: "حلقة الفجر",
          scheduleLabel: null,
          canManage: false,
        },
      ],
    },
  },
};

type QueryLog = {
  table: string;
  filters: Array<{ kind: "eq" | "in" | "gte" | "lte"; column: string; value: unknown }>;
};

function buildClient(fixtures: Record<string, Array<Record<string, unknown>>>) {
  const logs: QueryLog[] = [];
  const from = vi.fn((table: string) => {
    const log: QueryLog = { table, filters: [] };
    logs.push(log);
    const query = {
      select: vi.fn().mockReturnThis(),
      eq(column: string, value: unknown) {
        log.filters.push({ kind: "eq", column, value });
        return this;
      },
      in(column: string, value: unknown[]) {
        log.filters.push({ kind: "in", column, value });
        return this;
      },
      gte(column: string, value: unknown) {
        log.filters.push({ kind: "gte", column, value });
        return this;
      },
      lte(column: string, value: unknown) {
        log.filters.push({ kind: "lte", column, value });
        return this;
      },
      order: vi.fn().mockReturnThis(),
      then(
        resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown
      ) {
        const rows = (fixtures[table] ?? []).filter(row =>
          log.filters.every(filter => {
            const value = row[filter.column];
            if (filter.kind === "eq") return value === filter.value;
            if (filter.kind === "in") {
              return (filter.value as unknown[]).includes(value);
            }
            if (filter.kind === "gte") return String(value) >= String(filter.value);
            return String(value) <= String(filter.value);
          })
        );
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  });
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    logs,
  };
}

function attendanceRecord(
  id: string,
  studentId: string,
  studentName: string,
  status: AttendanceReportRecord["status"],
  date: string,
  classId = "class-1"
): AttendanceReportRecord {
  return {
    id,
    sessionId: "session-" + id,
    date,
    studentId,
    studentName,
    branchId: "branch-1",
    classId,
    className: classId === "class-1" ? "حلقة الفجر" : "حلقة أخرى",
    status,
  };
}

describe("Academic Reports calculations", () => {
  test("keeps student and class attendance counts isolated", () => {
    const records = [
      attendanceRecord("a1", "student-a", "الطالب أ", "present", "2026-08-01"),
      attendanceRecord("a2", "student-a", "الطالب أ", "present", "2026-08-02"),
      attendanceRecord("a3", "student-a", "الطالب أ", "present", "2026-08-03"),
      attendanceRecord("a4", "student-a", "الطالب أ", "absent", "2026-08-04"),
      attendanceRecord("a5", "student-a", "الطالب أ", "late", "2026-08-05"),
      attendanceRecord("b1", "student-b", "الطالب ب", "present", "2026-08-01"),
      attendanceRecord("b2", "student-b", "الطالب ب", "present", "2026-08-02"),
      attendanceRecord("b3", "student-b", "الطالب ب", "excused_absence", "2026-08-03"),
      attendanceRecord("b4", "student-b", "الطالب ب", "excused_absence", "2026-08-04"),
    ];

    const summary = summarizeAttendanceStudents(records);
    expect(summary.find(row => row.studentId === "student-a")).toMatchObject({
      present: 3,
      absent: 1,
      late: 1,
      excused: 0,
      total: 5,
      latestDate: "2026-08-05",
    });
    expect(summary.find(row => row.studentId === "student-b")).toMatchObject({
      present: 2,
      absent: 0,
      late: 0,
      excused: 2,
      total: 4,
      latestDate: "2026-08-04",
    });
  });

  test("counts memorization and review separately and keeps the latest session", () => {
    const records: MemorizationReportRecord[] = [
      {
        id: "m3",
        date: "2026-08-08",
        studentId: "student-a",
        studentName: "الطالب أ",
        branchId: "branch-1",
        classId: "class-1",
        className: "حلقة الفجر",
        sessionType: "near_revision",
        surahNumber: 2,
        ayahStart: 10,
        ayahEnd: 20,
        rating: 4,
        createdAt: "2026-08-08T09:00:00Z",
      },
      {
        id: "m2",
        date: "2026-08-05",
        studentId: "student-a",
        studentName: "الطالب أ",
        branchId: "branch-1",
        classId: "class-1",
        className: "حلقة الفجر",
        sessionType: "distant_revision",
        surahNumber: 1,
        ayahStart: 1,
        ayahEnd: 7,
        rating: 3,
        createdAt: "2026-08-05T09:00:00Z",
      },
      {
        id: "m1",
        date: "2026-08-02",
        studentId: "student-a",
        studentName: "الطالب أ",
        branchId: "branch-1",
        classId: "class-1",
        className: "حلقة الفجر",
        sessionType: "new_memorization",
        surahNumber: 2,
        ayahStart: 1,
        ayahEnd: 9,
        rating: 5,
        createdAt: "2026-08-02T09:00:00Z",
      },
    ];

    expect(summarizeMemorizationStudents(records)[0]).toMatchObject({
      memorizationCount: 1,
      reviewCount: 2,
      total: 3,
      latestDate: "2026-08-08",
      latestSessionType: "near_revision",
      latestSurahNumber: 2,
      latestAyahStart: 10,
      latestAyahEnd: 20,
      latestRating: 4,
    });
  });
});

describe("Academic Reports access and query boundaries", () => {
  test("applies school, class and date scope and excludes other tenants/classes", async () => {
    const { client, logs } = buildClient({
      students: [
        { id: "student-a", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", first_name: "الطالب", last_name: "أ" },
        { id: "student-b", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", first_name: "الطالب", last_name: "ب" },
        { id: "student-other-class", school_id: "school-1", branch_id: "branch-1", class_id: "class-2", first_name: "خارج", last_name: "الحلقة" },
        { id: "student-other-school", school_id: "school-2", branch_id: "branch-1", class_id: "class-1", first_name: "خارج", last_name: "المدرسة" },
      ],
      attendance_sessions: [
        { id: "s1", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", session_date: "2026-08-03" },
        { id: "s2", school_id: "school-1", branch_id: "branch-1", class_id: "class-2", session_date: "2026-08-03" },
        { id: "s3", school_id: "school-2", branch_id: "branch-1", class_id: "class-1", session_date: "2026-08-03" },
      ],
      attendance_records: [
        { id: "r1", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", session_id: "s1", student_id: "student-a", status: "present" },
        { id: "r2", school_id: "school-1", branch_id: "branch-1", class_id: "class-2", session_id: "s2", student_id: "student-other-class", status: "present" },
        { id: "r3", school_id: "school-2", branch_id: "branch-1", class_id: "class-1", session_id: "s3", student_id: "student-other-school", status: "present" },
      ],
      memorization_records: [
        { id: "m1", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", student_id: "student-b", record_date: "2026-08-04", session_type: "new_memorization", surah_number: 1, ayah_start: 1, ayah_end: 7, rating: 5, created_at: "2026-08-04T09:00:00Z" },
        { id: "m2", school_id: "school-1", branch_id: "branch-1", class_id: "class-2", student_id: "student-other-class", record_date: "2026-08-04", session_type: "new_memorization", surah_number: 2, ayah_start: 1, ayah_end: 5, rating: 4, created_at: "2026-08-04T09:00:00Z" },
      ],
    });

    const data = await fetchAcademicReportsData("school-1", filters, access, client);
    expect(data.students.map(row => row.id)).toEqual(["student-a", "student-b"]);
    expect(data.attendance.state === "ready" && data.attendance.data.records.map(row => row.id)).toEqual(["r1"]);
    expect(data.memorization.state === "ready" && data.memorization.data.records.map(row => row.id)).toEqual(["m1"]);
    for (const log of logs) {
      expect(log.filters).toContainEqual({ kind: "eq", column: "school_id", value: "school-1" });
      expect(log.filters).toContainEqual({ kind: "in", column: "class_id", value: ["class-1"] });
    }
    expect(logs.find(log => log.table === "attendance_sessions")?.filters).toEqual(
      expect.arrayContaining([
        { kind: "gte", column: "session_date", value: "2026-08-01" },
        { kind: "lte", column: "session_date", value: "2026-08-31" },
      ])
    );
  });

  test("does not query a module without its existing permission", async () => {
    const { client, from } = buildClient({
      students: [],
      memorization_records: [],
    });
    await fetchAcademicReportsData(
      "school-1",
      filters,
      { ...access, attendance: { state: "hidden" } },
      client
    );
    expect(from).not.toHaveBeenCalledWith("attendance_sessions");
    expect(from).not.toHaveBeenCalledWith("attendance_records");
  });

  test("finance-only access cannot open academic reports", async () => {
    const { client, from } = buildClient({});
    await expect(
      fetchAcademicReportsData(
        "school-1",
        filters,
        {
          attendance: { state: "hidden" },
          memorization: { state: "hidden" },
        },
        client
      )
    ).rejects.toBeInstanceOf(AcademicReportsPermissionError);
    expect(from).not.toHaveBeenCalled();
  });

  test("rejects an explicitly selected class outside the teacher scope", async () => {
    const { client } = buildClient({});
    await expect(
      fetchAcademicReportsData(
        "school-1",
        { ...filters, classId: "class-2" },
        access,
        client
      )
    ).rejects.toBeInstanceOf(AcademicReportsPermissionError);
  });

  test("CSV has a UTF-8 BOM and only the already filtered rows", async () => {
    const { client } = buildClient({
      students: [
        { id: "student-a", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", first_name: "الطالب", last_name: "أ" },
      ],
      attendance_sessions: [
        { id: "s1", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", session_date: "2026-08-03" },
      ],
      attendance_records: [
        { id: "r1", school_id: "school-1", branch_id: "branch-1", class_id: "class-1", session_id: "s1", student_id: "student-a", status: "present" },
      ],
      memorization_records: [],
    });
    const data = await fetchAcademicReportsData("school-1", filters, access, client);
    const csv = buildAcademicReportsCsv("attendance", data);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("الطالب أ");
    expect(csv).not.toContain("خارج الحلقة");
  });
});
