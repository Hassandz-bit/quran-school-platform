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
