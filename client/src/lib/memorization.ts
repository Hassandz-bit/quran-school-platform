import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const MEMORIZATION_SESSION_TYPES = [
  "new_memorization",
  "near_revision",
  "distant_revision",
  "assessment",
] as const;

export type MemorizationSessionType =
  (typeof MEMORIZATION_SESSION_TYPES)[number];
export type MemorizationPermissionCode =
  | "memorization.view"
  | "memorization.manage";

const SURAH_NAMES = [
  "الفاتحة",
  "البقرة",
  "آل عمران",
  "النساء",
  "المائدة",
  "الأنعام",
  "الأعراف",
  "الأنفال",
  "التوبة",
  "يونس",
  "هود",
  "يوسف",
  "الرعد",
  "إبراهيم",
  "الحجر",
  "النحل",
  "الإسراء",
  "الكهف",
  "مريم",
  "طه",
  "الأنبياء",
  "الحج",
  "المؤمنون",
  "النور",
  "الفرقان",
  "الشعراء",
  "النمل",
  "القصص",
  "العنكبوت",
  "الروم",
  "لقمان",
  "السجدة",
  "الأحزاب",
  "سبأ",
  "فاطر",
  "يس",
  "الصافات",
  "ص",
  "الزمر",
  "غافر",
  "فصلت",
  "الشورى",
  "الزخرف",
  "الدخان",
  "الجاثية",
  "الأحقاف",
  "محمد",
  "الفتح",
  "الحجرات",
  "ق",
  "الذاريات",
  "الطور",
  "النجم",
  "القمر",
  "الرحمن",
  "الواقعة",
  "الحديد",
  "المجادلة",
  "الحشر",
  "الممتحنة",
  "الصف",
  "الجمعة",
  "المنافقون",
  "التغابن",
  "الطلاق",
  "التحريم",
  "الملك",
  "القلم",
  "الحاقة",
  "المعارج",
  "نوح",
  "الجن",
  "المزمل",
  "المدثر",
  "القيامة",
  "الإنسان",
  "المرسلات",
  "النبأ",
  "النازعات",
  "عبس",
  "التكوير",
  "الانفطار",
  "المطففين",
  "الانشقاق",
  "البروج",
  "الطارق",
  "الأعلى",
  "الغاشية",
  "الفجر",
  "البلد",
  "الشمس",
  "الليل",
  "الضحى",
  "الشرح",
  "التين",
  "العلق",
  "القدر",
  "البينة",
  "الزلزلة",
  "العاديات",
  "القارعة",
  "التكاثر",
  "العصر",
  "الهمزة",
  "الفيل",
  "قريش",
  "الماعون",
  "الكوثر",
  "الكافرون",
  "النصر",
  "المسد",
  "الإخلاص",
  "الفلق",
  "الناس",
] as const;

const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52,
  99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88,
  69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59,
  37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31,
  50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
  11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5,
  4, 5, 6,
] as const;

export type QuranSurah = {
  number: number;
  name: string;
  ayahCount: number;
};

export const QURAN_SURAHS: ReadonlyArray<QuranSurah> = SURAH_NAMES.map(
  (name, index) => ({
    number: index + 1,
    name,
    ayahCount: SURAH_AYAH_COUNTS[index],
  })
);

export type MemorizationBranch = {
  id: string;
  name: string;
  isMain: boolean;
  canManage: boolean;
};

export type MemorizationClass = {
  id: string;
  branchId: string;
  name: string;
  scheduleLabel: string | null;
  canManage: boolean;
};

export type MemorizationScope = {
  canView: boolean;
  canManage: boolean;
  branches: MemorizationBranch[];
  classes: MemorizationClass[];
};

export type MemorizationStudent = {
  id: string;
  fullName: string;
};

export type MemorizationTeacher = {
  id: string;
  profileId: string | null;
  fullName: string;
};

export type MemorizationWorkspace = {
  students: MemorizationStudent[];
  teachers: MemorizationTeacher[];
};

