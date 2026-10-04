import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Check, ImagePlus, RefreshCw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  createStudentPhotoUrlMap,
  clearStudentPhotoRecord,
  fetchBranches,
  fetchClasses,
  fetchStudentEditRecord,
  fetchStudentManageableBranchIds,
  getEducationYearOptions,
  getStudentSaveErrorMessage,
  hasStudentManagePermission,
  removeStudentPhotoObject,
  translateEducationLevel,
  translateStudentStatus,
  updateStudentRecord,
  uploadStudentPhoto,
  validateStudentPhoto,
  type BranchOption,
  type ClassOption,
  type EducationLevel,
  type GuardianRelation,
  type StudentEditRecord,
  type StudentFormValues,
  type StudentGender,
  type StudentStatus,
} from "@/lib/students";

const blankForm: StudentFormValues = {
  branchId: "", classId: "", firstName: "", lastName: "", birthDate: "", gender: "",
  nationalId: "", phone: "", email: "", address: "", previousSchool: "",
  educationLevel: "", educationYear: "", guardianName: "", guardianRelation: "",
  guardianPhone: "", guardianEmail: "", guardianJob: "", startDate: "",
  birthCertificateProvided: false, photosProvided: false, medicalReportProvided: false,
  previousCertificateProvided: false,
};

const statuses: StudentStatus[] = ["active", "suspended", "transferred", "graduated", "withdrawn"];
const genders: StudentGender[] = ["male", "female"];
const educationLevels: EducationLevel[] = ["primary", "middle", "secondary", "university"];
const guardianRelations: GuardianRelation[] = ["father", "mother", "brother", "sister", "uncle", "aunt", "grandfather", "grandmother", "other"];

