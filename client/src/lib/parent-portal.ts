import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export type ParentStudent = {
  schoolId: string;
  schoolName: string;
  studentId: string;
  firstName: string;
  lastName: string;
  branchId: string;
  branchName: string;
  classId: string | null;
  className: string | null;
  relationshipType: string;
  isPrimary: boolean;
};

export type ParentAttendanceSummary = {
  totalRecords: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedAbsenceCount: number;
  lastSessionDate: string | null;
};

export type ParentAttendanceRecord = {
  id: string;
  date: string;
  status: string;
  arrivalTime: string | null;
};

export type ParentMemorizationSummary = {
  totalRecords: number;
  averageRating: number | null;
  totalErrors: number;
  lastRecordDate: string | null;
};

export type ParentMemorizationRecord = {
  id: string;
  date: string;
  sessionType: string;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  rating: number;
  errorsCount: number;
  nextAssignment: string | null;
};

export type ParentStudentAcademicData = {
  attendanceSummary: ParentAttendanceSummary;
  attendanceRecords: ParentAttendanceRecord[];
  memorizationSummary: ParentMemorizationSummary;
  memorizationRecords: ParentMemorizationRecord[];
};

function asNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function listMyGuardianStudents(
  client: SupabaseClient = getSupabaseClient()
): Promise<ParentStudent[]> {
  const { data, error } = await client.rpc("list_my_guardian_students");
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map(row => ({
    schoolId: row.school_id,
    schoolName: row.school_name,
    studentId: row.student_id,
    firstName: row.student_first_name,
    lastName: row.student_last_name,
    branchId: row.branch_id,
    branchName: row.branch_name,
    classId: row.class_id ?? null,
    className: row.class_name ?? null,
    relationshipType: row.relationship_type,
    isPrimary: row.is_primary === true,
  }));
}

export async function fetchParentStudentAcademic(
  schoolId: string,
  studentId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<ParentStudentAcademicData> {
  const [attendanceSummaryResult, attendanceResult, memorizationSummaryResult, memorizationResult] =
    await Promise.all([
      client.rpc("get_my_guardian_student_attendance_summary", {
        target_school_id: schoolId,
        target_student_id: studentId,
      }),
      client.rpc("list_my_guardian_student_attendance", {
        target_school_id: schoolId,
        target_student_id: studentId,
        target_limit: 30,
      }),
      client.rpc("get_my_guardian_student_memorization_summary", {
        target_school_id: schoolId,
        target_student_id: studentId,
      }),
      client.rpc("list_my_guardian_student_memorization", {
        target_school_id: schoolId,
        target_student_id: studentId,
        target_limit: 20,
      }),
    ]);

  const firstError = [
    attendanceSummaryResult.error,
    attendanceResult.error,
    memorizationSummaryResult.error,
    memorizationResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const attendanceSummaryRow = Array.isArray(attendanceSummaryResult.data)
    ? attendanceSummaryResult.data[0]
    : null;
  const memorizationSummaryRow = Array.isArray(memorizationSummaryResult.data)
    ? memorizationSummaryResult.data[0]
    : null;

  return {
    attendanceSummary: {
      totalRecords: asNumber(attendanceSummaryRow?.total_records),
      presentCount: asNumber(attendanceSummaryRow?.present_count),
      absentCount: asNumber(attendanceSummaryRow?.absent_count),
      lateCount: asNumber(attendanceSummaryRow?.late_count),
      excusedAbsenceCount: asNumber(attendanceSummaryRow?.excused_absence_count),
      lastSessionDate: attendanceSummaryRow?.last_session_date ?? null,
    },
    attendanceRecords: (Array.isArray(attendanceResult.data)
      ? attendanceResult.data
      : []
    ).map(row => ({
      id: row.attendance_record_id,
      date: row.session_date,
      status: row.attendance_status,
      arrivalTime: row.arrival_time ?? null,
    })),
    memorizationSummary: {
      totalRecords: asNumber(memorizationSummaryRow?.total_records),
      averageRating: asNullableNumber(memorizationSummaryRow?.average_rating),
      totalErrors: asNumber(memorizationSummaryRow?.total_errors),
      lastRecordDate: memorizationSummaryRow?.last_record_date ?? null,
    },
    memorizationRecords: (Array.isArray(memorizationResult.data)
      ? memorizationResult.data
      : []
    ).map(row => ({
      id: row.memorization_record_id,
      date: row.record_date,
      sessionType: row.session_type,
      surahNumber: asNumber(row.surah_number),
      ayahStart: asNumber(row.ayah_start),
      ayahEnd: asNumber(row.ayah_end),
      rating: asNumber(row.rating),
      errorsCount: asNumber(row.errors_count),
      nextAssignment: row.next_assignment ?? null,
    })),
  };
}
