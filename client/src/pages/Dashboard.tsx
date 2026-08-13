import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  GraduationCap,
  Landmark,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  PageHeader,
  QuickActionCard,
  SectionHeader,
  StatCard,
} from "@/components/ui/app-primitives";
import DemoModeCard from "@/components/DemoModeCard";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchDashboardData,
  getDashboardErrorMessage,
  getDashboardScheduleLabel,
  type DashboardData,
  type DashboardErrorKind,
} from "@/lib/dashboard";

const roleLabels: Record<string, string> = {
  teacher: "معلم",
  academic_supervisor: "مشرف أكاديمي",
  finance_officer: "مسؤول مالي",
  registrar: "مسؤول التسجيل",
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { school, profile, activeRoleCodes, isSchoolAdmin } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<DashboardErrorKind | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!school?.id) {
      setDashboardData(null);
      setLoadError("missingSchool");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      setDashboardData(await fetchDashboardData(school.id));
    } catch {
      setDashboardData(null);
      setLoadError("load");
    } finally {
      setIsLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const roles = useMemo(() => new Set(activeRoleCodes), [activeRoleCodes]);
  const canManageSchool = isSchoolAdmin;
  const canRegisterStudents = isSchoolAdmin || roles.has("registrar");
  const canUseLearning =
    isSchoolAdmin || roles.has("teacher") || roles.has("academic_supervisor");
  const canUseFinance = isSchoolAdmin || roles.has("finance_officer");
  const userRole = isSchoolAdmin
    ? "مدير المدرسة"
    : activeRoleCodes.map(role => roleLabels[role]).find(Boolean) ?? "عضو المدرسة";
  const formattedDate = new Intl.DateTimeFormat("ar-DZ-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const quickActions = [
    ...(canUseLearning
      ? [
          {
            label: "تسجيل الحضور",
            description: "إدارة حضور طلاب الحلقة اليوم",
            icon: CalendarDays,
            path: "/attendance",
            tone: "green" as const,
          },
          {
            label: "متابعة الحفظ",
            description: "تسجيل إنجاز الطالب ومراجعته",
            icon: BookOpenCheck,
            path: "/memorization",
            tone: "blue" as const,
          },
        ]
      : []),
    ...(canRegisterStudents
      ? [
          {
            label: "إضافة طالب",
            description: "تسجيل طالب جديد في المدرسة",
            icon: Plus,
            path: "/students/new",
            tone: "green" as const,
          },
        ]
      : []),
    ...(canManageSchool
      ? [
          {
            label: "إنشاء حلقة",
            description: "إضافة حلقة أو مجموعة تعليمية",
            icon: BookOpen,
            path: "/classes/new",
            tone: "amber" as const,
          },
          {
            label: "إضافة معلم",
            description: "إدراج معلم في دليل المدرسة",
            icon: GraduationCap,
            path: "/teachers/new",
            tone: "blue" as const,
          },
        ]
      : []),
    ...(canUseFinance
      ? [
          {
            label: "إجراء مالي",
            description: "تسجيل دفعة أو مراجعة الحسابات",
            icon: Landmark,
            path: "/finance/payments",
            tone: "amber" as const,
          },
        ]
      : []),
  ].slice(0, 4);

  const branchNames = useMemo(
    () => new Map(dashboardData?.branches.map(branch => [branch.id, branch.name])),
    [dashboardData?.branches]
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="لوحة التحكم"
        title={profile?.full_name ? `مرحبًا، ${profile.full_name}` : "مرحبًا بك"}
        description="نظرة سريعة على ما يحتاج اهتمامك اليوم."
      />

      <section className="overflow-hidden rounded-3xl bg-[#123B2C] p-5 text-white shadow-[0_16px_36px_rgba(18,59,44,0.16)] sm:p-7">
        <div className="relative">
          <span className="absolute -left-12 -top-16 size-36 rounded-full border border-white/10" />
          <span className="absolute -bottom-20 right-1/3 size-40 rounded-full bg-[#2F855A]/20 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#D7E9DA]">{userRole}</p>
              <h2 className="mt-2 truncate text-xl font-extrabold sm:text-2xl">
                {school?.name ?? "المدرسة القرآنية"}
              </h2>
              <p className="mt-2 text-sm text-white/75">{formattedDate}</p>
            </div>
            <span className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
              أهلاً بك في QuranOS
            </span>
          </div>
        </div>
      </section>

      {isSchoolAdmin && school?.id && (
        <DemoModeCard schoolId={school.id} onChanged={loadDashboard} />
      )}

      {isLoading ? (
        <section
          className="rounded-2xl border border-[#E2EAE3] bg-white p-8 text-center"
          role="status"
        >
          <RefreshCw className="mx-auto size-6 animate-spin text-[#2F855A]" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-[#607368]">
            جارٍ تحميل بيانات لوحة التحكم...
          </p>
        </section>
      ) : loadError || !dashboardData ? (
        <section
          className="rounded-2xl border border-red-100 bg-white p-8 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-red-700">
            {getDashboardErrorMessage(loadError ?? "load")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11 border-[#BFDCC7] text-[#17663B]"
            onClick={() => void loadDashboard()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            إعادة المحاولة
          </Button>
        </section>
      ) : (
        <>
          <section>
            <SectionHeader title="ملخص المدرسة" description="بيانات متاحة ضمن نطاقك الحالي." />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-2xl">
              <StatCard
                label="إجمالي الطلاب"
                value={dashboardData.totalStudents.toLocaleString("ar-DZ-u-nu-latn")}
                icon={Users}
                tone="green"
              />
              <StatCard
                label="الحلقات النشطة"
                value={dashboardData.activeClassesCount.toLocaleString("ar-DZ-u-nu-latn")}
                icon={BookOpen}
                tone="blue"
              />
            </div>
          </section>

          {quickActions.length > 0 && (
            <section>
              <SectionHeader title="إجراءات سريعة" description="اختصارات تناسب صلاحياتك." />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {quickActions.map(action => (
                  <QuickActionCard
                    key={action.path}
                    {...action}
                    onClick={() => setLocation(action.path)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
            <div className="rounded-3xl border border-[#E5EDE7] bg-white p-4 shadow-[0_1px_2px_rgba(23,59,45,0.04)] sm:p-5">
              <SectionHeader
                title="الحلقات النشطة"
                description="أحدث الحلقات المسجلة في المدرسة."
                action={
                  canManageSchool ? (
                    <button
                      type="button"
                      onClick={() => setLocation("/classes")}
                      className="min-h-10 rounded-xl px-3 text-xs font-bold text-[#17663B] transition hover:bg-[#EEF6F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                    >
                      كل الحلقات
                    </button>
                  ) : undefined
                }
              />
              {dashboardData.activeClasses.length === 0 ? (
                <EmptyState
                  title="لا توجد حلقات نشطة بعد"
                  description="ستظهر الحلقات هنا فور إضافتها إلى المدرسة."
                  icon={BookOpen}
                />
              ) : (
                <div className="space-y-2">
                  {dashboardData.activeClasses.map(classItem => (
                    <article
                      key={classItem.id}
                      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[#E8EFE9] bg-[#FCFDFC] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-extrabold text-[#173B2D]">
                          {classItem.name}
                        </h3>
                        <p className="mt-1 truncate text-xs text-[#718377]">
                          {branchNames.get(classItem.branch_id) ?? "فرع غير محدد"}
                        </p>
                      </div>
                      <span className="w-fit shrink-0 rounded-full bg-[#EEF6F0] px-3 py-1 text-xs font-bold text-[#2F6E46]">
                        {getDashboardScheduleLabel(classItem.schedule_label)}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className="rounded-3xl border border-[#E5EDE7] bg-white p-4 shadow-[0_1px_2px_rgba(23,59,45,0.04)] sm:p-5">
              <SectionHeader title="البدء السريع" description="انتقل مباشرة إلى وحدة عملك." />
              <div className="space-y-2">
                {[
                  ...(canUseLearning
                    ? [
                        { label: "الحضور والغياب", path: "/attendance", icon: CalendarDays },
                        { label: "الحفظ والمراجعة", path: "/memorization", icon: BookOpenCheck },
                      ]
                    : []),
                  ...(canUseFinance
                    ? [{ label: "المالية", path: "/finance", icon: Landmark }]
                    : []),
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => setLocation(item.path)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-right text-sm font-bold text-[#244E3B] transition hover:bg-[#F0F6F1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EEF6F0] text-[#17663B]">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      {item.label}
                    </button>
                  );
                })}
                {!canUseLearning && !canUseFinance && (
                  <EmptyState
                    title="لا توجد اختصارات إضافية"
                    description="استخدم قائمة المزيد للوصول إلى الوحدات المتاحة لك."
                  />
                )}
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}