import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/app-primitives";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  fetchTeacherDetails,
  hasTeacherManagePermission,
  translateTeacherGender,
  translateTeacherStatus,
  type TeacherDetailsData,
} from "@/lib/teachers";

const copy = {
  ar: {
    teachers: "المعلمون",
    edit: "تعديل البيانات",
    back: "العودة إلى المعلمين",
    loading: "جارٍ تحميل بيانات المعلم...",
    retry: "إعادة المحاولة",
    loadError: "تعذر تحميل بيانات المعلم. تحقق من صلاحية الوصول وحاول مجددًا.",
    notFound: "لم يتم العثور على المعلم أو لا تملك صلاحية عرض بياناته.",
    branch: "الفرع",
    gender: "الجنس",
    phone: "رقم الهاتف",
    email: "البريد الإلكتروني",
    specialization: "التخصص",
    qualification: "المؤهل العلمي",
    hireDate: "تاريخ التوظيف",
    status: "الحالة الوظيفية",
    notes: "ملاحظات",
    noValue: "غير محدد",
    overview: "البيانات الشخصية والوظيفية",
    assignments: "الحلقات المسندة",
    assignmentsCount: "إجمالي الحلقات",
    activeAssignments: "الإسنادات النشطة",
    noAssignments: "لا توجد حلقات مسندة إلى هذا المعلم حاليًا.",
    className: "الحلقة",
    classCode: "الرمز",
    schedule: "التوقيت",
    assignmentRole: "الدور",
    assignmentStatus: "حالة الإسناد",
    assignedAt: "تاريخ الإسناد",
    primary: "معلم رئيسي",
    assistant: "معلم مساعد",
    active: "نشط",
    inactive: "غير نشط",
    classStatuses: { active: "نشطة", inactive: "غير نشطة", archived: "مؤرشفة" } as Record<string, string>,
  },
  en: {
    teachers: "Teachers",
    edit: "Edit details",
    back: "Back to teachers",
    loading: "Loading teacher details...",
    retry: "Try again",
    loadError: "Teacher details could not be loaded. Check your access and try again.",
    notFound: "This teacher was not found or you do not have permission to view their details.",
    branch: "Branch",
    gender: "Gender",
    phone: "Phone number",
    email: "Email address",
    specialization: "Specialization",
    qualification: "Qualification",
    hireDate: "Hire date",
    status: "Employment status",
    notes: "Notes",
    noValue: "Not set",
    overview: "Personal and employment details",
    assignments: "Assigned classes",
    assignmentsCount: "Total classes",
    activeAssignments: "Active assignments",
    noAssignments: "No classes are currently assigned to this teacher.",
    className: "Class",
    classCode: "Code",
    schedule: "Schedule",
    assignmentRole: "Role",
    assignmentStatus: "Assignment status",
    assignedAt: "Assigned on",
    primary: "Primary teacher",
    assistant: "Assistant teacher",
    active: "Active",
    inactive: "Inactive",
    classStatuses: { active: "Active", inactive: "Inactive", archived: "Archived" } as Record<string, string>,
  },
} as const;

function DetailField({ label, value, dir }: { label: string; value: string; dir?: "ltr" | "rtl" }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#F7FAF8] p-3">
      <dt className="text-xs font-semibold text-[#718377]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#173B2D]" dir={dir}>{value}</dd>
    </div>
  );
}

function statusTone(status: string): string {
  if (status === "active") return "border-[#CDE4D2] bg-[#E8F3EC] text-[#17663B]";
  if (status === "on_leave") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "inactive") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-100 text-gray-700";
}

function formatDate(value: string, locale: "ar" | "en"): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ-u-nu-latn" : "en-GB", { dateStyle: "medium" }).format(date);
}

