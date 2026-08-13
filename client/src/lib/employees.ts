import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import {
  STAFF_JOB_CODES,
  STAFF_JOB_LABELS,
  type StaffJobCode,
} from "./staff";

export { STAFF_JOB_CODES, STAFF_JOB_LABELS, type StaffJobCode };

export type Employee = {
  id: string;
  branchId: string | null;
  branchName: string | null;
  employeeNumber: string | null;
  fullName: string;
  jobCode: StaffJobCode;
  customJobTitle: string | null;
  phone: string | null;
  hireDate: string | null;
  status: "active" | "inactive";
  linkedProfileId: string | null;
  linkedTeacherId: string | null;
  notes: string | null;
  updatedAt: string;
};

export function getEmployeeJobLabel(
  employee: Pick<Employee, "jobCode" | "customJobTitle">,
  locale: "ar" | "en" = "ar"
) {
  return employee.jobCode === "other"
    ? employee.customJobTitle || STAFF_JOB_LABELS.other[locale]
    : STAFF_JOB_LABELS[employee.jobCode][locale];
}

export async function fetchEmployees(
  schoolId: string,
  branchId: string | null,
  client: SupabaseClient = getSupabaseClient()
): Promise<Employee[]> {
  const { data, error } = await client.rpc("list_staff_employees", {
    target_school_id: schoolId,
    target_branch_id: branchId,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    id: String(row.employee_id),
    branchId: row.branch_id ? String(row.branch_id) : null,
    branchName: row.branch_name ? String(row.branch_name) : null,
    employeeNumber: row.employee_number ? String(row.employee_number) : null,
    fullName: String(row.full_name),
    jobCode: STAFF_JOB_CODES.includes(row.job_code as StaffJobCode)
      ? (row.job_code as StaffJobCode)
      : "other",
    customJobTitle: row.custom_job_title ? String(row.custom_job_title) : null,
    phone: row.phone ? String(row.phone) : null,
    hireDate: row.hire_date ? String(row.hire_date) : null,
    status: row.status === "inactive" ? "inactive" : "active",
    linkedProfileId: row.linked_profile_id ? String(row.linked_profile_id) : null,
    linkedTeacherId: row.linked_teacher_id ? String(row.linked_teacher_id) : null,
    notes: row.notes ? String(row.notes) : null,
    updatedAt: String(row.updated_at),
  }));
}

export async function saveEmployee(
  input: {
    schoolId: string;
    employeeId?: string | null;
    branchId: string | null;
    fullName: string;
    jobCode: StaffJobCode;
    customJobTitle?: string;
    employeeNumber?: string;
    phone?: string;
    hireDate?: string;
    notes?: string;
  },
  client: SupabaseClient = getSupabaseClient()
) {
  const { data, error } = await client.rpc("save_staff_employee", {
    target_school_id: input.schoolId,
    target_employee_id: input.employeeId ?? null,
    target_branch_id: input.branchId,
    target_full_name: input.fullName.trim(),
    target_job_code: input.jobCode,
    target_custom_job_title:
      input.jobCode === "other" ? input.customJobTitle?.trim() || null : null,
    target_employee_number: input.employeeNumber?.trim() || null,
    target_phone: input.phone?.trim() || null,
    target_hire_date: input.hireDate || null,
    target_notes: input.notes?.trim() || null,
    target_linked_profile_id: null,
    target_linked_teacher_id: null,
  });
  if (error) throw error;
  return String(data);
}

export async function setEmployeeStatus(
  schoolId: string,
  employeeId: string,
  status: Employee["status"],
  client: SupabaseClient = getSupabaseClient()
) {
  const { data, error } = await client.rpc("set_staff_employee_status", {
    target_school_id: schoolId,
    target_employee_id: employeeId,
    target_status: status,
  });
  if (error) throw error;
  return data === true;
}
