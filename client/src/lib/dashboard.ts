import { getSupabaseClient } from "./supabase.ts";

export type DashboardClass = {
  id: string;
  branch_id: string;
  name: string;
  code: string;
  schedule_label: string | null;
  status: "active";
};

export type DashboardBranch = {
  id: string;
  name: string;
};

export type DashboardData = {
  totalStudents: number;
  activeClassesCount: number;
  activeClasses: DashboardClass[];
  branches: DashboardBranch[];
};

export type DashboardLocale = "ar" | "en";
export type DashboardErrorKind = "load" | "missingSchool";

const dashboardErrorMessages: Record<
  DashboardLocale,
  Record<DashboardErrorKind, string>
> = {
  ar: {
    load: "تعذر تحميل بيانات لوحة التحكم حاليًا.",
    missingSchool: "تعذر تحديد المدرسة الحالية.",
  },
  en: {
    load: "Dashboard data could not be loaded right now.",
    missingSchool: "The current school could not be identified.",
  },
};

export function normalizeDashboardCount(count: number | null): number {
  return count ?? 0;
}

export function getDashboardScheduleLabel(
  scheduleLabel: string | null,
  locale: DashboardLocale = "ar"
): string {
  const normalized = scheduleLabel?.trim();
  if (normalized) return normalized;
  return locale === "ar" ? "غير محدد" : "Not set";
}

export function getDashboardErrorMessage(
  kind: DashboardErrorKind,
  locale: DashboardLocale = "ar"
): string {
  return dashboardErrorMessages[locale][kind];
}

export async function fetchDashboardData(
  schoolId: string
): Promise<DashboardData> {
  const supabase = getSupabaseClient();

  const [studentsResult, classesCountResult, classesResult, branchesResult] =
    await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId),
      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "active"),
      supabase
        .from("classes")
        .select("id, branch_id, name, code, schedule_label, status")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(5),
      supabase
        .from("branches")
        .select("id, name")
        .eq("school_id", schoolId)
        .order("name", { ascending: true }),
    ]);

  if (
    studentsResult.error ||
    classesCountResult.error ||
    classesResult.error ||
    branchesResult.error
  ) {
    throw new Error("dashboard_data_load_failed");
  }

  return {
    totalStudents: normalizeDashboardCount(studentsResult.count),
    activeClassesCount: normalizeDashboardCount(classesCountResult.count),
    activeClasses: (classesResult.data ?? []) as DashboardClass[],
    branches: (branchesResult.data ?? []) as DashboardBranch[],
  };
}
