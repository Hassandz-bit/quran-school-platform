import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type StudentStatus =
  | "active"
  | "suspended"
  | "transferred"
  | "graduated"
  | "withdrawn";

export type StudentGender = "male" | "female";

export type GuardianRelation =
  | "father"
  | "mother"
  | "brother"
  | "sister"
  | "uncle"
  | "aunt"
  | "grandfather"
  | "grandmother"
  | "other";

export type BranchOption = {
  id: string;
  name: string;
  is_main: boolean;
};

export type ClassOption = {
  id: string;
  branch_id: string;
  name: string;
  schedule_label: string | null;
};

export type StudentRow = {
  id: string;
  branch_id: string;
  class_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  start_date: string;
  status: StudentStatus;
};

export type StudentFormValues = {
  branchId: string;
  classId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: StudentGender | "";
  nationalId: string;
  phone: string;
  email: string;
  address: string;
  previousSchool: string;
  educationLevel: string;
  guardianName: string;
  guardianRelation: GuardianRelation | "";
  guardianPhone: string;
  guardianEmail: string;
  guardianJob: string;
  startDate: string;
  birthCertificateProvided: boolean;
  photosProvided: boolean;
  medicalReportProvided: boolean;
  previousCertificateProvided: boolean;
};

export type StudentInsert = {
  school_id: string;
  branch_id: string;
  class_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: StudentGender;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  previous_school: string | null;
  education_level: string | null;
  guardian_name: string;
  guardian_relation: GuardianRelation;
  guardian_phone: string;
  guardian_email: string | null;
  guardian_job: string | null;
  start_date: string;
  status: "active";
  birth_certificate_provided: boolean;
  photos_provided: boolean;
  medical_report_provided: boolean;
  previous_certificate_provided: boolean;
};

type LookupOptions = {
  activeOnly?: boolean;
};

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export function buildStudentInsert(
  schoolId: string,
  values: StudentFormValues
): StudentInsert {
  return {
    school_id: schoolId,
    branch_id: values.branchId.trim(),
    class_id: optionalText(values.classId),
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    birth_date: values.birthDate.trim(),
    gender: values.gender as StudentGender,
    national_id: optionalText(values.nationalId),
    phone: optionalText(values.phone),
    email: optionalText(values.email),
    address: optionalText(values.address),
    previous_school: optionalText(values.previousSchool),
    education_level: optionalText(values.educationLevel),
    guardian_name: values.guardianName.trim(),
    guardian_relation: values.guardianRelation as GuardianRelation,
    guardian_phone: values.guardianPhone.trim(),
    guardian_email: optionalText(values.guardianEmail),
    guardian_job: optionalText(values.guardianJob),
    start_date: values.startDate.trim(),
    status: "active",
    birth_certificate_provided: values.birthCertificateProvided,
    photos_provided: values.photosProvided,
    medical_report_provided: values.medicalReportProvided,
    previous_certificate_provided: values.previousCertificateProvided,
  };
}

export async function fetchBranches(
  schoolId: string,
  { activeOnly = true }: LookupOptions = {}
): Promise<BranchOption[]> {
  const client = getSupabaseClient();
  let query = client
    .from("branches")
    .select("id, name, is_main")
    .eq("school_id", schoolId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as BranchOption[];
}

export async function fetchClasses(
  schoolId: string,
  branchId?: string,
  { activeOnly = true }: LookupOptions = {}
): Promise<ClassOption[]> {
  const client = getSupabaseClient();
  let query = client
    .from("classes")
    .select("id, branch_id, name, schedule_label")
    .eq("school_id", schoolId)
    .order("name", { ascending: true });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as ClassOption[];
}

export async function fetchStudents(schoolId: string): Promise<StudentRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("students")
    .select(
      "id, branch_id, class_id, first_name, last_name, phone, email, start_date, status"
    )
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as StudentRow[];
}

export async function addStudent(
  schoolId: string,
  values: StudentFormValues
): Promise<void> {
  const payload = buildStudentInsert(schoolId, values);
  const { error } = await getSupabaseClient().from("students").insert(payload);

  if (error) throw error;
}

const statusLabels: Record<"ar" | "en", Record<StudentStatus, string>> = {
  ar: {
    active: "نشط",
    suspended: "موقوف",
    transferred: "منقول",
    graduated: "متخرج",
    withdrawn: "منسحب",
  },
  en: {
    active: "Active",
    suspended: "Suspended",
    transferred: "Transferred",
    graduated: "Graduated",
    withdrawn: "Withdrawn",
  },
};

export function translateStudentStatus(
  status: StudentStatus,
  locale: "ar" | "en" = "ar"
): string {
  return statusLabels[locale][status];
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;

export function getStudentSaveErrorMessage(error: unknown): string {
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (code === "23505") {
    return "رقم الهوية مستخدم لطالب آخر.";
  }

  if (code === "23503") {
    return "تعذر التحقق من الفرع أو الحلقة المختارة.";
  }

  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "لا تملك صلاحية إضافة الطلاب.";
  }

  return "تعذر حفظ بيانات الطالب حاليًا.";
}