export default function TeacherDetails() {
  const [, params] = useRoute("/teachers/:teacherId");
  const [, setLocation] = useLocation();
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const t = copy[locale];
  const teacherId = params?.teacherId ?? "";
  const [details, setDetails] = useState<TeacherDetailsData | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  const load = useCallback(async () => {
    if (!school?.id || !teacherId) {
      setState("missing");
      return;
    }
    setState("loading");
    try {
      const result = await fetchTeacherDetails(school.id, teacherId);
      const editable = result ? await hasTeacherManagePermission(school.id, result.teacher.branch_id) : false;
      setDetails(result);
      setCanEdit(editable);
      setState(result ? "ready" : "missing");
    } catch {
      setCanEdit(false);
      setState("error");
    }
  }, [school?.id, teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backButton = (
    <Button type="button" variant="outline" onClick={() => setLocation("/teachers")}>
      {direction === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
      {t.back}
    </Button>
  );

  if (state !== "ready" || !details) {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6" dir={direction}>
        <PageHeader eyebrow={t.teachers} title={t.teachers} action={backButton} />
        {state === "loading" ? (
          <Card className="border-[#E5EDE7] bg-white p-8 text-center text-[#607368]">
            <RefreshCw className="mx-auto mb-3 animate-spin" size={22} />
            {t.loading}
          </Card>
        ) : state === "error" ? (
          <Card className="border-red-100 bg-white p-8 text-center" role="alert">
            <p className="mb-4 text-sm text-red-700">{t.loadError}</p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw size={16} /> {t.retry}
            </Button>
          </Card>
        ) : (
          <EmptyState title={t.teachers} description={t.notFound} icon={UserRound} action={backButton} />
        )}
      </main>
    );
  }

  const { teacher, branchName, assignments } = details;
  const name = `${teacher.first_name} ${teacher.last_name}`.trim();
  const activeAssignments = assignments.filter(assignment => assignment.assignmentStatus === "active").length;
  const noValue = t.noValue;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6" dir={direction}>
      <PageHeader
        eyebrow={t.teachers}
        title={name}
        description={teacher.specialization ?? t.noValue}
        action={<div className="flex flex-wrap gap-2">{canEdit && <Button type="button" variant="outline" onClick={() => setLocation(`/teachers/${teacher.id}/edit`)}><Pencil size={15} />{t.edit}</Button>}{backButton}</div>}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label={t.assignmentsCount} value={String(assignments.length)} icon={BookOpen} />
        <StatCard label={t.activeAssignments} value={String(activeAssignments)} icon={GraduationCap} tone="blue" />
      </div>

      <Card className="border-[#E5EDE7] bg-white shadow-sm">
        <CardHeader className="px-5 pb-0 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base text-[#173B2D]">
              <UserRound size={18} /> {t.overview}
            </CardTitle>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(teacher.status)}`}>
              {translateTeacherStatus(teacher.status, locale)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-5 md:px-6">
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DetailField label={t.branch} value={branchName ?? noValue} />
            <DetailField label={t.gender} value={translateTeacherGender(teacher.gender, locale)} />
            <DetailField label={t.phone} value={teacher.phone ?? noValue} dir="ltr" />
            <DetailField label={t.email} value={teacher.email ?? noValue} dir="ltr" />
            <DetailField label={t.specialization} value={teacher.specialization ?? noValue} />
            <DetailField label={t.qualification} value={teacher.qualification ?? noValue} />
            <DetailField label={t.hireDate} value={formatDate(teacher.hire_date, locale)} />
          </dl>

          {teacher.notes && (
            <section className="mt-4 rounded-xl border border-[#E5EDE7] bg-[#FBFDFC] p-4">
              <h2 className="text-xs font-semibold text-[#718377]">{t.notes}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#173B2D]">{teacher.notes}</p>
            </section>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {teacher.phone && (
              <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#DCE8DF] px-3 text-sm font-semibold text-[#17663B] hover:bg-[#F5FAF6]" href={`tel:${teacher.phone}`} dir="ltr">
                <Phone size={15} /> {teacher.phone}
              </a>
            )}
            {teacher.email && (
              <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#DCE8DF] px-3 text-sm font-semibold text-[#17663B] hover:bg-[#F5FAF6]" href={`mailto:${teacher.email}`} dir="ltr">
                <Mail size={15} /> {teacher.email}
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#E5EDE7] bg-white shadow-sm">
        <CardHeader className="px-5 pb-0 md:px-6">
          <CardTitle className="flex items-center gap-2 text-base text-[#173B2D]">
            <GraduationCap size={18} /> {t.assignments}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 md:px-6">
          {assignments.length === 0 ? (
            <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#718377]">{t.noAssignments}</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {assignments.map(assignment => (
                <article key={assignment.id} className="rounded-xl border border-[#E5EDE7] bg-[#FBFDFC] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="text-start text-sm font-bold text-[#17663B] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                        onClick={() => setLocation(`/classes/${assignment.classId}`)}
                      >
                        {assignment.className}
                      </button>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#718377]">
                        <span>{t.classCode}: {assignment.classCode}</span>
                        <span>{t.schedule}: {assignment.scheduleLabel ?? noValue}</span>
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(assignment.assignmentStatus)}`}>
                      {assignment.assignmentStatus === "active" ? t.active : t.inactive}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#EAF0EB] pt-3">
                    <DetailField label={t.assignmentRole} value={assignment.assignmentRole === "primary" ? t.primary : t.assistant} />
                    <DetailField label={t.assignedAt} value={formatDate(assignment.assignedAt, locale)} />
                  </dl>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
