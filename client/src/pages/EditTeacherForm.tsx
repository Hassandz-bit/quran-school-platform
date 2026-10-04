import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  fetchTeacherBranches,
  fetchTeacherEditRecord,
  fetchTeacherManageableBranchIds,
  hasTeacherManagePermission,
  translateTeacherGender,
  translateTeacherStatus,
  updateTeacher,
  type TeacherBranch,
  type TeacherEditRecord,
  type TeacherFormValues,
  type TeacherGender,
  type TeacherStatus,
} from "@/lib/teachers";

const statuses: TeacherStatus[] = ["active", "inactive", "on_leave", "archived"];
const genders: TeacherGender[] = ["male", "female"];
const blankTeacher: TeacherFormValues = {
  branchId: "", firstName: "", lastName: "", gender: "", phone: "", email: "",
  specialization: "", qualification: "", hireDate: "", status: "active", notes: "",
};

const copy = {
  ar: {
    title: "تعديل بيانات المعلم", back: "العودة إلى بيانات المعلم", save: "حفظ التعديلات", saving: "جارٍ الحفظ...",
    loading: "جارٍ تحميل بيانات المعلم...", retry: "إعادة المحاولة", loadError: "تعذر تحميل بيانات المعلم.",
    notFound: "لم يتم العثور على المعلم أو لا تملك صلاحية إدارة فرعه.", firstName: "الاسم الأول", lastName: "اسم العائلة",
    gender: "الجنس", male: "ذكر", female: "أنثى", phone: "رقم الهاتف", email: "البريد الإلكتروني",
    specialization: "التخصص", qualification: "المؤهل العلمي", hireDate: "تاريخ التوظيف", status: "الحالة الوظيفية",
    notes: "ملاحظات", branch: "الفرع", cancel: "إلغاء", required: "يرجى إكمال الحقول المطلوبة.",
    branchLocked: "لا يمكن نقل المعلم ما دامت له إسنادات حالية أو تاريخية؛ حافظ ذلك على سلامة روابط الحلقات.",
    branchMoveHint: "يمكن تغيير الفرع فقط عند عدم وجود أي إسناد للحلقات، ومع صلاحية الإدارة في الفرع الهدف.",
    assignmentWarning: "سيبقى إسناد المعلم إلى الحلقات كما هو؛ تغيير الحالة لا يغيّر الإسنادات تلقائيًا. هل تريد المتابعة؟",
    saved: "تم حفظ تعديلات المعلم.", permissionError: "لا تملك صلاحية إدارة هذا الفرع.",
  },
  en: {
    title: "Edit teacher details", back: "Back to teacher details", save: "Save changes", saving: "Saving changes...",
    loading: "Loading teacher details...", retry: "Try again", loadError: "Teacher details could not be loaded.",
    notFound: "Teacher not found, or you do not manage the teacher's branch.", firstName: "First name", lastName: "Last name",
    gender: "Gender", male: "Male", female: "Female", phone: "Phone number", email: "Email address",
    specialization: "Specialization", qualification: "Qualification", hireDate: "Hire date", status: "Employment status",
    notes: "Notes", branch: "Branch", cancel: "Cancel", required: "Complete all required fields.",
    branchLocked: "The teacher cannot be moved while current or historical class assignments exist; this preserves class links.",
    branchMoveHint: "The branch can change only when no class assignments exist and you manage the target branch.",
    assignmentWarning: "Class assignments will remain unchanged; changing teacher status does not update them automatically. Continue?",
    saved: "Teacher changes saved.", permissionError: "You do not have permission to manage this branch.",
  },
} as const;

type State = "loading" | "ready" | "missing" | "error";

function formFromRecord(record: TeacherEditRecord): TeacherFormValues {
  const teacher = record.teacher;
  return {
    branchId: teacher.branch_id,
    firstName: teacher.first_name,
    lastName: teacher.last_name,
    gender: teacher.gender,
    phone: teacher.phone ?? "",
    email: teacher.email ?? "",
    specialization: teacher.specialization ?? "",
    qualification: teacher.qualification ?? "",
    hireDate: teacher.hire_date,
    status: teacher.status,
    notes: teacher.notes ?? "",
  };
}

