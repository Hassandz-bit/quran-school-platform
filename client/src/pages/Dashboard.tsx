import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BookOpen,
  BookOpenCheck,
  Calendar,
  DollarSign,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchDashboardData,
  getDashboardErrorMessage,
  getDashboardScheduleLabel,
  type DashboardData,
  type DashboardErrorKind,
} from "@/lib/dashboard";
import { toast } from "sonner";
import { fetchMembersAccess } from "@/lib/members";

const Dashboard: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<DashboardErrorKind | null>(null);
  const [, setLocation] = useLocation();
  const { school, signOut, isSchoolAdmin } = useAuth();
  const [canViewMembers, setCanViewMembers] = useState(false);

  const content = {
    ar: {
      dashboard: "لوحة التحكم",
      school: "المدرسة القرآنية",
      students: "الطلاب",
      teachers: "المعلمون",
      classes: "الحلقات",
      finance: "المالية",
      attendance: "الحضور",
      memorization: "متابعة الحفظ",
      members: "أعضاء المدرسة",
      settings: "الإعدادات",
      logout: "تسجيل الخروج",
      welcome: "مرحبًا بك في لوحة التحكم",
      totalStudents: "إجمالي الطلاب",
      dailyAttendance: "الحضور اليومي",
      activeClasses: "الحلقات النشطة",
      pendingPayments: "المتأخرات المالية",
      unavailable: "غير متاح بعد",
      attendanceHint: "يُفعّل بعد إنشاء وحدة الحضور",
      financeHint: "يُفعّل بعد إنشاء الوحدة المالية",
      quickActions: "إجراءات سريعة",
      addStudent: "إضافة طالب",
      createClass: "إنشاء حلقة",
      addTeacher: "إضافة معلم",
      recordMemorization: "تسجيل متابعة",
      comingSoon: "قريبًا",
      activeClassesSection: "الحلقات النشطة",
      viewAllClasses: "عرض جميع الحلقات",
      noActiveClasses: "لا توجد حلقات نشطة حاليًا.",
      branch: "الفرع",
      schedule: "التوقيت",
      unavailableBranch: "غير متاح",
      availableModules: "الوحدات المتاحة",
      attendanceModule: "الحضور والغياب",
      memorizationModule: "الحفظ والمراجعة",
      membersModule: "دليل أعضاء المدرسة",
      availableNow: "متاح",
      loading: "جارٍ تحميل بيانات لوحة التحكم...",
      retry: "إعادة المحاولة",
    },
    en: {
      dashboard: "Dashboard",
      school: "Quran School",
      students: "Students",
      teachers: "Teachers",
      classes: "Classes",
      finance: "Finance",
      attendance: "Attendance",
      memorization: "Memorization",
      members: "Members",
      settings: "Settings",
      logout: "Sign Out",
      welcome: "Welcome to Dashboard",
      totalStudents: "Total Students",
      dailyAttendance: "Daily Attendance",
      activeClasses: "Active Classes",
      pendingPayments: "Pending Payments",
      unavailable: "Not available yet",
      attendanceHint: "Enabled after the attendance module is created",
      financeHint: "Enabled after the finance module is created",
      quickActions: "Quick Actions",
      addStudent: "Add Student",
      createClass: "Create Class",
      addTeacher: "Add Teacher",
      recordMemorization: "Record follow-up",
      comingSoon: "Coming soon",
      activeClassesSection: "Active Classes",
      viewAllClasses: "View all classes",
      noActiveClasses: "There are no active classes yet.",
      branch: "Branch",
      schedule: "Schedule",
      unavailableBranch: "Unavailable",
      availableModules: "Available modules",
      attendanceModule: "Attendance and Absence",
      memorizationModule: "Memorization and Revision",
      membersModule: "School member directory",
      availableNow: "Available",
      loading: "Loading dashboard data...",
      retry: "Try again",
    },
  };

  const t = content[language];

  const loadDashboard = useCallback(async () => {
    setDashboardData(null);
    setLoadError(null);

    if (!school?.id) {
      setIsLoading(false);
      setLoadError("missingSchool");
      return;
    }

    setIsLoading(true);
    try {
      setDashboardData(await fetchDashboardData(school.id));
    } catch {
      setLoadError("load");
    } finally {
      setIsLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;

    if (!school?.id) {
      setCanViewMembers(false);
      return () => {
        cancelled = true;
      };
    }

    if (isSchoolAdmin) {
      setCanViewMembers(true);
      return () => {
        cancelled = true;
      };
    }

    setCanViewMembers(false);
    void fetchMembersAccess(school.id, false)
      .then(access => {
        if (!cancelled) setCanViewMembers(access.canView);
      })
      .catch(() => {
        if (!cancelled) setCanViewMembers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSchoolAdmin, school?.id]);

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
        return;
      }
      setLocation("/login");
    } catch {
      toast.error("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
    }
  };

  const menuItems = [
    { label: t.dashboard, icon: Home, path: "/dashboard" },
    { label: t.students, icon: Users, path: "/students" },
    { label: t.teachers, icon: GraduationCap, path: "/teachers" },
    { label: t.classes, icon: BookOpen, path: "/classes" },
    { label: t.attendance, icon: Calendar, path: "/attendance" },
    {
      label: t.memorization,
      icon: BookOpenCheck,
      path: "/memorization",
    },
    { label: t.finance, icon: DollarSign, path: "/finance" },
    ...(canViewMembers
      ? [{ label: t.members, icon: Users, path: "/members" }]
      : []),
    { label: t.settings, icon: Settings, path: null },
  ];

  const branchNames = useMemo(
    () => new Map(dashboardData?.branches.map(branch => [branch.id, branch.name])),
    [dashboardData?.branches]
  );

  const statCards = dashboardData
    ? [
        {
          label: t.totalStudents,
          value: dashboardData.totalStudents.toString(),
          description: null,
          icon: Users,
          bgColor: "bg-[#0B4738]/10",
          iconColor: "text-[#0B4738]",
        },
        {
          label: t.dailyAttendance,
          value: t.unavailable,
          description: t.attendanceHint,
          icon: Calendar,
          bgColor: "bg-[#0B4738]/10",
          iconColor: "text-[#0B4738]",
        },
        {
          label: t.activeClasses,
          value: dashboardData.activeClassesCount.toString(),
          description: null,
          icon: BookOpen,
          bgColor: "bg-[#C8A26A]/10",
          iconColor: "text-[#C8A26A]",
        },
        {
          label: t.pendingPayments,
          value: t.unavailable,
          description: t.financeHint,
          icon: DollarSign,
          bgColor: "bg-gray-100",
          iconColor: "text-gray-500",
        },
      ]
    : [];

  const SidebarContent = ({ showLabels }: { showLabels: boolean }) => (
    <>
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C8A26A]">
            <span className="text-lg font-bold text-[#0B4738]">ق</span>
          </div>
          {showLabels && (
            <span className="line-clamp-2 text-sm font-semibold text-white">
              {school?.name ?? t.school}
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {menuItems.map(item => {
          const itemContent = (
            <>
              <item.icon size={20} className="shrink-0" />
              {showLabels && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </>
          );

          if (!item.path) {
            return (
              <div
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-white/45"
                aria-disabled="true"
              >
                {itemContent}
              </div>
            );
          }

          return (
            <a
              key={item.label}
              href={item.path}
              onClick={event => {
                event.preventDefault();
                setLocation(item.path);
                setMobileSidebarOpen(false);
              }}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                item.path === "/dashboard"
                  ? "bg-white/15 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {itemContent}
            </a>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-white/70 transition-all duration-200 hover:bg-red-500/20 hover:text-white"
        >
          <LogOut size={20} className="shrink-0" />
          {showLabels && <span className="text-sm font-medium">{t.logout}</span>}
        </button>
      </div>
    </>
  );

  const renderDashboardContent = () => {
    if (isLoading) {
      return (
        <Card className="border border-gray-100 p-10 text-center text-gray-500">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
          <p role="status">{t.loading}</p>
        </Card>
      );
    }

    if (loadError || !dashboardData) {
      return (
        <Card className="border border-red-100 p-10 text-center" role="alert">
          <p className="mb-4 text-red-700">
            {getDashboardErrorMessage(loadError ?? "load", language)}
          </p>
          <Button type="button" variant="outline" onClick={() => void loadDashboard()}>
            <RefreshCw size={16} />
            {t.retry}
          </Button>
        </Card>
      );
    }

    return (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map(stat => (
            <Card
              key={stat.label}
              className="border border-gray-100 p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 text-sm text-gray-500">{stat.label}</p>
                  <p className="break-words text-xl font-bold text-[#2C3E50]">
                    {stat.value}
                  </p>
                  {stat.description && (
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      {stat.description}
                    </p>
                  )}
                </div>
                <div className={`${stat.bgColor} shrink-0 rounded-xl p-3`}>
                  <stat.icon className={stat.iconColor} size={22} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <section>
          <h2 className="mb-4 text-lg font-bold text-[#2C3E50]">
            {t.quickActions}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Button
              type="button"
              onClick={() => setLocation("/students/new")}
              className="flex h-auto flex-col gap-2 rounded-xl py-4 font-medium text-white transition-all duration-200 hover:shadow-md active:scale-[0.97]"
              style={{ backgroundColor: "#0B4738" }}
            >
              <Plus size={20} />
              <span className="text-xs">{t.addStudent}</span>
            </Button>
            <Button
              type="button"
              onClick={() => setLocation("/classes/new")}
              className="flex h-auto flex-col gap-2 rounded-xl border-2 border-[#0B4738] bg-transparent py-4 font-medium text-[#0B4738] transition-all duration-200 hover:bg-[#0B4738]/5 hover:shadow-md active:scale-[0.97]"
              variant="outline"
            >
              <Plus size={20} />
              <span className="text-xs">{t.createClass}</span>
            </Button>
            <Button
              type="button"
              onClick={() => setLocation("/teachers/new")}
              className="flex h-auto flex-col gap-2 rounded-xl border-2 border-[#C8A26A] bg-transparent py-4 font-medium text-[#9A7137] transition-all duration-200 hover:bg-[#C8A26A]/5 hover:shadow-md active:scale-[0.97]"
              variant="outline"
            >
              <GraduationCap size={20} />
              <span className="text-xs">{t.addTeacher}</span>
            </Button>
            <Button
              type="button"
              onClick={() => setLocation("/memorization")}
              className="flex h-auto flex-col gap-2 rounded-xl border-2 border-[#0B4738] bg-[#0B4738]/5 py-4 font-medium text-[#0B4738] transition-all duration-200 hover:bg-[#0B4738]/10 hover:shadow-md active:scale-[0.97]"
              variant="outline"
            >
              <BookOpenCheck size={20} />
              <span className="text-xs">{t.recordMemorization}</span>
            </Button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border border-gray-100 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#2C3E50]">
                {t.activeClassesSection}
              </h2>
              <Button
                type="button"
                variant="ghost"
                className="h-auto px-2 py-1 text-xs text-[#0B4738]"
                onClick={() => setLocation("/classes")}
              >
                {t.viewAllClasses}
              </Button>
            </div>

            {dashboardData.activeClasses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                {t.noActiveClasses}
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardData.activeClasses.map(classItem => (
                  <div
                    key={classItem.id}
                    className="rounded-xl border border-[#0B4738]/10 bg-[#0B4738]/5 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-[#2C3E50]">
                          {classItem.name}
                        </p>
                        <p className="mt-1 font-mono text-xs text-gray-500" dir="ltr">
                          {classItem.code}
                        </p>
                      </div>
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs text-gray-600">
                        {getDashboardScheduleLabel(classItem.schedule_label, language)}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2">
                      <div>
                        <dt className="inline text-gray-400">{t.branch}: </dt>
                        <dd className="inline">
                          {branchNames.get(classItem.branch_id) ?? t.unavailableBranch}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-gray-400">{t.schedule}: </dt>
                        <dd className="inline">
                          {getDashboardScheduleLabel(classItem.schedule_label, language)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="border border-gray-100 p-5">
            <h2 className="mb-4 text-base font-bold text-[#2C3E50]">
              {t.availableModules}
            </h2>
            <div className="space-y-3">
              {[
                {
                  label: t.attendanceModule,
                  status: t.availableNow,
                  icon: Calendar,
                  path: "/attendance",
                },
                {
                  label: t.memorizationModule,
                  status: t.availableNow,
                  icon: BookOpenCheck,
                  path: "/memorization",
                },
                ...(canViewMembers
                  ? [
                      {
                        label: t.membersModule,
                        status: t.availableNow,
                        icon: Users,
                        path: "/members",
                      },
                    ]
                  : []),
              ].map(module => (
                <button
                  key={module.label}
                  type="button"
                  onClick={() => setLocation(module.path)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-start transition hover:border-[#0B4738]/20 hover:bg-[#0B4738]/5"
                >
                  <span className="flex items-center gap-3">
                    <span className="rounded-lg bg-white p-2 text-[#0B4738]">
                      <module.icon size={18} />
                    </span>
                    <span className="text-sm font-medium text-[#2C3E50]">
                      {module.label}
                    </span>
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-emerald-700">
                    {module.status}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </>
    );
  };

  return (
    <div
      className="flex min-h-screen bg-[#F8F9FA]"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <aside
        className={`hidden ${sidebarOpen ? "w-64" : "w-20"} flex-col shadow-xl transition-all duration-300 md:flex`}
        style={{ backgroundColor: "#0B4738" }}
      >
        <SidebarContent showLabels={sidebarOpen} />
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="absolute bottom-0 right-0 top-0 flex w-72 flex-col shadow-xl"
            style={{ backgroundColor: "#0B4738" }}
          >
            <SidebarContent showLabels />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4 shadow-sm md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileSidebarOpen(!mobileSidebarOpen);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
              aria-label={language === "ar" ? "القائمة" : "Menu"}
            >
              {mobileSidebarOpen ? (
                <X size={22} className="text-gray-600" />
              ) : (
                <Menu size={22} className="text-gray-600" />
              )}
            </button>
            <h2 className="hidden truncate text-lg font-semibold text-[#2C3E50] sm:block">
              {school?.name ?? t.school}
            </h2>
          </div>

          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setLanguage("ar")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                language === "ar"
                  ? "bg-[#0B4738] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              العربية
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                language === "en"
                  ? "bg-[#0B4738] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              English
            </button>
          </div>
        </header>

        <main className="flex-1 space-y-6 overflow-auto p-4 md:p-6">
          <section
            className="rounded-xl p-6 text-white shadow-lg"
            style={{ backgroundColor: "#0B4738" }}
          >
            <h1 className="mb-2 text-2xl font-bold text-white md:text-3xl">
              {t.welcome}
            </h1>
            <p className="text-sm text-white/80">
              {school?.name ?? t.school}
              {" · "}
              {language === "ar"
                ? new Date().toLocaleDateString("ar-DZ")
                : new Date().toLocaleDateString("en-GB")}
            </p>
          </section>

          {renderDashboardContent()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
