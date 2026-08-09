import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type StudentStatus =
  | "active"
  | "suspended"
  | "transferred"
  | "graduated"
  | "withdrawn";

export type StudentGender = "male" | "female";
export type EducationLevel = "primary" | "middle" | "secondary" | "university";

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

export type BranchOption = { id: string; name: string; is_main: boolean };
export type ClassOption = { id: string; branch_id: string; name: string; schedule_label: string | null };

export type StudentRow = {
  id: string;
  branch_id: string;
  class_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  education_level: EducationLevel | null;
  education_year: number | null;
  photo_path: string | null;
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
  educationLevel: EducationLevel | "";
  educationYear?: string;
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
  education_level: EducationLevel | null;
  education_year: number | null;
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

type LookupOptions = { activeOnly?: boolean };

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const EDUCATION_LEVELS = new Set<EducationLevel>(["primary", "middle", "secondary", "university"]);
const educationYearLimits: Record<EducationLevel, number> = {
  primary: 5,
  middle: 4,
  secondary: 3,
  university: 10,
};
const educationLabels: Record<"ar" | "en", Record<EducationLevel, string>> = {
  ar: { primary: "ابتدائي", middle: "متوسط", secondary: "ثانوي", university: "جامعي" },
  en: { primary: "Primary", middle: "Middle school", secondary: "Secondary", university: "University" },
};

export function getEducationYearOptions(level: EducationLevel | ""): number[] {
  if (!level) return [];
  return Array.from({ length: educationYearLimits[level] }, (_, index) => index + 1);
}

export function translateEducationLevel(
  level: EducationLevel | null | undefined,
  locale: "ar" | "en" = "ar"
): string {
  return level ? educationLabels[locale][level] : "—";
}

export function formatEducation(
  level: EducationLevel | null | undefined,
  year: number | null | undefined,
  locale: "ar" | "en" = "ar"
): string {
  if (!level) return "—";
  const stage = translateEducationLevel(level, locale);
  if (!year) return stage;
  return locale === "ar" ? `${stage} — السنة ${year}` : `${stage} — Year ${year}`;
}

export function buildStudentInsert(schoolId: string, values: StudentFormValues): StudentInsert {
  const rawEducationLevel = String(values.educationLevel ?? "").trim();
  const educationLevel = EDUCATION_LEVELS.has(rawEducationLevel as EducationLevel)
    ? (rawEducationLevel as EducationLevel)
    : null;
  const educationYearText = values.educationYear?.trim() ?? "";
  const parsedEducationYear = educationYearText ? Number(educationYearText) : null;

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
    education_level: educationLevel,
    education_year: educationLevel && Number.isInteger(parsedEducationYear) ? parsedEducationYear : null,
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
  if (activeOnly) query = query.eq("status", "active");
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
  if (branchId) query = query.eq("branch_id", branchId);
  if (activeOnly) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ClassOption[];
}

export async function fetchStudents(schoolId: string): Promise<StudentRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("students")
    .select("id, branch_id, class_id, first_name, last_name, phone, email, education_level, education_year, photo_path, start_date, status")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StudentRow[];
}

export async function addStudent(schoolId: string, values: StudentFormValues): Promise<string> {
  const payload = buildStudentInsert(schoolId, values);
  const { data, error } = await getSupabaseClient().from("students").insert(payload).select("id").single();
  if (error) throw error;
  if (!data?.id) throw new Error("student_insert_missing_id");
  return data.id as string;
}

const STUDENT_PHOTO_BUCKET = "student-photos";
const STUDENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const STUDENT_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function photoExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function validateStudentPhoto(file: File): string | null {
  if (!STUDENT_PHOTO_TYPES.has(file.type)) return "الصورة يجب أن تكون JPG أو PNG أو WebP.";
  if (file.size > STUDENT_PHOTO_MAX_BYTES) return "حجم صورة الطالب يجب ألا يتجاوز 5 ميغابايت.";
  return null;
}

export async function uploadStudentPhoto(schoolId: string, studentId: string, file: File): Promise<string> {
  const validationError = validateStudentPhoto(file);
  if (validationError) throw new Error(validationError);
  const client = getSupabaseClient();
  const path = `${schoolId}/${studentId}/profile-${crypto.randomUUID()}.${photoExtension(file)}`;
  const upload = await client.storage.from(STUDENT_PHOTO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const { error: updateError } = await client
    .from("students")
    .update({ photo_path: path, photos_provided: true })
    .eq("school_id", schoolId)
    .eq("id", studentId);
  if (updateError) {
    await client.storage.from(STUDENT_PHOTO_BUCKET).remove([path]);
    throw updateError;
  }
  return path;
}

export async function createStudentPhotoSignedUrl(
  photoPath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await getSupabaseClient().storage
    .from(STUDENT_PHOTO_BUCKET)
    .createSignedUrl(photoPath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

const statusLabels: Record<"ar" | "en", Record<StudentStatus, string>> = {
  ar: { active: "نشط", suspended: "موقوف", transferred: "منقول", graduated: "متخرج", withdrawn: "منسحب" },
  en: { active: "Active", suspended: "Suspended", transferred: "Transferred", graduated: "Graduated", withdrawn: "Withdrawn" },
};

export function translateStudentStatus(status: StudentStatus, locale: "ar" | "en" = "ar"): string {
  return statusLabels[locale][status];
}

type SafeError = Pick<PostgrestError, "code" | "message"> | null | undefined;
export function getStudentSaveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("الصورة")) return error.message;
  const safeError = error as SafeError;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";
  if (code === "23505") return "رقم الهوية مستخدم لطالب آخر.";
  if (code === "23503") return "تعذر التحقق من الفرع أو الحلقة المختارة.";
  if (code === "23514") return "تحقق من المرحلة الدراسية والسنة المختارة.";
  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) return "لا تملك صلاحية إضافة أو تعديل الطلاب.";
  return "تعذر حفظ بيانات الطالب حاليًا.";
}
