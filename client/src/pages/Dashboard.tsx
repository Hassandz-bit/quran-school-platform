import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Users,
  Calendar,
  BookOpen,
  LogOut,
  Menu,
  X,
  Plus,
  Home,
  GraduationCap,
  Settings,
  DollarSign,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

const Dashboard: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [, setLocation] = useLocation();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    setLocation("/login");
  };

  const content = {
    ar: {
      dashboard: "لوحة التحكم",
      school: "المدرسة القرآنية",
      students: "الطلاب",
      teachers: "المعلمون",
      classes: "الحلقات",
      finance: "المالية",
      settings: "الإعدادات",
      logout: "تسجيل الخروج",
      welcome: "مرحبًا بك في لوحة التحكم",
      totalStudents: "إجمالي الطلاب",
      dailyAttendance: "الحضور اليومي",
      activeClasses: "الحلقات النشطة",
      pendingPayments: "المتأخرات المالية",
      quickActions: "إجراءات سريعة",
      addStudent: "إضافة طالب",
      createClass: "إنشاء حلقة",
      recordPayment: "تسجيل دفعة",
      announcement: "نشر إعلان",
      todayClasses: "حلقات اليوم",
      absentStudents: "الطلاب كثيرو الغياب",
      absences: "غيابات",
    },
    en: {
      dashboard: "Dashboard",
      school: "Quran School",
      students: "Students",
      teachers: "Teachers",
      classes: "Classes",
      finance: "Finance",
      settings: "Settings",
      logout: "Sign Out",
      welcome: "Welcome to Dashboard",
      totalStudents: "Total Students",
      dailyAttendance: "Daily Attendance",
      activeClasses: "Active Classes",
      pendingPayments: "Pending Payments",
      quickActions: "Quick Actions",
      addStudent: "Add Student",
      createClass: "Create Class",
      recordPayment: "Record Payment",
      announcement: "Post Announcement",
      todayClasses: "Today's Classes",
      absentStudents: "Frequent Absentees",
      absences: "absences",
    },
  };

  const t = content[language];

  const menuItems = [
    { label: t.dashboard, icon: Home, path: "/dashboard" },
    { label: t.students, icon: Users, path: "/students" },
    { label: t.teachers, icon: GraduationCap, path: "#" },
    { label: t.classes, icon: BookOpen, path: "#" },
    { label: t.finance, icon: DollarSign, path: "#" },
    { label: t.settings, icon: Settings, path: "#" },
  ];

  const statCards = [
    {
      label: t.totalStudents,
      value: "145",
      icon: Users,
      bgColor: "bg-[#0B4738]/10",
      iconColor: "text-[#0B4738]",
    },
    {
      label: t.dailyAttendance,
      value: "92%",
      icon: Calendar,
      bgColor: "bg-[#0B4738]/10",
      iconColor: "text-[#0B4738]",
    },
    {
      label: t.activeClasses,
      value: "8",
      icon: BookOpen,
      bgColor: "bg-[#C8A26A]/10",
      iconColor: "text-[#C8A26A]",
    },
    {
      label: t.pendingPayments,
      value: "12",
      icon: DollarSign,
      bgColor: "bg-red-50",
      iconColor: "text-red-600",
    },
  ];

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#C8A26A]">
            <span className="text-lg font-bold text-[#0B4738]">ق</span>
          </div>
          {sidebarOpen && (
            <span className="text-white font-semibold text-sm">{t.school}</span>
          )}
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-3 space-y-1">
        {menuItems.map(item => (
          <a
            key={item.label}
            href={item.path}
            onClick={e => {
              e.preventDefault();
              if (item.path !== "#") {
                setLocation(item.path);
                setMobileSidebarOpen(false);
              }
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
              item.path === "/dashboard"
                ? "bg-white/15 text-white"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <item.icon size={20} />
            {sidebarOpen && (
              <span className="text-sm font-medium">{item.label}</span>
            )}
          </a>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-white/70 hover:bg-red-500/20 hover:text-white transition-all duration-200"
        >
          <LogOut size={20} />
          {sidebarOpen && (
            <span className="text-sm font-medium">{t.logout}</span>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div
      className="min-h-screen bg-[#F8F9FA] flex"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex ${
          sidebarOpen ? "w-64" : "w-20"
        } flex-col transition-all duration-300 shadow-xl`}
        style={{ backgroundColor: "#0B4738" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="absolute top-0 right-0 bottom-0 w-64 flex flex-col shadow-xl"
            style={{ backgroundColor: "#0B4738" }}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileSidebarOpen(!mobileSidebarOpen);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {sidebarOpen ? (
                <X size={22} className="text-gray-600" />
              ) : (
                <Menu size={22} className="text-gray-600" />
              )}
            </button>
            <h2 className="text-lg font-semibold text-[#2C3E50] hidden sm:block">
              {t.dashboard}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
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
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {/* Welcome Section */}
          <div
            className="rounded-xl p-6 text-white shadow-lg"
            style={{ backgroundColor: "#0B4738" }}
          >
            <h1 className="text-2xl md:text-3xl font-bold mb-2 text-white">
              {t.welcome}
            </h1>
            <p className="text-white/80 text-sm">
              {language === "ar"
                ? `اليوم: ${new Date().toLocaleDateString("ar-SA")}`
                : `Today: ${new Date().toLocaleDateString("en-US")}`}
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(stat => (
              <Card
                key={stat.label}
                className="p-5 hover:shadow-md transition-shadow border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold text-[#2C3E50]">
                      {stat.value}
                      {stat.label === t.pendingPayments && (
                        <span className="text-sm font-normal text-gray-500 mr-1">
                          {" "}
                          دج
                        </span>
                      )}
                    </p>
                  </div>
                  <div className={`${stat.bgColor} p-3 rounded-xl`}>
                    <stat.icon className={stat.iconColor} size={22} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-lg font-bold text-[#2C3E50] mb-4">
              {t.quickActions}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Button
                onClick={() => setLocation("/students/new")}
                className="h-auto py-4 flex flex-col gap-2 text-white font-medium rounded-xl transition-all duration-200 hover:shadow-md active:scale-[0.97]"
                style={{ backgroundColor: "#0B4738" }}
              >
                <Plus size={20} />
                <span className="text-xs">{t.addStudent}</span>
              </Button>
              <Button
                className="h-auto py-4 flex flex-col gap-2 font-medium rounded-xl transition-all duration-200 hover:shadow-md active:scale-[0.97] border-2 border-[#0B4738] text-[#0B4738] bg-transparent hover:bg-[#0B4738]/5"
                variant="outline"
              >
                <Plus size={20} />
                <span className="text-xs">{t.createClass}</span>
              </Button>
              <Button
                className="h-auto py-4 flex flex-col gap-2 font-medium rounded-xl transition-all duration-200 hover:shadow-md active:scale-[0.97] border-2 border-[#C8A26A] text-[#C8A26A] bg-transparent hover:bg-[#C8A26A]/5"
                variant="outline"
              >
                <Plus size={20} />
                <span className="text-xs">{t.recordPayment}</span>
              </Button>
              <Button
                className="h-auto py-4 flex flex-col gap-2 font-medium rounded-xl transition-all duration-200 hover:shadow-md active:scale-[0.97] border-2 border-gray-300 text-gray-600 bg-transparent hover:bg-gray-50"
                variant="outline"
              >
                <Plus size={20} />
                <span className="text-xs">{t.announcement}</span>
              </Button>
            </div>
          </div>

          {/* Data Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Classes */}
            <Card className="p-5 border border-gray-100">
              <h3 className="text-base font-bold text-[#2C3E50] mb-4">
                {t.todayClasses}
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-[#0B4738]/5 rounded-lg border border-[#0B4738]/10">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[#2C3E50] text-sm">
                      {language === "ar" ? "حلقة الفجر" : "Fajr Circle"}
                    </p>
                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                      5:30 - 6:30
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-[#C8A26A]/5 rounded-lg border border-[#C8A26A]/10">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[#2C3E50] text-sm">
                      {language === "ar" ? "حلقة العصر" : "Asr Circle"}
                    </p>
                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                      16:00 - 17:00
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-[#0B4738]/5 rounded-lg border border-[#0B4738]/10">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[#2C3E50] text-sm">
                      {language === "ar" ? "حلقة المغرب" : "Maghrib Circle"}
                    </p>
                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                      18:30 - 19:30
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Frequent Absentees */}
            <Card className="p-5 border border-gray-100">
              <h3 className="text-base font-bold text-[#2C3E50] mb-4">
                {t.absentStudents}
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-red-50 rounded-lg border border-red-100 flex items-center justify-between">
                  <p className="font-medium text-[#2C3E50] text-sm">
                    {language === "ar" ? "أحمد محمد" : "Ahmed Mohammed"}
                  </p>
                  <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full font-medium">
                    5 {t.absences}
                  </span>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-100 flex items-center justify-between">
                  <p className="font-medium text-[#2C3E50] text-sm">
                    {language === "ar" ? "فاطمة علي" : "Fatima Ali"}
                  </p>
                  <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full font-medium">
                    3 {t.absences}
                  </span>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-100 flex items-center justify-between">
                  <p className="font-medium text-[#2C3E50] text-sm">
                    {language === "ar" ? "يوسف بن عمر" : "Youssef Ben Omar"}
                  </p>
                  <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full font-medium">
                    2 {t.absences}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
