import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BrainCircuit,
  Download,
  GraduationCap,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  WandSparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { EmptyState, PageHeader, SectionHeader, StatCard } from "@/components/ui/app-primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { getSupabaseClient } from "@/lib/supabase";
import {
  SCHOOL_ASSESSMENT_TYPES,
  buildSchoolTrackCsv,
  canManageSchoolTrackStudent,
  canViewSchoolTrackStudent,
  createSchoolTrackResult,
  evaluateSchoolTrackScore,
  fetchSchoolTrackResults,
  fetchSchoolTrackScope,
  getCurrentAcademicYear,
  getCurrentTerm,
  getDefaultSchoolTrackFilters,
  getSchoolTrackPercentage,
  summarizeSchoolTrackResults,
  updateSchoolTrackResult,
  type SchoolAssessmentType,
  type SchoolTrackFilters,
  type SchoolTrackResult,
  type SchoolTrackResultInput,
  type SchoolTrackScope,
  type SchoolTrackStudent,
} from "@/lib/school-track";

type LoadState = "loading" | "ready" | "forbidden" | "error";
type Analysis = {
  summary: string;
  strengths: string[];
  focusAreas: string[];
  actions: string[];
  quranDataIncluded: boolean;
};
type FormState = {
  studentId: string;
  subject: string;
  assessmentTitle: string;
  assessmentType: SchoolAssessmentType;
  academicYear: string;
  term: string;
  assessmentDate: string;
  score: string;
  maxScore: string;
  notes: string;
};

const ASSESSMENT_TYPE_LABELS: Record<SchoolAssessmentType, string> = {
  quiz: "اختبار قصير",
  test: "فرض",
  exam: "امتحان",
  oral: "شفهي",
  continuous: "تقويم مستمر",
  other: "أخرى",
};
const EVALUATION_LABELS = {
  excellent: "ممتاز",
  very_good: "جيد جدًا",
  good: "جيد",
  acceptable: "مقبول",
  needs_support: "يحتاج متابعة",
} as const;

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function newForm(studentId = ""): FormState {
  return {
    studentId,
    subject: "",
    assessmentTitle: "",
    assessmentType: "exam",
    academicYear: getCurrentAcademicYear(),
    term: getCurrentTerm(),
    assessmentDate: localToday(),
    score: "",
    maxScore: "20",
    notes: "",
  };
}
function initialFilters(): SchoolTrackFilters {
  const defaults = getDefaultSchoolTrackFilters();
  if (typeof window === "undefined") return defaults;
  const studentId = new URLSearchParams(window.location.search).get("studentId");
  return studentId ? { ...defaults, studentId } : defaults;
}