export type MemorizationRecord = {
  id: string;
  studentId: string;
  teacherId: string;
  recordDate: string;
  sessionType: MemorizationSessionType;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  rating: number;
  errorsCount: number;
  notes: string;
  nextAssignment: string;
  createdAt: string;
  updatedAt: string;
};

export type MemorizationAuditEntry = {
  id: string;
  operation: "insert" | "update";
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown>;
  changedBy: string;
  changedAt: string;
};

export type MemorizationDraft = {
  recordId: string | null;
  teacherId: string;
  recordDate: string;
  sessionType: MemorizationSessionType;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  rating: number;
  errorsCount: number;
  notes: string;
  nextAssignment: string;
};

export type SaveMemorizationInput = {
  schoolId: string;
  branchId: string;
  classId: string;
  studentId: string;
  draft: MemorizationDraft;
};

export type SaveMemorizationResult = {
  recordId: string;
  mode: "created" | "updated";
};

type BranchCandidateRow = { id: string };
type BranchRow = { id: string; name: string; is_main: boolean };
type ClassCandidateRow = { id: string; branch_id: string };
type ClassRow = {
  id: string;
  branch_id: string;
  name: string;
  schedule_label: string | null;
};
type StudentRow = { id: string; first_name: string; last_name: string };
type TeacherRow = {
  id: string;
  profile_id: string | null;
  first_name: string;
  last_name: string;
};
type RecordRow = {
  id: string;
  student_id: string;
  teacher_id: string;
  record_date: string;
  session_type: MemorizationSessionType;
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  rating: number;
  errors_count: number;
  notes: string | null;
  next_assignment: string | null;
  created_at: string;
  updated_at: string;
};
type AuditRow = {
  id: string;
  operation: "insert" | "update";
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown>;
  changed_by: string;
  changed_at: string;
};
type Access = { view: boolean; manage: boolean };

export class MemorizationPermissionError extends Error {
  constructor() {
    super("memorization_permission_required");
    this.name = "MemorizationPermissionError";
  }
}

export class MemorizationValidationError extends Error {
  constructor(message = "memorization_validation_failed") {
    super(message);
    this.name = "MemorizationValidationError";
  }
}

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permissionCode: MemorizationPermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