const copy = {
  ar: {
    title: "تعديل ملف الطالب", back: "العودة إلى الطلاب", save: "حفظ التعديلات", saving: "جارٍ الحفظ...",
    loading: "جارٍ تحميل ملف الطالب...", retry: "إعادة المحاولة", loadError: "تعذر تحميل ملف الطالب.",
    notFound: "لم يتم العثور على الطالب أو لا تملك صلاحية إدارة فرعه.", required: "يرجى إكمال الحقول المطلوبة.",
    firstName: "الاسم الأول", lastName: "اسم العائلة", birthDate: "تاريخ الميلاد", gender: "الجنس",
    male: "ذكر", female: "أنثى", nationalId: "رقم الهوية", studentPhoto: "صورة الطالب",
    choosePhoto: "اختيار صورة جديدة", removePhoto: "إزالة الصورة الحالية", undoPhotoRemoval: "التراجع عن إزالة الصورة", photoHelp: "صورة خاصة: JPG أو PNG أو WebP، بحد أقصى 5 ميغابايت.",
    invalidPhoto: "تحقق من نوع الصورة وحجمها (5 ميغابايت كحد أقصى).", phone: "رقم الهاتف", email: "البريد الإلكتروني",
    address: "العنوان", previousSchool: "المؤسسة التعليمية السابقة", educationLevel: "المرحلة الدراسية",
    educationYear: "السنة الدراسية", unspecified: "غير محدد", chooseYear: "اختر السنة",
    guardianName: "اسم ولي الأمر", guardianRelation: "صلة القرابة", guardianPhone: "هاتف ولي الأمر",
    guardianEmail: "بريد ولي الأمر", guardianJob: "مهنة ولي الأمر", father: "الأب", mother: "الأم",
    brother: "الأخ", sister: "الأخت", uncle: "العم أو الخال", aunt: "العمة أو الخالة",
    grandfather: "الجد", grandmother: "الجدة", other: "أخرى", branch: "الفرع", className: "الحلقة",
    noClass: "بدون حلقة", startDate: "تاريخ التسجيل", status: "حالة الطالب", active: "نشط", suspended: "موقوف",
    transferred: "منقول", graduated: "متخرج", withdrawn: "منسحب", documents: "الوثائق المستلمة",
    birthCertificate: "شهادة الميلاد", photosProvided: "صور ورقية إضافية", medicalReport: "تقرير طبي",
    previousCertificate: "شهادة مدرسية سابقة", personal: "البيانات الأساسية", education: "الاتصال والتعليم",
    guardian: "بيانات ولي الأمر المسجلة مع الطالب", guardianNote: "تُحدّث هذه النسخة في ملف الطالب فقط؛ أما بيانات علاقة الولي أو حسابه فتُحرر من دليل الأولياء.", enrollment: "التسجيل والحلقة", noBranches: "لا توجد فروع متاحة للإدارة.",
    branchMoveHint: "يُسمح بالنقل فقط إلى فرع تملك فيه صلاحية إدارة الطلاب.",
    terminalWarning: "هذا التغيير ينهي متابعة الطالب ويُلغي تلقائيًا روابط وصول أولياء الأمور. هل تريد المتابعة؟",
    saved: "تم حفظ تعديلات الطالب.", savedPhotoFailed: "حُفظت بيانات الطالب لكن تعذر تحديث الصورة.",
    photoCleanupFailed: "تم تحديث الصورة، لكن تعذر تنظيف النسخة القديمة.", cancel: "إلغاء", invalidEmail: "تحقق من صيغة البريد الإلكتروني.",
  },
  en: {
    title: "Edit student profile", back: "Back to students", save: "Save changes", saving: "Saving changes...",
    loading: "Loading student profile...", retry: "Try again", loadError: "Student profile could not be loaded.",
    notFound: "Student not found, or you do not manage the student's branch.", required: "Complete all required fields.",
    firstName: "First name", lastName: "Last name", birthDate: "Date of birth", gender: "Gender",
    male: "Male", female: "Female", nationalId: "National ID", studentPhoto: "Student photo",
    choosePhoto: "Choose a new photo", removePhoto: "Remove current photo", undoPhotoRemoval: "Undo photo removal", photoHelp: "Private image: JPG, PNG or WebP, up to 5 MB.",
    invalidPhoto: "Check the image type and size (maximum 5 MB).", phone: "Phone", email: "Email",
    address: "Address", previousSchool: "Previous school", educationLevel: "Education level",
    educationYear: "Education year", unspecified: "Not specified", chooseYear: "Choose a year",
    guardianName: "Guardian name", guardianRelation: "Relationship", guardianPhone: "Guardian phone",
    guardianEmail: "Guardian email", guardianJob: "Guardian occupation", father: "Father", mother: "Mother",
    brother: "Brother", sister: "Sister", uncle: "Uncle", aunt: "Aunt", grandfather: "Grandfather",
    grandmother: "Grandmother", other: "Other", branch: "Branch", className: "Class", noClass: "No class",
    startDate: "Registration date", status: "Student status", active: "Active", suspended: "Suspended",
    transferred: "Transferred", graduated: "Graduated", withdrawn: "Withdrawn", documents: "Documents received",
    birthCertificate: "Birth certificate", photosProvided: "Additional paper photos", medicalReport: "Medical report",
    previousCertificate: "Previous school certificate", personal: "Personal details", education: "Contact and education",
    guardian: "Guardian details recorded with the student", guardianNote: "These registration details update only the student record. Edit linked guardian relationship or account data in the guardians directory.", enrollment: "Enrollment and class", noBranches: "No manageable branches are available.",
    branchMoveHint: "A transfer is allowed only to a branch where you can manage students.",
    terminalWarning: "This change ends student follow-up and automatically revokes guardian access links. Continue?",
    saved: "Student changes saved.", savedPhotoFailed: "Student data was saved, but the photo could not be updated.",
    photoCleanupFailed: "The photo was updated, but the old file could not be removed.", cancel: "Cancel", invalidEmail: "Check the email format.",
  },
} as const;

type LoadState = "loading" | "ready" | "missing" | "error";

function fromRecord(record: StudentEditRecord): StudentFormValues {
  return {
    ...blankForm,
    branchId: record.branch_id,
    classId: record.class_id ?? "",
    firstName: record.first_name,
    lastName: record.last_name,
    birthDate: record.birth_date,
    gender: record.gender,
    nationalId: record.national_id ?? "",
    phone: record.phone ?? "",
    email: record.email ?? "",
    address: record.address ?? "",
    previousSchool: record.previous_school ?? "",
    educationLevel: record.education_level ?? "",
    educationYear: record.education_year ? String(record.education_year) : "",
    guardianName: record.guardian_name,
    guardianRelation: record.guardian_relation,
    guardianPhone: record.guardian_phone,
    guardianEmail: record.guardian_email ?? "",
    guardianJob: record.guardian_job ?? "",
    startDate: record.start_date,
    birthCertificateProvided: record.birth_certificate_provided,
    photosProvided: record.photos_provided,
    medicalReportProvided: record.medical_report_provided,
    previousCertificateProvided: record.previous_certificate_provided,
  };
}

