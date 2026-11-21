import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export type StaffAttendanceCandidate = {
  payeeKind: "teacher" | "employee";
  teacherId: string | null;
  employeeId: string | null;
  branchId: string | null;
  fullName: string;
  jobLabel: string;
  payUnit: "session" | "day" | "hour" | "month" | "task" | "manual";
  expectedUnitsPerWeek: number;
};

export type StaffAttendanceRecord = {
  id: string;
  date: string;
  payeeKind: "teacher" | "employee";
  teacherId: string | null;
  employeeId: string | null;
  fullName: string;
  unitKind: "session" | "day" | "hour" | "task";
  units: number;
  status: "present" | "late" | "partial" | "absent" | "excused" | "leave";
  sessionLabel: string | null;
  note: string | null;
};

type Row = Record<string, unknown>;
const str = (value: unknown) => typeof value === "string" ? value : "";
const nullable = (value: unknown) => typeof value === "string" ? value : null;
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export async function fetchStaffAttendanceCandidates(
  schoolId: string,
  branchId: string | null,
  client: SupabaseClient = getSupabaseClient()
): Promise<StaffAttendanceCandidate[]> {
  const { data, error } = await client.rpc("list_staff_attendance_candidates", {
    target_school_id: schoolId,
    target_branch_id: branchId,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(row => ({
    payeeKind: row.payee_kind === "teacher" ? "teacher" : "employee",
    teacherId: nullable(row.teacher_id),
    employeeId: nullable(row.employee_id),
    branchId: nullable(row.branch_id),
    fullName: str(row.full_name),
    jobLabel: str(row.job_label),
    payUnit: (["session", "day", "hour", "month", "task", "manual"].includes(str(row.pay_unit))
      ? str(row.pay_unit)
      : row.payee_kind === "teacher" ? "session" : "day") as StaffAttendanceCandidate["payUnit"],
    expectedUnitsPerWeek: num(row.expected_units_per_week),
  }));
}

export async function fetchStaffAttendanceRecords(
  schoolId: string,
  branchId: string | null,
  from: string,
  to: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StaffAttendanceRecord[]> {
  const { data, error } = await client.rpc("list_staff_attendance_records", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_from: from,
    target_to: to,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(row => ({
    id: str(row.record_id),
    date: str(row.attendance_date),
    payeeKind: row.payee_kind === "teacher" ? "teacher" : "employee",
    teacherId: nullable(row.teacher_id),
    employeeId: nullable(row.employee_id),
    fullName: str(row.full_name),
    unitKind: str(row.unit_kind) as StaffAttendanceRecord["unitKind"],
    units: num(row.units),
    status: str(row.status) as StaffAttendanceRecord["status"],
    sessionLabel: nullable(row.session_label),
    note: nullable(row.note),
  }));
}

export async function saveStaffAttendance(
  input: {
    schoolId: string;
    branchId: string | null;
    candidate: StaffAttendanceCandidate;
    date: string;
    unitKind: StaffAttendanceRecord["unitKind"];
    units: number;
    status: StaffAttendanceRecord["status"];
    sessionLabel?: string;
    note?: string;
  },
  client: SupabaseClient = getSupabaseClient()
) {
  const { data, error } = await client.rpc("record_staff_attendance", {
    target_school_id: input.schoolId,
    target_branch_id: input.branchId,
    target_payee_kind: input.candidate.payeeKind,
    target_teacher_id: input.candidate.teacherId,
    target_employee_id: input.candidate.employeeId,
    target_attendance_date: input.date,
    target_unit_kind: input.unitKind,
    target_units: input.units,
    target_status: input.status,
    target_session_label: input.sessionLabel?.trim() || null,
    target_note: input.note?.trim() || null,
  });
  if (error) throw error;
  return String(data);
}

export async function updateStaffAttendance(
  input: {
    schoolId: string;
    recordId: string;
    units: number;
    status: StaffAttendanceRecord["status"];
    sessionLabel?: string;
    note?: string;
  },
  client: SupabaseClient = getSupabaseClient()
) {
  const { data, error } = await client.rpc("update_staff_attendance", {
    target_school_id: input.schoolId,
    target_record_id: input.recordId,
    target_units: input.units,
    target_status: input.status,
    target_session_label: input.sessionLabel?.trim() || null,
    target_note: input.note?.trim() || null,
  });
  if (error) throw error;
  return data === true;
}
