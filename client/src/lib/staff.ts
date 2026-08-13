import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export const STAFF_JOB_CODES = [
  "manager",
  "deputy_manager",
  "bursar",
  "teacher",
  "guard",
  "cleaner",
  "driver",
  "other",
] as const;

export type StaffJobCode = (typeof STAFF_JOB_CODES)[number];

export const STAFF_JOB_LABELS: Record<StaffJobCode, { ar: string; en: string }> = {
  manager: { ar: "المدير", en: "Manager" },
  deputy_manager: { ar: "نائب المدير", en: "Deputy manager" },
  bursar: { ar: "المقتصد", en: "Bursar" },
  teacher: { ar: "المعلم", en: "Teacher" },
  guard: { ar: "الحارس", en: "Guard" },
  cleaner: { ar: "عامل النظافة", en: "Cleaner" },
  driver: { ar: "السائق", en: "Driver" },
  other: { ar: "وظيفة أخرى", en: "Other job" },
};

export type StaffPosition = {
  positionId: string;
  membershipId: string;
  profileId: string;
  fullName: string;
  branchId: string | null;
  branchName: string | null;
  jobCode: StaffJobCode;
  customJobTitle: string | null;
  status: "active" | "inactive";
  updatedAt: string;
};

export function getStaffJobLabel(
  position: Pick<StaffPosition, "jobCode" | "customJobTitle">,
  locale: "ar" | "en" = "ar"
): string {
  if (position.jobCode === "other") return position.customJobTitle || STAFF_JOB_LABELS.other[locale];
  return STAFF_JOB_LABELS[position.jobCode][locale];
}

export async function fetchSchoolStaff(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<StaffPosition[]> {
  const { data, error } = await client.rpc("list_school_staff", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    positionId: String(row.position_id),
    membershipId: String(row.membership_id),
    profileId: String(row.profile_id),
    fullName: String(row.full_name),
    branchId: row.branch_id ? String(row.branch_id) : null,
    branchName: row.branch_name ? String(row.branch_name) : null,
    jobCode: STAFF_JOB_CODES.includes(row.job_code as StaffJobCode)
      ? row.job_code as StaffJobCode
      : "other",
    customJobTitle: row.custom_job_title ? String(row.custom_job_title) : null,
    status: row.status === "inactive" ? "inactive" : "active",
    updatedAt: String(row.updated_at),
  }));
}

export async function saveStaffPosition(
  input: {
    schoolId: string;
    membershipId: string;
    jobCode: StaffJobCode;
    customJobTitle?: string;
    branchId?: string | null;
  },
  client: SupabaseClient = getSupabaseClient()
): Promise<string> {
  const { data, error } = await client.rpc("upsert_staff_position", {
    target_school_id: input.schoolId,
    target_membership_id: input.membershipId,
    target_job_code: input.jobCode,
    target_custom_job_title: input.jobCode === "other" ? input.customJobTitle?.trim() || null : null,
    target_branch_id: input.branchId || null,
  });
  if (error) throw error;
  return String(data);
}

export async function deactivateStaffPosition(
  schoolId: string,
  positionId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("deactivate_staff_position", {
    target_school_id: schoolId,
    target_position_id: positionId,
  });
  if (error) throw error;
  return data === true;
}
