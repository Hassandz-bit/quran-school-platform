import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  GraduationCap,
  Hash,
  RefreshCw,
  Users,
} from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  PageHeader,
  QuickActionCard,
  StatCard,
} from "@/components/ui/app-primitives";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  fetchClassDetails,
  translateClassStatus,
  type ClassDetailsData,
} from "@/lib/classes";

const copy = {
  ar: {
    classes: "الحلقات",
    back: "العودة إلى الحلقات",
    details: "تفاصيل الحلقة",
    loading: "جارٍ تحميل تفاصيل الحلقة...",
    retry: "إعادة المحاولة",
    loadError: "تعذر تحميل تفاصيل الحلقة. تحقق من صلاحية الوصول وحاول مجددًا.",
    notFound: "لم يتم العثور على الحلقة أو لا تملك صلاحية عرضها.",
    branch: "الفرع",
    code: "رمز الحلقة",
    schedule: "التوقيت",
    status: "الحالة",
    noValue: "غير محدد",
    overview: "بيانات الحلقة",
    students: "طلاب الحلقة",
    teachers: "المعلمون المسندون",
    studentsCount: "عدد الطلاب",
    activeStudents: "الطلاب النشطون",
    assignedTeachers: "المعلمون المسندون",
    noStudents: "لا يوجد طلاب مسجلون في هذه الحلقة حاليًا.",
    noTeachers: "لا يوجد معلمون مسندون إلى هذه الحلقة حاليًا.",
    studentStatus: "الحالة",
    teacherRole: "الدور",
    assignmentStatus: "حالة الإسناد",
    primary: "معلم رئيسي",
    assistant: "معلم مساعد",
    active: "نشط",
    inactive: "غير نشط",
    attendance: "تسجيل الحضور",
    attendanceDescription: "افتح سجل حضور هذه الحلقة مباشرة.",
    memorization: "الحفظ الجماعي",
    memorizationDescription: "سجل الحفظ والمتابعة لطلاب الحلقة في جلسة واحدة.",
    unknownTeacher: "معلم غير متاح",
    studentStatuses: {
      active: "نشط",
      suspended: "موقوف مؤقتًا",
      transferred: "منقول",
      graduated: "متخرج",
      withdrawn: "منسحب",
    } as Record<string, string>,
  },
  en: {
    classes: "Classes",
    back: "Back to classes",
    details: "Class details",
    loading: "Loading class details...",
    retry: "Try again",
    loadError: "Class details could not be loaded. Check your access and try again.",
    notFound: "This class was not found or you do not have permission to view it.",
    branch: "Branch",
    code: "Class code",
    schedule: "Schedule",
    status: "Status",
    noValue: "Not set",
    overview: "Class information",
    students: "Class students",
    teachers: "Assigned teachers",
    studentsCount: "Students",
    activeStudents: "Active students",
    assignedTeachers: "Assigned teachers",
    noStudents: "No students are currently registered in this class.",
    noTeachers: "No teachers are currently assigned to this class.",
    studentStatus: "Status",
    teacherRole: "Role",
    assignmentStatus: "Assignment status",
    primary: "Primary teacher",
    assistant: "Assistant teacher",
    active: "Active",
    inactive: "Inactive",
    attendance: "Record attendance",
    attendanceDescription: "Open attendance for this class directly.",
    memorization: "Group memorization",
    memorizationDescription: "Record memorization and follow-up for the class in one session.",
    unknownTeacher: "Unavailable teacher",
    studentStatuses: {
      active: "Active",
      suspended: "Temporarily suspended",
      transferred: "Transferred",
      graduated: "Graduated",
      withdrawn: "Withdrawn",
    } as Record<string, string>,
  },
} as const;

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#F7FAF8] p-3">
      <dt className="text-xs font-semibold text-[#718377]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#173B2D]">{value}</dd>
    </div>
  );
}

function statusTone(status: string): string {
  if (status === "active") return "border-[#CDE4D2] bg-[#E8F3EC] text-[#17663B]";
  if (status === "inactive") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-100 text-gray-700";
}

