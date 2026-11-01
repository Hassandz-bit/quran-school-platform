import { getSupabaseClient } from "./supabase.ts";

export const DUWAM_STUDY_DAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

export type DuwamStudyDay = (typeof DUWAM_STUDY_DAYS)[number];
export type DuwamStatus = "active" | "inactive";

export type Duwam = {
  id: string;
  schoolId: string;
  branchId: string;
  name: string;
  studyDays: DuwamStudyDay[];
  startTime: string;
  endTime: string;
  status: DuwamStatus;
  createdAt: string;
  updatedAt: string;
  classes: Array<{ id: string; name: string; status: string }>;
};

export type DuwamInput = {
  name: string;
  studyDays: DuwamStudyDay[];
  startTime: string;
  endTime: string;
  status?: DuwamStatus;
};

type DuwamRow = {
  id: string;
  school_id: string;
  branch_id: string;
  name: string;
  study_days: DuwamStudyDay[];
  start_time: string;
  end_time: string;
  status: DuwamStatus;
  created_at: string;
  updated_at: string;
};

type DuwamClassRow = {
  id: string;
  name: string;
  status: string;
  duwam_id: string | null;
};

function validateDuwam(input: DuwamInput): void {
  const days = [...new Set(input.studyDays)];
  if (input.name.trim().length < 2 || input.name.trim().length > 120) {
    throw new Error("duwam_name_invalid");
  }
  if (days.length === 0 || days.some(day => !DUWAM_STUDY_DAYS.includes(day))) {
    throw new Error("duwam_days_invalid");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime) ||
      input.startTime >= input.endTime) {
    throw new Error("duwam_time_invalid");
  }
}

async function assertManageBranch(
  schoolId: string,
  branchId: string,
): Promise<void> {
  const { data, error } = await getSupabaseClient().rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: "classes.manage",
  });
  if (error) throw error;
  if (data !== true) throw new Error("duwam_permission_required");
}

function mapDuwam(row: DuwamRow, classes: DuwamClassRow[]): Duwam {
  return {
    id: row.id,
    schoolId: row.school_id,
    branchId: row.branch_id,
    name: row.name,
    studyDays: row.study_days,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    classes: classes
      .filter(item => item.duwam_id === row.id)
      .map(item => ({ id: item.id, name: item.name, status: item.status })),
  };
}

export async function fetchBranchDuwams(
  schoolId: string,
  branchId: string,
): Promise<Duwam[]> {
  const client = getSupabaseClient();
  const { data: duwamRows, error: duwamError } = await client
    .from("duwams")
    .select("id, school_id, branch_id, name, study_days, start_time, end_time, status, created_at, updated_at")
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .order("start_time", { ascending: true })
    .order("name", { ascending: true });
  if (duwamError) throw duwamError;

  const { data: classRows, error: classError } = await client
    .from("classes")
    .select("id, name, status, duwam_id")
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .order("name", { ascending: true });
  if (classError) throw classError;

  return ((duwamRows ?? []) as DuwamRow[]).map(row =>
    mapDuwam(row, (classRows ?? []) as DuwamClassRow[])
  );
}

export async function createBranchDuwam(
  schoolId: string,
  branchId: string,
  input: DuwamInput,
): Promise<string> {
  validateDuwam(input);
  await assertManageBranch(schoolId, branchId);
  const { data, error } = await getSupabaseClient()
    .from("duwams")
    .insert({
      school_id: schoolId,
      branch_id: branchId,
      name: input.name.trim(),
      study_days: [...new Set(input.studyDays)],
      start_time: input.startTime,
      end_time: input.endTime,
      status: input.status ?? "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateBranchDuwam(
  schoolId: string,
  branchId: string,
  duwamId: string,
  input: DuwamInput,
): Promise<void> {
  validateDuwam(input);
  await assertManageBranch(schoolId, branchId);
  const { error } = await getSupabaseClient()
    .from("duwams")
    .update({
      name: input.name.trim(),
      study_days: [...new Set(input.studyDays)],
      start_time: input.startTime,
      end_time: input.endTime,
      status: input.status ?? "active",
    })
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .eq("id", duwamId);
  if (error) throw error;
}

export async function assignClassToDuwam(
  schoolId: string,
  branchId: string,
  classId: string,
  duwamId: string | null,
): Promise<void> {
  await assertManageBranch(schoolId, branchId);
  const client = getSupabaseClient();

  if (duwamId) {
    const { data: duwam, error: duwamError } = await client
      .from("duwams")
      .select("id, study_days, start_time, end_time, status")
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("id", duwamId)
      .maybeSingle();
    if (duwamError) throw duwamError;
    if (!duwam || duwam.status !== "active") throw new Error("duwam_not_active");

    const days = duwam.study_days as DuwamStudyDay[];
    const dayNames: Record<DuwamStudyDay, string> = {
      sunday: "الأحد", monday: "الإثنين", tuesday: "الثلاثاء",
      wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة",
      saturday: "السبت",
    };
    const scheduleLabel = days.map(day => dayNames[day]).join("، ") +
      " · " + String(duwam.start_time).slice(0, 5) +
      "–" + String(duwam.end_time).slice(0, 5);

    const { error } = await client
      .from("classes")
      .update({
        duwam_id: duwamId,
        study_days: days,
        start_time: duwam.start_time,
        end_time: duwam.end_time,
        schedule_label: scheduleLabel,
      })
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("id", classId);
    if (error) throw error;
    return;
  }

  const { error } = await client
    .from("classes")
    .update({ duwam_id: null })
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .eq("id", classId);
  if (error) throw error;
}