export default function EditStudentForm() {
  const [, params] = useRoute("/students/:studentId/edit");
  const [, setLocation] = useLocation();
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const t = copy[locale];
  const studentId = params?.studentId ?? "";
  const [record, setRecord] = useState<StudentEditRecord | null>(null);
  const [form, setForm] = useState<StudentFormValues>(blankForm);
  const [status, setStatus] = useState<StudentStatus>("active");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [manageableBranches, setManageableBranches] = useState<Set<string>>(new Set());
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const photoPreview = useMemo(() => photoFile ? URL.createObjectURL(photoFile) : null, [photoFile]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const load = useCallback(async () => {
    if (!school?.id || !studentId) { setLoadState("missing"); return; }
    setLoadState("loading");
    try {
      const student = await fetchStudentEditRecord(school.id, studentId);
      if (!student) { setLoadState("missing"); return; }
      if (!(await hasStudentManagePermission(school.id, student.branch_id))) {
        setRecord(student);
        setLoadState("missing");
        return;
      }
      const [branchRows, classRows] = await Promise.all([
        fetchBranches(school.id, { activeOnly: false }),
        fetchClasses(school.id, undefined, { activeOnly: false }),
      ]);
      const manageable = await fetchStudentManageableBranchIds(school.id, branchRows.map(branch => branch.id));
      setRecord(student);
      setForm(fromRecord(student));
      setStatus(student.status);
      setBranches(branchRows);
      setClasses(classRows);
      setManageableBranches(manageable);
      const photoMap = await createStudentPhotoUrlMap([student]);
      setPhotoUrl(photoMap.get(student.id) ?? null);
      setPhotoFile(null);
      setRemoveExistingPhoto(false);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [school?.id, studentId]);

  useEffect(() => { void load(); }, [load]);

  const updateField = <K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.firstName.trim().length < 2) next.firstName = t.required;
    if (form.lastName.trim().length < 2) next.lastName = t.required;
    if (!form.birthDate) next.birthDate = t.required;
    if (!form.gender) next.gender = t.required;
    if (!form.branchId) next.branchId = t.required;
    if (!form.startDate) next.startDate = t.required;
    if (!form.guardianName.trim()) next.guardianName = t.required;
    if (!form.guardianPhone.trim()) next.guardianPhone = t.required;
    if (!form.guardianRelation) next.guardianRelation = t.required;
    for (const key of ["email", "guardianEmail"] as const) {
      const value = form[key].trim();
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) next[key] = t.invalidEmail;
    }
    if (form.educationYear && !form.educationLevel) next.educationYear = t.required;
    if (form.educationLevel && form.educationYear && !getEducationYearOptions(form.educationLevel).includes(Number(form.educationYear))) next.educationYear = t.required;
    if (photoFile && validateStudentPhoto(photoFile)) next.photo = t.invalidPhoto;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!school?.id || !studentId || !record || !validate()) return;
    if (!manageableBranches.has(form.branchId)) {
      toast.error(t.branchMoveHint);
      return;
    }
    if (["transferred", "graduated", "withdrawn"].includes(status) && status !== record.status) {
      if (!window.confirm(t.terminalWarning)) return;
    }

    setSubmitting(true);
    try {
      await updateStudentRecord(school.id, studentId, form, status);
      if (photoFile) {
        try {
          const newPath = await uploadStudentPhoto(school.id, studentId, photoFile);
          if (record.photo_path && record.photo_path !== newPath) {
            try { await removeStudentPhotoObject(school.id, studentId, record.photo_path); }
            catch { toast.error(t.photoCleanupFailed); }
          }
        } catch {
          toast.error(t.savedPhotoFailed);
          toast.success(t.saved);
          setLocation(`/students/${studentId}`);
          return;
        }
      } else if (removeExistingPhoto && record.photo_path) {
        await clearStudentPhotoRecord(school.id, studentId);
        try { await removeStudentPhotoObject(school.id, studentId, record.photo_path); }
        catch { toast.error(t.photoCleanupFailed); }
      }
      toast.success(t.saved);
      setLocation(`/students/${studentId}`);
    } catch (error) {
      toast.error(getStudentSaveErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const backButton = (
    <Button type="button" variant="outline" onClick={() => setLocation(`/students/${studentId}`)}>
      {direction === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t.back}
    </Button>
  );

  if (loadState !== "ready" || !record) {
    return (
      <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6" dir={direction}>
        <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold text-[#173B2D]">{t.title}</h1>{backButton}</div>
        {loadState === "loading" ? <Card className="p-8 text-center text-muted-foreground"><RefreshCw className="mx-auto mb-3 animate-spin" />{t.loading}</Card>
          : loadState === "error" ? <Card className="p-8 text-center"><p className="mb-4 text-red-700">{t.loadError}</p><Button onClick={() => void load()} variant="outline"><RefreshCw size={16} />{t.retry}</Button></Card>
            : <Card className="p-8 text-center text-muted-foreground">{t.notFound}</Card>}
      </main>
    );
  }

  const availableBranches = branches.filter(branch => manageableBranches.has(branch.id) || branch.id === record.branch_id);
  const availableClasses = classes.filter(item => item.branch_id === form.branchId);
  const yearOptions = getEducationYearOptions(form.educationLevel);
  const inputClass = "h-11";
  const labelClass = "mb-1.5 block text-sm font-medium text-[#244E3B]";
  const sectionClass = "space-y-4 rounded-2xl border border-[#E5EDE7] bg-white p-4 sm:p-5";
  const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  const error = (key: string) => errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6" dir={direction}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-[#718377]">{record.first_name} {record.last_name}</p><h1 className="text-2xl font-bold text-[#173B2D]">{t.title}</h1></div>{backButton}</div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <section className={sectionClass}>
          <h2 className="font-bold text-[#173B2D]">{t.personal}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className={labelClass} htmlFor="edit-first-name">{t.firstName} *</label><Input id="edit-first-name" className={inputClass} maxLength={100} value={form.firstName} onChange={e => updateField("firstName", e.target.value)} />{error("firstName")}</div>
            <div><label className={labelClass} htmlFor="edit-last-name">{t.lastName} *</label><Input id="edit-last-name" className={inputClass} maxLength={100} value={form.lastName} onChange={e => updateField("lastName", e.target.value)} />{error("lastName")}</div>
            <div><label className={labelClass} htmlFor="edit-birth-date">{t.birthDate} *</label><Input id="edit-birth-date" type="date" dir="ltr" className={inputClass} value={form.birthDate} onChange={e => updateField("birthDate", e.target.value)} />{error("birthDate")}</div>
            <div><label className={labelClass} htmlFor="edit-gender">{t.gender} *</label><select id="edit-gender" className={selectClass} value={form.gender} onChange={e => updateField("gender", e.target.value as StudentGender | "")}><option value="">{t.unspecified}</option>{genders.map(value => <option key={value} value={value}>{value === "male" ? t.male : t.female}</option>)}</select>{error("gender")}</div>
            <div><label className={labelClass} htmlFor="edit-national-id">{t.nationalId}</label><Input id="edit-national-id" className={inputClass} maxLength={80} value={form.nationalId} onChange={e => updateField("nationalId", e.target.value)} /></div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className={labelClass} htmlFor="edit-photo">{t.studentPhoto}</label>
              <div className="flex items-center gap-3">
                {photoPreview || (photoUrl && !removeExistingPhoto) ? <img src={photoPreview ?? photoUrl ?? ""} alt={t.studentPhoto} className="size-14 rounded-xl object-cover" /> : <div className="grid size-14 place-items-center rounded-xl bg-[#F1F7F2] text-[#718377]"><ImagePlus size={20} /></div>}
                <label htmlFor="edit-photo" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium"><ImagePlus size={16} />{t.choosePhoto}</label>
                {record.photo_path && !photoFile && (removeExistingPhoto
                  ? <Button type="button" size="sm" variant="outline" onClick={() => setRemoveExistingPhoto(false)}><Undo2 size={14} />{t.undoPhotoRemoval}</Button>
                  : <Button type="button" size="sm" variant="outline" onClick={() => setRemoveExistingPhoto(true)}><X size={14} />{t.removePhoto}</Button>)}
                <input id="edit-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const file = event.target.files?.[0] ?? null; setPhotoFile(file); if (file) setRemoveExistingPhoto(false); setErrors(current => ({ ...current, photo: "" })); }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.photoHelp}</p>{error("photo")}
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="font-bold text-[#173B2D]">{t.education}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className={labelClass} htmlFor="edit-phone">{t.phone}</label><Input id="edit-phone" type="tel" dir="ltr" className={inputClass} value={form.phone} onChange={e => updateField("phone", e.target.value)} /></div>
            <div><label className={labelClass} htmlFor="edit-email">{t.email}</label><Input id="edit-email" type="email" dir="ltr" className={inputClass} value={form.email} onChange={e => updateField("email", e.target.value)} />{error("email")}</div>
            <div><label className={labelClass} htmlFor="edit-address">{t.address}</label><Input id="edit-address" className={inputClass} value={form.address} onChange={e => updateField("address", e.target.value)} /></div>
            <div><label className={labelClass} htmlFor="edit-previous-school">{t.previousSchool}</label><Input id="edit-previous-school" className={inputClass} value={form.previousSchool} onChange={e => updateField("previousSchool", e.target.value)} /></div>
            <div><label className={labelClass} htmlFor="edit-education-level">{t.educationLevel}</label><select id="edit-education-level" className={selectClass} value={form.educationLevel} onChange={e => { updateField("educationLevel", e.target.value as EducationLevel | ""); updateField("educationYear", ""); }}><option value="">{t.unspecified}</option>{educationLevels.map(level => <option key={level} value={level}>{translateEducationLevel(level, locale)}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="edit-education-year">{t.educationYear}</label><select id="edit-education-year" className={selectClass} value={form.educationYear ?? ""} disabled={!form.educationLevel} onChange={e => updateField("educationYear", e.target.value)}><option value="">{form.educationLevel ? t.unspecified : t.chooseYear}</option>{yearOptions.map(year => <option key={year} value={year}>{year}</option>)}</select>{error("educationYear")}</div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="font-bold text-[#173B2D]">{t.guardian}</h2>
          <p className="text-xs text-muted-foreground">{t.guardianNote}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className={labelClass} htmlFor="edit-guardian-name">{t.guardianName} *</label><Input id="edit-guardian-name" className={inputClass} maxLength={150} value={form.guardianName} onChange={e => updateField("guardianName", e.target.value)} />{error("guardianName")}</div>
            <div><label className={labelClass} htmlFor="edit-guardian-relation">{t.guardianRelation} *</label><select id="edit-guardian-relation" className={selectClass} value={form.guardianRelation} onChange={e => updateField("guardianRelation", e.target.value as GuardianRelation | "")}><option value="">{t.unspecified}</option>{guardianRelations.map(relation => <option key={relation} value={relation}>{t[relation]}</option>)}</select>{error("guardianRelation")}</div>
            <div><label className={labelClass} htmlFor="edit-guardian-phone">{t.guardianPhone} *</label><Input id="edit-guardian-phone" type="tel" dir="ltr" className={inputClass} value={form.guardianPhone} onChange={e => updateField("guardianPhone", e.target.value)} />{error("guardianPhone")}</div>
            <div><label className={labelClass} htmlFor="edit-guardian-email">{t.guardianEmail}</label><Input id="edit-guardian-email" type="email" dir="ltr" className={inputClass} value={form.guardianEmail} onChange={e => updateField("guardianEmail", e.target.value)} />{error("guardianEmail")}</div>
            <div><label className={labelClass} htmlFor="edit-guardian-job">{t.guardianJob}</label><Input id="edit-guardian-job" className={inputClass} value={form.guardianJob} onChange={e => updateField("guardianJob", e.target.value)} /></div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="font-bold text-[#173B2D]">{t.enrollment}</h2>
          <p className="text-xs text-muted-foreground">{t.branchMoveHint}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><label className={labelClass} htmlFor="edit-branch">{t.branch} *</label><select id="edit-branch" className={selectClass} value={form.branchId} onChange={e => { const branchId = e.target.value; setForm(current => ({ ...current, branchId, classId: branchId === current.branchId ? current.classId : "" })); }}><option value="">{t.unspecified}</option>{availableBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{error("branchId")}{branches.length === 0 && <p className="mt-1 text-xs text-amber-700">{t.noBranches}</p>}</div>
            <div><label className={labelClass} htmlFor="edit-class">{t.className}</label><select id="edit-class" className={selectClass} value={form.classId} onChange={e => updateField("classId", e.target.value)}><option value="">{t.noClass}</option>{availableClasses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="edit-start-date">{t.startDate} *</label><Input id="edit-start-date" type="date" dir="ltr" className={inputClass} value={form.startDate} onChange={e => updateField("startDate", e.target.value)} />{error("startDate")}</div>
            <div><label className={labelClass} htmlFor="edit-student-status">{t.status}</label><select id="edit-student-status" className={selectClass} value={status} onChange={e => setStatus(e.target.value as StudentStatus)}>{statuses.map(value => <option key={value} value={value}>{translateStudentStatus(value, locale)}</option>)}</select></div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="font-bold text-[#173B2D]">{t.documents}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([
            ["birthCertificateProvided", t.birthCertificate], ["photosProvided", t.photosProvided],
            ["medicalReportProvided", t.medicalReport], ["previousCertificateProvided", t.previousCertificate],
          ] as const).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"><input type="checkbox" checked={form[key]} onChange={e => updateField(key, e.target.checked)} className="size-4 accent-[#17663B]" />{label}</label>)}</div>
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setLocation(`/students/${studentId}`)} disabled={submitting}>{t.cancel}</Button>
          <Button type="submit" disabled={submitting} className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]">{submitting ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}{submitting ? t.saving : t.save}</Button>
        </div>
      </form>
    </main>
  );
}