function asInput(form: FormState, student: SchoolTrackStudent): SchoolTrackResultInput {
  return {
    branchId: student.branch_id,
    classId: student.class_id,
    studentId: student.id,
    subject: form.subject,
    assessmentTitle: form.assessmentTitle,
    assessmentType: form.assessmentType,
    academicYear: form.academicYear,
    term: form.term,
    assessmentDate: form.assessmentDate,
    score: Number(form.score),
    maxScore: Number(form.maxScore),
    notes: form.notes,
  };
}
function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("ar-DZ-u-nu-latn", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)}%`;
}
function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ar-DZ-u-nu-latn", { dateStyle: "medium" }).format(date);
}
function downloadCsv(results: SchoolTrackResult[]) {
  const blob = new Blob([buildSchoolTrackCsv(results)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "school-track-results.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
function friendlyError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    student_required: "اختر الطالب أولًا.",
    subject_invalid: "أدخل اسم مادة صحيحًا لا يتجاوز 100 حرف.",
    assessment_title_invalid: "أدخل اسم الاختبار أو الفرض.",
    academic_year_invalid: "اكتب السنة بصيغة 2026/2027 أو 2026-2027.",
    term_invalid: "أدخل اسم الفصل الدراسي.",
    date_invalid: "تحقق من تاريخ الامتحان.",
    assessment_type_invalid: "اختر نوع تقييم صحيحًا.",
    score_invalid: "يجب أن تكون العلامة بين صفر والحد الأقصى المحدد.",
    notes_too_long: "الملاحظات أطول من المسموح.",
  };
  return messages[code] ?? "تعذر تنفيذ العملية. تحقق من اتصالك وصلاحياتك ثم حاول مجددًا.";
}

export default function SchoolTrack() {
  const { school } = useAuth();
  const { locale } = useLocale();
  const [, setLocation] = useLocation();
  const [scope, setScope] = useState<SchoolTrackScope | null>(null);
  const [students, setStudents] = useState<SchoolTrackStudent[]>([]);
  const [results, setResults] = useState<SchoolTrackResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [resultsLoading, setResultsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tab, setTab] = useState("reports");
  const [draftFilters, setDraftFilters] = useState<SchoolTrackFilters>(initialFilters);
  const [filters, setFilters] = useState<SchoolTrackFilters>(initialFilters);
  const [form, setForm] = useState<FormState>(() => newForm());
  const [formStudentBranch, setFormStudentBranch] = useState("");
  const [editing, setEditing] = useState<SchoolTrackResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    if (!school?.id) return;
    let cancelled = false;
    setLoadState("loading");
    void (async () => {
      try {
        const nextScope = await fetchSchoolTrackScope(school.id);
        if (cancelled) return;
        setScope(nextScope);
        if (!nextScope.canView) {
          setLoadState("forbidden");
          return;
        }
        const { data, error } = await getSupabaseClient()
          .from("students")
          .select("id, branch_id, class_id, first_name, last_name, education_level, education_year")
          .eq("school_id", school.id)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });
        if (error) throw error;
        const visibleStudents = ((data ?? []) as SchoolTrackStudent[]).filter(student =>
          canViewSchoolTrackStudent(nextScope, student)
        );
        setStudents(visibleStudents);
        const manageable = visibleStudents.find(student =>
          canManageSchoolTrackStudent(nextScope, student)
        );
        setForm(current => newForm(manageable?.id ?? current.studentId));
        setTab(nextScope.canManage ? "entry" : "reports");
        setLoadState("ready");
      } catch {
        if (!cancelled) {
          setScope(null);
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [school?.id]);

  useEffect(() => {
    if (!school?.id || !scope?.canView || loadState !== "ready") return;
    let cancelled = false;
    setResultsLoading(true);
    setErrorMessage("");
    void fetchSchoolTrackResults(school.id, filters)
      .then(rows => {
        if (!cancelled) setResults(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setErrorMessage("تعذر تحميل النتائج ضمن نطاق الصلاحيات الحالي.");
        }
      })
      .finally(() => {
        if (!cancelled) setResultsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, loadState, school?.id, scope]);

  const visibleStudents = useMemo(
    () => students.filter(student => !filters.branchId || student.branch_id === filters.branchId),
    [filters.branchId, students]
  );
  const studentsById = useMemo(
    () => new Map(students.map(student => [student.id, student])),
    [students]
  );
  const classNames = useMemo(
    () => new Map((scope?.classes ?? []).map(item => [item.id, item.name])),
    [scope?.classes]
  );
  const branchNames = useMemo(
    () => new Map((scope?.branches ?? []).map(item => [item.id, item.name])),
    [scope?.branches]
  );
  const summary = useMemo(() => summarizeSchoolTrackResults(results), [results]);
  const terms = useMemo(
    () => [...new Set(results.map(item => item.term))].sort((a, b) => a.localeCompare(b, "ar")),
    [results]
  );
  const manageableStudents = useMemo(
    () => students.filter(student => scope && canManageSchoolTrackStudent(scope, student)),
    [scope, students]
  );
  const formStudents = useMemo(
    () => manageableStudents.filter(student => !formStudentBranch || student.branch_id === formStudentBranch),
    [formStudentBranch, manageableStudents]
  );

  useEffect(() => {
    if (!scope || formStudentBranch) return;
    const first = manageableStudents[0];
    if (first) setFormStudentBranch(first.branch_id);
  }, [formStudentBranch, manageableStudents, scope]);

  useEffect(() => {
    if (!form.studentId || editing) return;
    const student = studentsById.get(form.studentId);
    if (student && student.branch_id !== formStudentBranch) {
      setFormStudentBranch(student.branch_id);
    }
  }, [editing, form.studentId, formStudentBranch, studentsById]);

  const reportStudents = useMemo(
    () => students.filter(student =>
      (!draftFilters.branchId || student.branch_id === draftFilters.branchId) &&
      (!draftFilters.classId || student.class_id === draftFilters.classId)
    ),
    [draftFilters.branchId, draftFilters.classId, students]
  );

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters({ ...draftFilters });
    setAnalysis(null);
    setAnalysisError("");
  };

  const resetForm = () => {
    setEditing(null);
    setForm(newForm(manageableStudents[0]?.id ?? ""));
    if (manageableStudents[0]) setFormStudentBranch(manageableStudents[0].branch_id);
  };

  const editResult = (row: SchoolTrackResult) => {
    setEditing(row);
    setFormStudentBranch(row.branch_id);
    setForm({
      studentId: row.student_id,
      subject: row.subject,
      assessmentTitle: row.assessment_title,
      assessmentType: row.assessment_type,
      academicYear: row.academic_year,
      term: row.term,
      assessmentDate: row.assessment_date,
      score: String(row.score),
      maxScore: String(row.max_score),
      notes: row.notes ?? "",
    });
    setTab("entry");
  };

  const saveResult = async (event: FormEvent) => {
    event.preventDefault();
    const student = studentsById.get(form.studentId);
    const canManageTarget = scope && (editing
      ? scope.manageBranchIds.includes(editing.branch_id) ||
        (editing.class_id !== null && scope.manageClassIds.includes(editing.class_id))
      : student && canManageSchoolTrackStudent(scope, student));
    if (!school?.id || !student || !scope || !canManageTarget) {
      setErrorMessage("لا تملك صلاحية تسجيل نتيجة هذا الطالب.");
      return;
    }
    const input = asInput(form, student);
    setSaving(true);
    setErrorMessage("");
    try {
      if (editing) {
        await updateSchoolTrackResult(
          editing.id,
          input,
          editing.branch_id,
          editing.class_id,
          editing.student_id
        );
        toast.success("تم تحديث النتيجة مع حفظ سجل التعديل.");
      } else {
        await createSchoolTrackResult(school.id, input);
        toast.success("تم تسجيل نتيجة الطالب.");
      }
      setEditing(null);
      setForm(newForm(student.id));
      setTab("reports");
      setFilters(current => ({
        ...current,
        branchId: student.branch_id,
        studentId: student.id,
        classId: "",
        academicYear: input.academicYear,
        term: input.term,
      }));
      setDraftFilters(current => ({
        ...current,
        branchId: student.branch_id,
        studentId: student.id,
        classId: "",
        academicYear: input.academicYear,
        term: input.term,
      }));
    } catch (error) {
      setErrorMessage(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const analyzeStudent = async () => {
    if (!school?.id || !filters.studentId) return;
    setAnalyzing(true);
    setAnalysis(null);
    setAnalysisError("");
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "analyze-school-track",
        { body: { schoolId: school.id, studentId: filters.studentId, locale } }
      );
      if (error) throw error;
      if (!data || typeof data.summary !== "string") throw new Error("analysis_unavailable");
      setAnalysis(data as Analysis);
    } catch {
      setAnalysisError(
        "تعذر إعداد التحليل. تأكد من نشر وظيفة التحليل وضبط مفتاح مزود الذكاء الاصطناعي في Supabase."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  if (loadState === "loading") {
    return <section className="grid min-h-[50vh] place-items-center" role="status"><RefreshCw className="size-5 animate-spin" /><span className="mt-3 text-sm">جارٍ تحميل المسار المدرسي...</span></section>;
  }
  if (loadState === "forbidden") {
    return <EmptyState icon={GraduationCap} title="لا توجد صلاحية للمسار المدرسي" description="اطلب من مدير المدرسة منحك صلاحية عرض نتائج المسار المدرسي." />;
  }
  if (loadState === "error" || !scope) {
    return <EmptyState title="تعذر تحميل المسار المدرسي" description="لم يتم عرض أي نتائج. تحقق من اتصالك وصلاحيات الفروع ثم أعد المحاولة." action={<Button variant="outline" onClick={() => window.location.reload()}>إعادة المحاولة</Button>} />;
  }

  const manageableBranches = scope.branches.filter(branch =>
    scope.manageBranchIds.includes(branch.id) ||
    scope.classes.some(item => item.branchId === branch.id && scope.manageClassIds.includes(item.id))
  );
  const resultIsEditable = (row: SchoolTrackResult) =>
    scope.manageBranchIds.includes(row.branch_id) ||
    (row.class_id !== null && scope.manageClassIds.includes(row.class_id));

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        eyebrow="متابعة تعليمية"
        title="المسار المدرسي"
        description="سجّل نتائج الامتحانات، تابع المواد والفصول، واعرضها بجانب مسار الطالب القرآني في ملفه الموحد."
        action={<Button variant="outline" onClick={() => setLocation("/academic-reports")} className="gap-2"><GraduationCap size={16} />تقارير القرآن والحضور</Button>}
      />

      <div className="rounded-2xl border border-[#DDE9E0] bg-[#F0F7F2] p-4 text-sm leading-6 text-[#315B43]">
        الدرجة تُحفظ مع حدها الأقصى الذي تحدده لكل تقييم؛ الحد الافتراضي 20 قابل للتغيير. التقدير المعروض إرشادي وليس قرار نجاح رسميًا، ويمكن للمدرسة استخدام مواد وفصول دراسية بأسماء مرنة.
      </div>

      {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-white p-2">
          {scope.canManage && <TabsTrigger value="entry" className="min-h-10">إدخال نتيجة</TabsTrigger>}
          <TabsTrigger value="reports" className="min-h-10">التقارير والنتائج</TabsTrigger>
        </TabsList>

        {scope.canManage && (
          <TabsContent value="entry" className="space-y-4">
            <section className="rounded-2xl border border-[#E2EAE4] bg-white p-4 sm:p-6">
              <SectionHeader title={editing ? "تعديل نتيجة امتحان" : "تسجيل نتيجة امتحان جديدة"} description="اختَر الطالب والمادة والفصل ثم أدخل العلامة والحد الأقصى." />
              <form onSubmit={saveResult} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-semibold">الفرع
                  <select value={formStudentBranch} disabled={Boolean(editing)} onChange={event => { setFormStudentBranch(event.target.value); setForm(current => ({ ...current, studentId: "" })); }} required className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3">
                    {manageableBranches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">الطالب
                  <select value={form.studentId} disabled={Boolean(editing)} onChange={event => setForm(current => ({ ...current, studentId: event.target.value }))} required className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3">
                    <option value="">اختر الطالب</option>
                    {formStudents.map(item => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}{item.education_level ? ` · السنة ${item.education_year ?? ""}` : ""}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">المادة
                  <input value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} required maxLength={100} placeholder="مثال: الرياضيات" className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" />
                </label>
                <label className="text-sm font-semibold">اسم التقييم
                  <input value={form.assessmentTitle} onChange={event => setForm(current => ({ ...current, assessmentTitle: event.target.value }))} required maxLength={120} placeholder="مثال: الفرض الأول" className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" />
                </label>
                <label className="text-sm font-semibold">نوع التقييم
                  <select value={form.assessmentType} onChange={event => setForm(current => ({ ...current, assessmentType: event.target.value as SchoolAssessmentType }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3">
                    {SCHOOL_ASSESSMENT_TYPES.map(type => <option key={type} value={type}>{ASSESSMENT_TYPE_LABELS[type]}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">السنة الدراسية
                  <input value={form.academicYear} onChange={event => setForm(current => ({ ...current, academicYear: event.target.value }))} required placeholder="2026/2027" dir="ltr" className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3 text-right" />
                </label>
                <label className="text-sm font-semibold">الفصل الدراسي
                  <input value={form.term} onChange={event => setForm(current => ({ ...current, term: event.target.value }))} required maxLength={60} placeholder="الفصل الأول" className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" />
                </label>
                <label className="text-sm font-semibold">تاريخ التقييم
                  <input type="date" value={form.assessmentDate} onChange={event => setForm(current => ({ ...current, assessmentDate: event.target.value }))} required className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold">العلامة
                    <input type="number" min="0" step="0.01" value={form.score} onChange={event => setForm(current => ({ ...current, score: event.target.value }))} required className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" />
                  </label>
                  <label className="text-sm font-semibold">من
                    <input type="number" min="0.01" max="1000" step="0.01" value={form.maxScore} onChange={event => setForm(current => ({ ...current, maxScore: event.target.value }))} required className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" />
                  </label>
                </div>
                <label className="text-sm font-semibold sm:col-span-2">ملاحظة تربوية اختيارية
                  <textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-[#D6E2D9] p-3" />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                  <Button type="submit" disabled={saving || (!editing && formStudents.length === 0)} className="min-h-11 gap-2"><Save size={16} />{saving ? "جارٍ الحفظ..." : editing ? "حفظ التعديل" : "حفظ النتيجة"}</Button>
                  {editing && <Button type="button" variant="outline" disabled={saving} onClick={resetForm}>إلغاء التعديل</Button>}
                </div>
              </form>
              {!editing && formStudents.length === 0 && <p className="mt-4 text-sm text-amber-800">لا يوجد طالب ضمن الصفوف التي تملك صلاحية إدارتها.</p>}
            </section>
          </TabsContent>
        )}

        <TabsContent value="reports" className="space-y-4">
          <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-[#E2EAE4] bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs font-bold text-[#53675B]">السنة الدراسية<input value={draftFilters.academicYear} onChange={event => setDraftFilters(current => ({ ...current, academicYear: event.target.value }))} placeholder="2026/2027" dir="ltr" className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3 text-right text-sm" /></label>
            <label className="text-xs font-bold text-[#53675B]">الفصل<input list="school-track-terms" value={draftFilters.term} onChange={event => setDraftFilters(current => ({ ...current, term: event.target.value }))} placeholder="كل الفصول" className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3 text-sm" /><datalist id="school-track-terms">{terms.map(term => <option key={term} value={term} />)}</datalist></label>
            <label className="text-xs font-bold text-[#53675B]">الفرع<select value={draftFilters.branchId} onChange={event => setDraftFilters(current => ({ ...current, branchId: event.target.value, classId: "", studentId: "" }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3 text-sm"><option value="">كل الفروع المصرح بها</option>{scope.branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-xs font-bold text-[#53675B]">الحلقة<select value={draftFilters.classId} onChange={event => setDraftFilters(current => ({ ...current, classId: event.target.value, studentId: "" }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3 text-sm"><option value="">كل الحلقات</option>{scope.classes.filter(item => !draftFilters.branchId || item.branchId === draftFilters.branchId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-xs font-bold text-[#53675B]">الطالب<select value={draftFilters.studentId} onChange={event => setDraftFilters(current => ({ ...current, studentId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3 text-sm"><option value="">كل الطلاب</option>{reportStudents.map(item => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}</select></label>
            <label className="text-xs font-bold text-[#53675B]">المادة<input value={draftFilters.subject} onChange={event => setDraftFilters(current => ({ ...current, subject: event.target.value }))} placeholder="كل المواد" className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3 text-sm" /></label>
            <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
              <Button type="submit" disabled={resultsLoading} className="min-h-11">{resultsLoading ? "جارٍ التحديث..." : "تطبيق الفلاتر"}</Button>
              <Button type="button" variant="outline" disabled={resultsLoading || results.length === 0} onClick={() => downloadCsv(results)} className="min-h-11 gap-2"><Download size={16} />تنزيل CSV</Button>
              <Button type="button" variant="outline" disabled={resultsLoading} onClick={() => window.print()} className="min-h-11 gap-2"><Printer size={16} />طباعة التقرير</Button>
            </div>
          </form>

          {errorMessage && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="نتائج مسجلة" value={String(summary.count)} icon={GraduationCap} tone="green" />
            <StatCard label="طلاب لديهم نتائج" value={String(summary.studentCount)} icon={GraduationCap} tone="blue" />
            <StatCard label="متوسط العلامات المعياري" value={summary.averagePercentage === null ? "—" : formatPercent(summary.averagePercentage)} icon={WandSparkles} tone="green" hint="مقارنة موحدة مهما اختلف الحد الأقصى لكل تقييم" />
            <StatCard label="نتائج تحتاج متابعة" value={String(summary.needsSupportCount)} icon={BrainCircuit} tone="amber" hint="أقل من 50%؛ مؤشر تنبيه فقط" />
          </section>

          <section className="rounded-2xl border border-[#E2EAE4] bg-white p-4">
            <SectionHeader title="متوسط المواد" description="متوسط نسبة الطالب في كل مادة ضمن الفلاتر الحالية." />
            {summary.subjects.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{summary.subjects.map(item => <article key={item.subject} className="rounded-xl border border-[#E6EEE8] bg-[#FAFCFA] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">{item.subject}</h3><strong className="text-[#17663B]">{formatPercent(item.averagePercentage)}</strong></div><p className="mt-2 text-xs text-[#718377]">عدد التقييمات: {item.count}</p></article>)}</div> : <p className="mt-3 text-sm text-[#718377]">لا توجد نتائج ضمن الفلاتر الحالية.</p>}
          </section>

          <section className="rounded-2xl border border-[#E2EAE4] bg-white p-4">
            <SectionHeader title="سجل الامتحانات" description="تظهر النتائج التي يسمح نطاق صلاحيتك بعرضها فقط." />
            {resultsLoading ? <div role="status" className="flex items-center gap-2 py-8 text-sm"><Loader2 className="size-4 animate-spin" />جارٍ تحميل النتائج...</div> : results.length === 0 ? <EmptyState title="لا توجد نتائج دراسية" description="غيّر الفلاتر أو سجّل أول نتيجة للطالب." /> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-[#F5F8F5] text-xs text-[#607368]"><tr><th className="p-3">الطالب</th><th className="p-3">الفرع / الحلقة</th><th className="p-3">المادة</th><th className="p-3">التقييم</th><th className="p-3">الفصل</th><th className="p-3">النتيجة</th><th className="p-3">التقدير الإرشادي</th><th className="p-3">التاريخ</th><th className="p-3">إجراء</th></tr></thead><tbody className="divide-y divide-[#EDF2EE]">{results.map(row => { const student = studentsById.get(row.student_id); const percentage = getSchoolTrackPercentage(row.score, row.max_score); return <tr key={row.id}><td className="p-3"><button type="button" className="font-bold text-[#17663B] underline-offset-4 hover:underline" onClick={() => setLocation(`/students/${row.student_id}`)}>{student ? `${student.first_name} ${student.last_name}` : "ملف الطالب"}</button></td><td className="p-3">{branchNames.get(row.branch_id) ?? "—"}{row.class_id ? ` · ${classNames.get(row.class_id) ?? "حلقة سابقة"}` : ""}</td><td className="p-3">{row.subject}</td><td className="p-3">{row.assessment_title}<span className="block text-xs text-[#718377]">{ASSESSMENT_TYPE_LABELS[row.assessment_type]}</span></td><td className="p-3">{row.academic_year} · {row.term}</td><td className="p-3 font-bold">{row.score} / {row.max_score}<span className="block text-xs text-[#718377]">{formatPercent(percentage)}</span></td><td className="p-3">{EVALUATION_LABELS[evaluateSchoolTrackScore(row.score, row.max_score)]}</td><td className="p-3">{formatDate(row.assessment_date)}</td><td className="p-3">{resultIsEditable(row) && <Button type="button" size="sm" variant="outline" onClick={() => editResult(row)} className="gap-1"><Pencil size={14} />تعديل</Button>}</td></tr>; })}</tbody></table></div>}
          </section>

          <section className="rounded-2xl border border-[#DCE8F0] bg-[#F8FBFD] p-4 sm:p-5">
            <SectionHeader title="مساعد المتابعة الذكي" description="ملخص تربوي للاتجاهات في نتائج المدرسة ومتابعة القرآن، مع اقتراح نقاط عمل قابلة للمراجعة." />
            <p className="mt-2 text-xs leading-6 text-[#536D7C]">عند طلب التحليل، تُرسل درجات ومؤشرات متابعة مجهولة الاسم إلى مزود الذكاء الاصطناعي المضبوط في Supabase. لا يُرسل اسم الطالب أو رقم ملفه ولا تُحفظ نتيجة التحليل. لا تعتمد التوصيات آليًا بدل المعلم.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" disabled={!filters.studentId || analyzing} onClick={() => void analyzeStudent()} className="min-h-11 gap-2"><BrainCircuit size={16} />{analyzing ? "جارٍ تحليل المسارين..." : "حلّل الطالب المحدد"}</Button>
              {!filters.studentId && <span className="text-xs text-[#718377]">اختر طالبًا في الفلاتر أولًا.</span>}
            </div>
            {analysisError && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{analysisError}</p>}
            {analysis && <div className="mt-4 space-y-3 rounded-xl border border-[#DCE8F0] bg-white p-4"><div><h3 className="font-bold">ملخص</h3><p className="mt-1 text-sm leading-7">{analysis.summary}</p></div>{analysis.quranDataIncluded && <p className="text-xs text-[#607368]">شمل التحليل سجلات متابعة قرآنية متاحة ضمن صلاحيتك.</p>}{[["نقاط القوة", analysis.strengths], ["مجالات تحتاج دعمًا", analysis.focusAreas], ["خطوات مقترحة", analysis.actions]].map(([heading, items]) => <div key={String(heading)}><h3 className="font-bold">{heading}</h3><ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-6">{(items as string[]).map((item, index) => <li key={`${heading}-${index}`}>{item}</li>)}</ul></div>)}</div>}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