export default function ClassDetails() {
  const [, params] = useRoute("/classes/:classId");
  const [, setLocation] = useLocation();
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const t = copy[locale];
  const classId = params?.classId ?? "";
  const [details, setDetails] = useState<ClassDetailsData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  const load = useCallback(async () => {
    if (!school?.id || !classId) {
      setState("missing");
      return;
    }
    setState("loading");
    try {
      const result = await fetchClassDetails(school.id, classId);
      setDetails(result);
      setState(result ? "ready" : "missing");
    } catch {
      setState("error");
    }
  }, [classId, school?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const backButton = (
    <Button type="button" variant="outline" onClick={() => setLocation("/classes")}>
      {direction === "rtl" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
      {t.back}
    </Button>
  );

  if (state !== "ready" || !details) {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6" dir={direction}>
        <PageHeader eyebrow={t.classes} title={t.details} action={backButton} />
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
          <EmptyState title={t.details} description={t.notFound} icon={BookOpen} action={backButton} />
        )}
      </main>
    );
  }

  const { classItem, branchName, students, assignments } = details;
  const activeStudents = students.filter(student => student.status === "active").length;
  const activeAssignments = assignments.filter(assignment => assignment.status === "active").length;
  const attendanceParams = new URLSearchParams({ branchId: classItem.branch_id, classId: classItem.id });
  const memorizationParams = new URLSearchParams({ branchId: classItem.branch_id, classId: classItem.id, mode: "group" });

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6" dir={direction}>
      <PageHeader
        eyebrow={t.classes}
        title={classItem.name}
        description={`${t.code}: ${classItem.code}`}
        action={backButton}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t.studentsCount} value={String(students.length)} icon={Users} />
        <StatCard label={t.activeStudents} value={String(activeStudents)} icon={BookOpen} tone="blue" />
        <StatCard label={t.assignedTeachers} value={String(activeAssignments)} icon={GraduationCap} tone="amber" />
      </div>

      <Card className="border-[#E5EDE7] bg-white shadow-sm">
        <CardHeader className="px-5 pb-0 md:px-6">
          <CardTitle className="text-base text-[#173B2D]">{t.overview}</CardTitle>
        </CardHeader>
        <CardContent className="px-5 md:px-6">
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailField label={t.branch} value={branchName ?? t.noValue} />
            <DetailField label={t.code} value={classItem.code} />
            <DetailField label={t.schedule} value={classItem.schedule_label ?? t.noValue} />
            <div className="min-w-0 rounded-xl bg-[#F7FAF8] p-3">
              <dt className="text-xs font-semibold text-[#718377]">{t.status}</dt>
              <dd className="mt-1">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(classItem.status)}`}>
                  {translateClassStatus(classItem.status, locale)}
                </span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-[#E5EDE7] bg-white shadow-sm">
          <CardHeader className="px-5 pb-0 md:px-6">
            <CardTitle className="flex items-center gap-2 text-base text-[#173B2D]">
              <GraduationCap size={18} /> {t.teachers}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 md:px-6">
            {assignments.length === 0 ? (
              <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#718377]">{t.noTeachers}</p>
            ) : (
              <ul className="divide-y divide-[#EAF0EB]">
                {assignments.map(assignment => (
                  <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="text-start text-sm font-bold text-[#17663B] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                        onClick={() => assignment.teacherId && setLocation(`/teachers/${assignment.teacherId}`)}
                        disabled={!assignment.teacherId}
                      >
                        {assignment.teacherName || t.unknownTeacher}
                      </button>
                      <p className="mt-1 text-xs text-[#718377]">
                        {assignment.assignmentRole === "primary" ? t.primary : t.assistant}
                        {" · "}{assignment.assignedAt}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(assignment.status)}`}>
                      {assignment.status === "active" ? t.active : t.inactive}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#E5EDE7] bg-white shadow-sm">
          <CardHeader className="px-5 pb-0 md:px-6">
            <CardTitle className="flex items-center gap-2 text-base text-[#173B2D]">
              <Users size={18} /> {t.students}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 md:px-6">
            {students.length === 0 ? (
              <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#718377]">{t.noStudents}</p>
            ) : (
              <ul className="max-h-80 divide-y divide-[#EAF0EB] overflow-y-auto">
                {students.map(student => (
                  <li key={student.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      className="min-w-0 text-start text-sm font-semibold text-[#17663B] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                      onClick={() => setLocation(`/students/${student.id}`)}
                    >
                      {student.first_name} {student.last_name}
                    </button>
                    <span className="shrink-0 text-xs text-[#718377]">
                      {t.studentStatuses[student.status] ?? student.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label={locale === "ar" ? "متابعة الحلقة" : "Class follow-up"}>
        <div className="mb-3 flex items-center gap-2 text-[#173B2D]">
          <CalendarDays size={18} />
          <h2 className="text-base font-bold">{locale === "ar" ? "متابعة الحلقة" : "Class follow-up"}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickActionCard
            label={t.attendance}
            description={t.attendanceDescription}
            icon={CalendarDays}
            tone="blue"
            onClick={() => setLocation(`/attendance?${attendanceParams.toString()}`)}
          />
          <QuickActionCard
            label={t.memorization}
            description={t.memorizationDescription}
            icon={BookOpenCheck}
            tone="green"
            onClick={() => setLocation(`/memorization?${memorizationParams.toString()}`)}
          />
        </div>
      </section>
    </main>
  );
}
