import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BookOpen,
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

const Dashboard: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<DashboardErrorKind | null>(null);
  const [, setLocation] = useLocation();
  const { school, signOut } = useAuth();

  const content = {
    ar: {
      dashboard: "لوحة التحكم",
      school: "المدرسة القرآنية",
      students: "الطلاب",
      teachers: "المعلمون",
      classes: "الحلقات",
      finance: "المالية",
      attendance: "الحضور",
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
      recordPayment: "تسجيل دفعة",
      comingSoon: "قريبًا",
      activeClassesSection: "الحلقات النشطة",
      viewAllClasses: "عرض جميع الحلقات",
      noActiveClasses: "لا توجد حلقات نشطة حاليًا.",
      branch: "الفرع",
      schedule: "التوقيت",
      unavailableBranch: "غير متاح",
      modulesInDevelopment: "وحدات قيد التطوير",
      attendanceModule: "الحضور والغياب",
      financeModule: "المالية",
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
      recordPayment: "Record Payment",
      comingSoon: "Coming soon",
      activeClassesSection: "Active Classes",
      viewAllClasses: "View all classes",
      noActiveClasses: "There are no active classes yet.",
      branch: "Branch",
      schedule: "Schedule",
      unavailableBranch: "Unavailable",
      modulesInDevelopment: "Modules in Development",
      attendanceModule: "Attendance and Absence",
      financeModule: "Finance",
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
      label: t.finance,
      icon: DollarSign,
      path: "/finance",
    },
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
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center bg-[#C8A26A]">
            <span className="text-lg font-bold text-[#0B4738]">ق</span>
          </div>
          {showLabels && (
            <span className="text-white font-semibold text-sm line-clamp-2">
              {school?.name ?? t.school}
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
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

      <div className="p-3 border-t border-white/10">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-white/70 hover:bg-red-500/20 hover:text-white transition-all duration-200"
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
        <Card className="p-10 text-center text-gray-500 border border-gray-100">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
          <p role="status">{t.loading}</p>
        </Card>
      );
    }

    if (loadError || !dashboardData) {
      return (
        <Card className="p-10 text-center border border-red-100" role="alert">
          <p className="text-red-700 mb-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(stat => (
            <Card
              key={stat.label}
              className="p-5 hover:shadow-md transition-shadow border border-gray-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-gray-500 text-sm mb-1">{stat.label}</p>
                  <p className="text-xl font-bold text-[#2C3E50] break-words">
                    {stat.value}
                  </p>
                  {stat.description && (
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      {stat.description}
                    </p>
                  )}
                </div>
                <div className={`${stat.bgColor} shrink-0 p-3 rounded-xl`}>
                  <stat.icon className={stat.iconColor} size={22} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <section>
          <h2 className="text-lg font-bold text-[#2C3E50] mb-4">
            {t.quickActions}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              type="button"
              onClick={() => setLocation("/students/new")}
              className="h-auto py-4 flex flex-col gap-2 text-white font-medium rounded-xl transition-all duration-200 hover:shadow-md active:scale-[0.97]"
              style={{ backgroundColor: "#0B4738" }}
            >
              <Plus size={20} />
              <span className="text-xs">{t.addStudent}</span>
            </Button>
            <Button
              type="button"
              onClick={() => setLocation("/classes/new")}
              className="h-auto py-4 flex flex-col gap-2 font-medium rounded-xl transition-all duration-200 hover:shadow-md active:scale-[0.97] border-2 border-[#0B4738] text-[#0B4738] bg-transparent hover:bg-[#0B4738]/5"
              variant="outline"
            >
              <Plus size={20} />
              <span className="text-xs">{t.createClass}</span>
            </Button>
            <Button
              type="button"
              onClick={() => setLocation("/teachers/new")}
              className="h-auto py-4 flex flex-col gap-2 font-medium rounded-xl transition-all duration-200 hover:shadow-md active:scale-[0.97] border-2 border-[#C8A26A] text-[#9A7137] bg-transparent hover:bg-[#C8A26A]/5"
              variant="outline"
            >
              <GraduationCap size={20} />
              <span className="text-xs">{t.addTeacher}</span>
            </Button>
            <Button
              type="button"
              disabled
              className="h-auto cursor-not-allowed py-4 flex flex-col gap-1 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-400 opacity-100"
              variant="outline"
            >
              <DollarSign size={20} />
              <span className="text-xs">{t.recordPayment}</span>
              <span className="text-[10px]">{t.comingSoon}</span>
            </Button>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5 border border-gray-100">
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

          <Card className="p-5 border border-gray-100">
            <h2 className="text-base font-bold text-[#2C3E50] mb-4">
              {t.modulesInDevelopment}
            </h2>
            <div className="space-y-3">
              {[
                { label: t.attendanceModule, status: t.comingSoon, icon: Calendar },
              ].map(module => (
                <div
                  key={module.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-white p-2 text-[#0B4738]">
                      <module.icon size={18} />
                    </div>
                    <span className="text-sm font-medium text-[#2C3E50]">
                      {module.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-500">
                    {module.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </>
    );
  };

  return (
    <div
      className="min-h-screen bg-[#F8F9FA] flex"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <aside
        className={`hidden md:flex ${
          sidebarOpen ? "w-64" : "w-20"
        } flex-col transition-all duration-300 shadow-xl`}
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
            className="absolute top-0 right-0 bottom-0 w-72 flex flex-col shadow-xl"
            style={{ backgroundColor: "#0B4738" }}
          >
            <SidebarContent showLabels />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileSidebarOpen(!mobileSidebarOpen);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label={language === "ar" ? "القائمة" : "Menu"}
            >
              {mobileSidebarOpen ? (
                <X size={22} className="text-gray-600" />
              ) : (
                <Menu size={22} className="text-gray-600" />
              )}
            </button>
            <h2 className="text-lg font-semibold text-[#2C3E50] hidden sm:block truncate">
              {school?.name ?? t.school}
            </h2>
          </div>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setLanguage("ar")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
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
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                language === "en"
                  ? "bg-[#0B4738] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              English
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <section
            className="rounded-xl p-6 text-white shadow-lg"
            style={{ backgroundColor: "#0B4738" }}
          >
            <h1 className="text-2xl md:text-3xl font-bold mb-2 text-white">
              {t.welcome}
            </h1>
            <p className="text-white/80 text-sm">
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
