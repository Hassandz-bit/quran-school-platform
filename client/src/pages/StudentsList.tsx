import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Users,
  BookOpen,
  LogOut,
  Menu,
  X,
  Plus,
  Home,
  GraduationCap,
  Settings,
  DollarSign,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
} from "lucide-react";
import { useLocation } from "wouter";
import { mockStudents } from "@/mock-data/students";
import { useAuth } from "@/contexts/AuthContext";

const StudentsList: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
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
      addStudent: "إضافة طالب",
      search: "البحث عن طالب...",
      allBranches: "جميع الفروع",
      allClasses: "جميع الحلقات",
      allStatuses: "جميع الحالات",
      name: "الاسم",
      email: "البريد الإلكتروني",
      phone: "الهاتف",
      branch: "الفرع",
      class: "الحلقة",
      status: "الحالة",
      memorized: "المحفوظ",
      actions: "الإجراءات",
      view: "عرض",
      edit: "تعديل",
      more: "المزيد",
      noResults: "لا توجد نتائج",
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
      addStudent: "Add Student",
      search: "Search students...",
      allBranches: "All Branches",
      allClasses: "All Classes",
      allStatuses: "All Statuses",
      name: "Name",
      email: "Email",
      phone: "Phone",
      branch: "Branch",
      class: "Class",
      status: "Status",
      memorized: "Memorized",
      actions: "Actions",
      view: "View",
      edit: "Edit",
      more: "More",
      noResults: "No results found",
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      نشط: "bg-[#0B4738]/10 text-[#0B4738] border-[#0B4738]/20",
      موقوف: "bg-red-50 text-red-700 border-red-200",
      منقول: "bg-[#C8A26A]/10 text-[#C8A26A] border-[#C8A26A]/20",
      متخرج: "bg-blue-50 text-blue-700 border-blue-200",
    };
    return styles[status] || "bg-gray-100 text-gray-700 border-gray-200";
  };

  const filteredStudents = mockStudents.filter(student => {
    const matchesSearch =
      student.name.includes(searchQuery) || student.email.includes(searchQuery);
    const matchesBranch =
      filterBranch === "all" || student.branch === filterBranch;
    const matchesClass = filterClass === "all" || student.class === filterClass;
    const matchesStatus =
      filterStatus === "all" || student.status === filterStatus;
    return matchesSearch && matchesBranch && matchesClass && matchesStatus;
  });

  const branches = Array.from(new Set(mockStudents.map(s => s.branch)));
  const classes = Array.from(new Set(mockStudents.map(s => s.class)));
  const statuses = Array.from(new Set(mockStudents.map(s => s.status)));

  const SidebarContent = () => (
    <>
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
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${item.path === "/students" ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
          >
            <item.icon size={20} />
            {sidebarOpen && (
              <span className="text-sm font-medium">{item.label}</span>
            )}
          </a>
        ))}
      </nav>
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
        className={`hidden md:flex ${sidebarOpen ? "w-64" : "w-20"} flex-col transition-all duration-300 shadow-xl`}
        style={{ backgroundColor: "#0B4738" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
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

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.innerWidth < 768)
                  setMobileSidebarOpen(!mobileSidebarOpen);
                else setSidebarOpen(!sidebarOpen);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {mobileSidebarOpen ? (
                <X size={22} className="text-gray-600" />
              ) : (
                <Menu size={22} className="text-gray-600" />
              )}
            </button>
            <h2 className="text-lg font-semibold text-[#2C3E50] hidden sm:block">
              {t.students}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setLanguage("ar")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${language === "ar" ? "bg-[#0B4738] text-white shadow-sm" : "text-gray-600"}`}
              >
                العربية
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${language === "en" ? "bg-[#0B4738] text-white shadow-sm" : "text-gray-600"}`}
              >
                English
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-2xl font-bold text-[#2C3E50]">{t.students}</h1>
            <Button
              onClick={() => setLocation("/students/new")}
              className="flex items-center gap-2 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.97]"
              style={{ backgroundColor: "#0B4738" }}
            >
              <Plus size={18} />
              {t.addStudent}
            </Button>
          </div>

          {/* Filters */}
          <Card className="p-4 border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <Input
                  placeholder={t.search}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pr-10 h-10"
                />
              </div>
              <select
                value={filterBranch}
                onChange={e => setFilterBranch(e.target.value)}
                className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
              >
                <option value="all">{t.allBranches}</option>
                {branches.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
              >
                <option value="all">{t.allClasses}</option>
                {classes.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
              >
                <option value="all">{t.allStatuses}</option>
                {statuses.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {/* Desktop Table */}
          <Card className="hidden md:block border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {t.name}
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {t.phone}
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {t.branch}
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {t.class}
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {t.status}
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {t.memorized}
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {t.actions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map(student => (
                      <tr
                        key={student.id}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#2C3E50] text-sm">
                            {student.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {student.email}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {student.phone}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {student.branch}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {student.class}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(student.status)}`}
                          >
                            {student.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {student.memorized}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1.5 hover:bg-[#0B4738]/10 rounded-lg transition-colors"
                              title={t.view}
                            >
                              <Eye size={16} className="text-[#0B4738]" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-[#C8A26A]/10 rounded-lg transition-colors"
                              title={t.edit}
                            >
                              <Pencil size={16} className="text-[#C8A26A]" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              title={t.more}
                            >
                              <MoreHorizontal
                                size={16}
                                className="text-gray-400"
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        {t.noResults}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredStudents.length > 0 ? (
              filteredStudents.map(student => (
                <Card key={student.id} className="p-4 border border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-[#2C3E50]">
                        {student.name}
                      </p>
                      <p className="text-xs text-gray-500 break-all">
                        {student.email}
                      </p>
                    </div>
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(student.status)}`}
                    >
                      {student.status}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="text-gray-400 text-xs">{t.email}:</span>{" "}
                      <span className="text-gray-700 break-all">
                        {student.email}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="text-gray-400 text-xs">{t.branch}:</span>{" "}
                      {student.branch}
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">{t.class}:</span>{" "}
                      {student.class}
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">{t.phone}:</span>{" "}
                      {student.phone}
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">
                        {t.memorized}:
                      </span>{" "}
                      {student.memorized}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs border-[#0B4738] text-[#0B4738]"
                    >
                      <Eye size={14} className="ml-1" /> {t.view}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs border-[#C8A26A] text-[#C8A26A]"
                    >
                      <Pencil size={14} className="ml-1" /> {t.edit}
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs">
                      <MoreHorizontal size={14} />
                    </Button>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-8 text-center text-gray-500 border border-gray-100">
                {t.noResults}
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default StudentsList;