async function hasBranchPermission(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  permissionCode: MemorizationPermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("has_branch_permission", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

export async function canAccessMemorizationClass(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  classId: string,
  permissionCode: MemorizationPermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("can_access_memorization_class", {
    target_school_id: schoolId,
    target_branch_id: branchId,
    target_class_id: classId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

async function getClassAccess(
  client: SupabaseClient,
  schoolId: string,
  row: ClassCandidateRow
): Promise<Access> {
  const [view, manage] = await Promise.all([
    canAccessMemorizationClass(
      client,
      schoolId,
      row.branch_id,
      row.id,
      "memorization.view"
    ),
    canAccessMemorizationClass(
      client,
      schoolId,
      row.branch_id,
      row.id,
      "memorization.manage"
    ),
  ]);

  return { view, manage };
}

export async function fetchMemorizationScope(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<MemorizationScope> {
  const [branchCandidatesResult, classCandidatesResult, schoolView, schoolManage] =
    await Promise.all([
      client
        .from("branches")
        .select("id")
        .eq("school_id", schoolId)
        .eq("status", "active"),
      client
        .from("classes")
        .select("id, branch_id")
        .eq("school_id", schoolId)
        .eq("status", "active"),
      hasSchoolPermission(client, schoolId, "memorization.view"),
      hasSchoolPermission(client, schoolId, "memorization.manage"),
    ]);

  if (branchCandidatesResult.error) throw branchCandidatesResult.error;
  if (classCandidatesResult.error) throw classCandidatesResult.error;

  const branchCandidates = (branchCandidatesResult.data ??
    []) as BranchCandidateRow[];
  const classCandidates = (classCandidatesResult.data ??
    []) as ClassCandidateRow[];

  const [branchAccessEntries, classAccessEntries] = await Promise.all([
    Promise.all(
      branchCandidates.map(async branch => {
        const [view, manage] = await Promise.all([
          hasBranchPermission(
            client,
            schoolId,
            branch.id,
            "memorization.view"
          ),
          hasBranchPermission(
            client,
            schoolId,
            branch.id,
            "memorization.manage"
          ),
        ]);
        return [branch.id, { view, manage }] as const;
      })
    ),
    Promise.all(
      classCandidates.map(
        async row => [row.id, await getClassAccess(client, schoolId, row)] as const
      )
    ),
  ]);

  const branchAccess = new Map<string, Access>(branchAccessEntries);
  const classAccess = new Map<string, Access>(classAccessEntries);
  const allowedClassIds = classCandidates
    .filter(row => {
      const access = classAccess.get(row.id);
      return Boolean(access && (access.view || access.manage));
    })
    .map(row => row.id);
  const allowedBranchIds = [
    ...new Set(
      classCandidates
        .filter(row => allowedClassIds.includes(row.id))
        .map(row => row.branch_id)
    ),
  ];

  const [branchDetailsResult, classDetailsResult] = await Promise.all([
    allowedBranchIds.length > 0
      ? client
          .from("branches")
          .select("id, name, is_main")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .in("id", allowedBranchIds)
          .order("is_main", { ascending: false })
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    allowedClassIds.length > 0
      ? client
          .from("classes")
          .select("id, branch_id, name, schedule_label")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .in("id", allowedClassIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (branchDetailsResult.error) throw branchDetailsResult.error;
  if (classDetailsResult.error) throw classDetailsResult.error;

  const branches = ((branchDetailsResult.data ?? []) as BranchRow[]).map(
    branch => ({
      id: branch.id,
      name: branch.name,
      isMain: branch.is_main,
      canManage: branchAccess.get(branch.id)?.manage === true,
    })
  );
  const classes = ((classDetailsResult.data ?? []) as ClassRow[]).map(row => ({
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    scheduleLabel: row.schedule_label,
    canManage: classAccess.get(row.id)?.manage === true,
  }));

  return {
    canView:
      schoolView ||
      schoolManage ||
      [...classAccess.values()].some(access => access.view || access.manage),
    canManage: classes.some(item => item.canManage),
    branches,
    classes,
  };
}

async function assertClassAccess(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  classId: string,
  permissionCode: MemorizationPermissionCode
): Promise<void> {
  const allowed = await canAccessMemorizationClass(
    client,
    schoolId,
    branchId,
    classId,
    permissionCode
  );

  if (!allowed) throw new MemorizationPermissionError();
}

async function assertViewOrManage(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  classId: string
): Promise<void> {
  const [canView, canManage] = await Promise.all([
    canAccessMemorizationClass(
      client,
      schoolId,
      branchId,
      classId,
      "memorization.view"
    ),
    canAccessMemorizationClass(
      client,
      schoolId,
      branchId,
      classId,
      "memorization.manage"
    ),
  ]);

  if (!canView && !canManage) throw new MemorizationPermissionError();
}

async function listMemorizationClassTeachers(
  client: SupabaseClient,
  schoolId: string,
  branchId: string,
  classId: string
): Promise<MemorizationTeacher[]> {
  const { data, error } = await client.rpc(
    "list_memorization_class_teachers",
    {
      target_school_id: schoolId,
      target_branch_id: branchId,
      target_class_id: classId,
    }
  );

  if (error) throw error;

  return ((data ?? []) as TeacherRow[]).map(teacher => ({
    id: teacher.id,
    profileId: teacher.profile_id,
    fullName: `${teacher.first_name} ${teacher.last_name}`.trim(),
  }));
}

export async function fetchMemorizationWorkspace(
  schoolId: string,
  branchId: string,
  classId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<MemorizationWorkspace> {
  await assertViewOrManage(client, schoolId, branchId, classId);

  const [studentsResult, teachers] = await Promise.all([
    client
      .from("students")
      .select("id, first_name, last_name")
      .eq("school_id", schoolId)
      .eq("branch_id", branchId)
      .eq("class_id", classId)
      .eq("status", "active")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    listMemorizationClassTeachers(client, schoolId, branchId, classId),
  ]);

  if (studentsResult.error) throw studentsResult.error;

  const students = ((studentsResult.data ?? []) as StudentRow[]).map(student => ({
    id: student.id,
    fullName: `${student.first_name} ${student.last_name}`.trim(),
  }));

  return { students, teachers };
}

export async function fetchStudentMemorizationRecords(
  schoolId: string,
  branchId: string,
  classId: string,
  studentId: string,
  recordDate: string | null,
  client: SupabaseClient = getSupabaseClient()
): Promise<MemorizationRecord[]> {
  await assertViewOrManage(client, schoolId, branchId, classId);

  let query = client
    .from("memorization_records")
    .select(
      "id, student_id, teacher_id, record_date, session_type, surah_number, ayah_start, ayah_end, rating, errors_count, notes, next_assignment, created_at, updated_at"
    )
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (recordDate) query = query.eq("record_date", recordDate);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as RecordRow[]).map(row => ({
    id: row.id,
    studentId: row.student_id,
    teacherId: row.teacher_id,
    recordDate: row.record_date,
    sessionType: row.session_type,
    surahNumber: row.surah_number,
    ayahStart: row.ayah_start,
    ayahEnd: row.ayah_end,
    rating: row.rating,
    errorsCount: row.errors_count,
    notes: row.notes ?? "",
    nextAssignment: row.next_assignment ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function fetchMemorizationAudit(
  schoolId: string,
  branchId: string,
  classId: string,
  recordId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<MemorizationAuditEntry[]> {
  await assertViewOrManage(client, schoolId, branchId, classId);

  const { data, error } = await client
    .from("memorization_record_history")
    .select("id, operation, old_values, new_values, changed_by, changed_at")
    .eq("school_id", schoolId)
    .eq("branch_id", branchId)
    .eq("class_id", classId)
    .eq("memorization_record_id", recordId)
    .order("changed_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as AuditRow[]).map(row => ({
    id: row.id,
    operation: row.operation,
    oldValues: row.old_values,
    newValues: row.new_values,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}

export function getTodayInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSurahByNumber(number: number): QuranSurah {
  return QURAN_SURAHS[number - 1] ?? QURAN_SURAHS[0];
}

export function createMemorizationDraft(
  recordDate: string,
  teacherId = ""
): MemorizationDraft {
  return {
    recordId: null,
    teacherId,
    recordDate,
    sessionType: "new_memorization",
    surahNumber: 1,
    ayahStart: 1,
    ayahEnd: 1,
    rating: 3,
    errorsCount: 0,
    notes: "",
    nextAssignment: "",
  };
}

export function draftFromMemorizationRecord(
  record: MemorizationRecord
): MemorizationDraft {
  return {
    recordId: record.id,
    teacherId: record.teacherId,
    recordDate: record.recordDate,
    sessionType: record.sessionType,
    surahNumber: record.surahNumber,
    ayahStart: record.ayahStart,
    ayahEnd: record.ayahEnd,
    rating: record.rating,
    errorsCount: record.errorsCount,
    notes: record.notes,
    nextAssignment: record.nextAssignment,
  };
}

function validateDraft(input: SaveMemorizationInput): void {
  const { draft } = input;
  const surah = QURAN_SURAHS[draft.surahNumber - 1];

  if (
    !input.schoolId ||
    !input.branchId ||
    !input.classId ||
    !input.studentId ||
    !draft.teacherId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.recordDate) ||
    !MEMORIZATION_SESSION_TYPES.includes(draft.sessionType) ||
    !surah ||
    !Number.isInteger(draft.ayahStart) ||
    !Number.isInteger(draft.ayahEnd) ||
    draft.ayahStart < 1 ||
    draft.ayahEnd < draft.ayahStart ||
    draft.ayahEnd > surah.ayahCount ||
    !Number.isInteger(draft.rating) ||
    draft.rating < 1 ||
    draft.rating > 5 ||
    !Number.isInteger(draft.errorsCount) ||
    draft.errorsCount < 0 ||
    draft.errorsCount > 100 ||
    draft.notes.trim().length > 1000 ||
    draft.nextAssignment.trim().length > 1000
  ) {
    throw new MemorizationValidationError();
  }
}

async function verifyStudent(
  client: SupabaseClient,
  input: SaveMemorizationInput
): Promise<void> {
  const { data, error } = await client
    .from("students")
    .select("id")
    .eq("id", input.studentId)
    .eq("school_id", input.schoolId)
    .eq("branch_id", input.branchId)
    .eq("class_id", input.classId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new MemorizationPermissionError();
}

async function verifyTeacherAssignment(
  client: SupabaseClient,
  input: SaveMemorizationInput
): Promise<void> {
  const teachers = await listMemorizationClassTeachers(
    client,
    input.schoolId,
    input.branchId,
    input.classId
  );

  if (!teachers.some(teacher => teacher.id === input.draft.teacherId)) {
    throw new MemorizationValidationError("teacher_not_assigned");
  }
}

function normalizedWritePayload(draft: MemorizationDraft) {
  return {
    record_date: draft.recordDate,
    session_type: draft.sessionType,
    surah_number: draft.surahNumber,
    ayah_start: draft.ayahStart,
    ayah_end: draft.ayahEnd,
    rating: draft.rating,
    errors_count: draft.errorsCount,
    notes: draft.notes.trim() || null,
    next_assignment: draft.nextAssignment.trim() || null,
  };
}

export async function saveMemorizationRecord(
  input: SaveMemorizationInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<SaveMemorizationResult> {
  await assertClassAccess(
    client,
    input.schoolId,
    input.branchId,
    input.classId,
    "memorization.manage"
  );
  validateDraft(input);
  await Promise.all([
    verifyStudent(client, input),
    verifyTeacherAssignment(client, input),
  ]);

  if (input.draft.recordId) {
    const { data, error } = await client
      .from("memorization_records")
      .update(normalizedWritePayload(input.draft))
      .eq("id", input.draft.recordId)
      .eq("school_id", input.schoolId)
      .eq("branch_id", input.branchId)
      .eq("class_id", input.classId)
      .eq("student_id", input.studentId)
      .select("id")
      .single();

    if (error) throw error;
    return { recordId: data.id as string, mode: "updated" };
  }

  const { data, error } = await client
    .from("memorization_records")
    .insert({
      class_id: input.classId,
      student_id: input.studentId,
      teacher_id: input.draft.teacherId,
      ...normalizedWritePayload(input.draft),
    })
    .select("id")
    .single();

  if (error) throw error;
  return { recordId: data.id as string, mode: "created" };
}

export function getMemorizationSessionLabel(
  sessionType: MemorizationSessionType
): string {
  return {
    new_memorization: "حفظ جديد",
    near_revision: "مراجعة قريبة",
    distant_revision: "مراجعة بعيدة",
    assessment: "اختبار",
  }[sessionType];
}

export function getMemorizationErrorMessage(error: unknown): string {
  if (error instanceof MemorizationPermissionError) {
    return "لا تملك صلاحية تنفيذ هذه العملية ضمن الحلقة المحددة.";
  }

  if (error instanceof MemorizationValidationError) {
    if (error.message.includes("teacher")) {
      return "يجب اختيار معلم نشط ومُعيّن للحلقة.";
    }
    return "تحقق من السورة ونطاق الآيات والتقييم وبقية بيانات السجل.";
  }

  const safeError = error as Partial<PostgrestError> | null;
  const code = safeError?.code;
  const message = safeError?.message?.toLowerCase() ?? "";

  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("memorization_teacher_identity_mismatch") ||
    message.includes("memorization_teacher_update_forbidden")
  ) {
    return "رفضت قاعدة البيانات العملية لأنها خارج نطاق صلاحيتك.";
  }

  if (
    code === "23503" ||
    code === "23514" ||
    message.includes("memorization_student_not_in_active_class") ||
    message.includes("memorization_teacher_not_assigned_to_class")
  ) {
    return "تعذر حفظ السجل لأن الطالب أو المعلم أو الحلقة لم تعد نشطة ضمن النطاق.";
  }

  return "تعذر إتمام عملية متابعة الحفظ حاليًا. حاول مرة أخرى.";
}