export default function EditTeacherForm() {
  const [, params] = useRoute("/teachers/:teacherId/edit");
  const [, setLocation] = useLocation();
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const t = copy[locale];
  const teacherId = params?.teacherId ?? "";
  const [record, setRecord] = useState<TeacherEditRecord | null>(null);
  const [form, setForm] = useState<TeacherFormValues>(blankTeacher);
  const [branches, setBranches] = useState<TeacherBranch[]>([]);
  const [manageableBranches, setManageableBranches] = useState<Set<string>>(new Set());
  const [state, setState] = useState<State>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!school?.id || !teacherId) { setState("missing"); return; }
    setState("loading");
    try {
      const nextRecord = await fetchTeacherEditRecord(school.id, teacherId);
      if (!nextRecord) { setState("missing"); return; }
      if (!(await hasTeacherManagePermission(school.id, nextRecord.teacher.branch_id))) {
        setState("missing");
        return;
      }
      const branchRows = await fetchTeacherBranches(school.id, { activeOnly: false });
      const manageable = await fetchTeacherManageableBranchIds(school.id, branchRows.map(branch => branch.id));
      setRecord(nextRecord);
      setForm(formFromRecord(nextRecord));
      setBranches(branchRows);
      setManageableBranches(manageable);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [school?.id, teacherId]);

  useEffect(() => { void load(); }, [load]);

  const updateField = <K extends keyof TeacherFormValues>(key: K, value: TeacherFormValues[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!school?.id || !record) return;
    const nextErrors: Record<string, string> = {};
    if (form.firstName.trim().length < 2) nextErrors.firstName = t.required;
    if (form.lastName.trim().length < 2) nextErrors.lastName = t.required;
    if (!form.gender) nextErrors.gender = t.required;
    if (!form.hireDate) nextErrors.hireDate = t.required;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const branchChanged = form.branchId !== record.teacher.branch_id;
    if (branchChanged && (!record.assignmentHistoryKnown || record.assignmentCount > 0)) {
      toast.error(t.branchLocked);
      return;
    }
    if (!manageableBranches.has(form.branchId)) {
      toast.error(t.permissionError);
      return;
    }
    if (form.status !== record.teacher.status && form.status !== "active" && record.assignmentCount > 0) {
      if (!window.confirm(t.assignmentWarning)) return;
    }

    setSubmitting(true);
    try {
      await updateTeacher(school.id, teacherId, form);
      toast.success(t.saved);
      setLocation(`/teachers/${teacherId}`);
    } catch {
      toast.error(t.permissionError);
    } finally {
      setSubmitting(false);
    }
  };

  const back = (
    <Button type="button" variant="outline" onClick={() => setLocation(`/teachers/${teacherId}`)}>
      {direction === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t.back}
    </Button>
  );

  if (state !== "ready" || !record) {
    return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6" dir={direction}>
      <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold text-[#173B2D]">{t.title}</h1>{back}</div>
      {state === "loading" ? <Card className="p-8 text-center text-muted-foreground"><RefreshCw className="mx-auto mb-3 animate-spin" />{t.loading}</Card>
        : state === "error" ? <Card className="p-8 text-center"><p className="mb-4 text-red-700">{t.loadError}</p><Button variant="outline" onClick={() => void load()}><RefreshCw size={16} />{t.retry}</Button></Card>
          : <Card className="p-8 text-center text-muted-foreground">{t.notFound}</Card>}
    </main>;
  }

  const branchCanChange = record.assignmentHistoryKnown && record.assignmentCount === 0;
  const availableBranches = branches.filter(branch => manageableBranches.has(branch.id) || branch.id === record.teacher.branch_id);
  const labelClass = "mb-1.5 block text-sm font-medium text-[#244E3B]";
  const inputClass = "h-11";
  const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  const error = (key: string) => errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null;

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6" dir={direction}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-[#718377]">{record.teacher.first_name} {record.teacher.last_name}</p><h1 className="text-2xl font-bold text-[#173B2D]">{t.title}</h1></div>{back}</div>
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className={labelClass} htmlFor="teacher-edit-first-name">{t.firstName} *</label><Input id="teacher-edit-first-name" className={inputClass} maxLength={100} value={form.firstName} onChange={e => updateField("firstName", e.target.value)} />{error("firstName")}</div>
          <div><label className={labelClass} htmlFor="teacher-edit-last-name">{t.lastName} *</label><Input id="teacher-edit-last-name" className={inputClass} maxLength={100} value={form.lastName} onChange={e => updateField("lastName", e.target.value)} />{error("lastName")}</div>
          <div><label className={labelClass} htmlFor="teacher-edit-gender">{t.gender} *</label><select id="teacher-edit-gender" className={selectClass} value={form.gender} onChange={e => updateField("gender", e.target.value as TeacherGender | "")}><option value="">—</option>{genders.map(value => <option key={value} value={value}>{translateTeacherGender(value, locale)}</option>)}</select>{error("gender")}</div>
          <div><label className={labelClass} htmlFor="teacher-edit-phone">{t.phone}</label><Input id="teacher-edit-phone" className={inputClass} dir="ltr" type="tel" value={form.phone} onChange={e => updateField("phone", e.target.value)} /></div>
          <div><label className={labelClass} htmlFor="teacher-edit-email">{t.email}</label><Input id="teacher-edit-email" className={inputClass} dir="ltr" type="email" value={form.email} onChange={e => updateField("email", e.target.value)} /></div>
          <div><label className={labelClass} htmlFor="teacher-edit-specialization">{t.specialization}</label><Input id="teacher-edit-specialization" className={inputClass} value={form.specialization} onChange={e => updateField("specialization", e.target.value)} /></div>
          <div><label className={labelClass} htmlFor="teacher-edit-qualification">{t.qualification}</label><Input id="teacher-edit-qualification" className={inputClass} value={form.qualification} onChange={e => updateField("qualification", e.target.value)} /></div>
          <div><label className={labelClass} htmlFor="teacher-edit-hire-date">{t.hireDate} *</label><Input id="teacher-edit-hire-date" className={inputClass} dir="ltr" type="date" value={form.hireDate} onChange={e => updateField("hireDate", e.target.value)} />{error("hireDate")}</div>
          <div><label className={labelClass} htmlFor="teacher-edit-status">{t.status}</label><select id="teacher-edit-status" className={selectClass} value={form.status} onChange={e => updateField("status", e.target.value as TeacherStatus)}>{statuses.map(value => <option key={value} value={value}>{translateTeacherStatus(value, locale)}</option>)}</select></div>
          <div><label className={labelClass} htmlFor="teacher-edit-branch">{t.branch}</label><select id="teacher-edit-branch" className={selectClass} value={form.branchId} disabled={!branchCanChange} onChange={e => updateField("branchId", e.target.value)}>{availableBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">{branchCanChange ? t.branchMoveHint : t.branchLocked}</p></div>
        </div>
        <div><label className={labelClass} htmlFor="teacher-edit-notes">{t.notes}</label><textarea id="teacher-edit-notes" rows={4} maxLength={4000} className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/10" value={form.notes} onChange={e => updateField("notes", e.target.value)} /></div>
        {form.status !== "active" && record.assignmentCount > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t.assignmentWarning}</p>}
      </Card>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={submitting} onClick={() => setLocation(`/teachers/${teacherId}`)}>{t.cancel}</Button><Button type="submit" disabled={submitting} className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]">{submitting ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{submitting ? t.saving : t.save}</Button></div>
    </form>
  </main>;
}
