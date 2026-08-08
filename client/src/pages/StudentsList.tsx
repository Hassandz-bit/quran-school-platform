import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Users,
  Plus,
  Search,
  RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchBranches,
  fetchClasses,
  fetchStudents,
  translateStudentStatus,
  type BranchOption,
  type ClassOption,
  type StudentRow,
  type StudentStatus,
} from "@/lib/students";
import { toast } from "sonner";

const statusOptions: StudentStatus[] = [
  "active",
  "suspended",
  "transferred",
  "graduated",
  "withdrawn",
];

const StudentsList: React.FC = () => {
  const language = "ar" as const;
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [, setLocation] = useLocation();
  const { school } = useAuth();

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
      comingSoon: "قريبًا",
      addStudent: "إضافة طالب",
      search: "البحث بالاسم أو الهاتف أو البريد...",
      allBranches: "جميع الفروع",
      allClasses: "جميع الحلقات",
      allStatuses: "جميع الحالات",
      name: "الاسم الكامل",
      email: "البريد الإلكتروني",
      phone: "الهاتف",
      branch: "الفرع",
      class: "الحلقة",
      status: "الحالة",
      registrationDate: "تاريخ التسجيل",
      noClass: "غير محددة",
      unavailable: "غير متاح",
      noValue: "—",
      loading: "جارٍ تحميل قائمة الطلاب...",
      loadError: "تعذر تحميل قائمة الطلاب حاليًا.",
      retry: "إعادة المحاولة",
      empty: "لم تتم إضافة أي طالب بعد.",
      noResults: "لا توجد نتائج مطابقة.",
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
      comingSoon: "Coming soon",
      addStudent: "Add Student",
      search: "Search by name, phone, or email...",
      allBranches: "All Branches",
      allClasses: "All Classes",
      allStatuses: "All Statuses",
      name: "Full name",
      email: "Email",
      phone: "Phone",
      branch: "Branch",
      class: "Class",
      status: "Status",
      registrationDate: "Registration date",
      noClass: "Not assigned",
      unavailable: "Unavailable",
      noValue: "—",
      loading: "Loading students...",
      loadError: "Students could not be loaded right now.",
      retry: "Try again",
      empty: "No students have been added yet.",
      noResults: "No matching results.",
    },
  };

  const t = content[language];

  const loadStudents = useCallback(async () => {
    if (!school?.id) {
      setIsLoading(false);
      setHasLoadError(true);
      return;
    }

    setIsLoading(true);
    setHasLoadError(false);

    try {
      const [studentRows, branchRows, classRows] = await Promise.all([
        fetchStudents(school.id),
        fetchBranches(school.id, { activeOnly: false }),
        fetchClasses(school.id, undefined, { activeOnly: false }),
      ]);

      setStudents(studentRows);
      setBranches(branchRows);
      setClasses(classRows);
    } catch {
      setHasLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const branchNames = useMemo(
    () => new Map(branches.map(branch => [branch.id, branch.name])),
    [branches]
  );
  const classNames = useMemo(
    () => new Map(classes.map(classItem => [classItem.id, classItem.name])),
    [classes]
  );

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    return students.filter(student => {
      const searchable = [
        student.first_name,
        student.last_name,
        student.phone ?? "",
        student.email ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase();
      const matchesSearch = query === "" || searchable.includes(query);
      const matchesBranch =
        filterBranch === "all" || student.branch_id === filterBranch;
      const matchesClass =
        filterClass === "all" || student.class_id === filterClass;
      const matchesStatus =
        filterStatus === "all" || student.status === filterStatus;

      return matchesSearch && matchesBranch && matchesClass && matchesStatus;
    });
  }, [filterBranch, filterClass, filterStatus, searchQuery, students]);

  const getStatusBadge = (status: StudentStatus) => {
    const styles: Record<StudentStatus, string> = {
      active: "bg-[#0B4738]/10 text-[#0B4738] border-[#0B4738]/20",
      suspended: "bg-red-50 text-red-700 border-red-200",
      transferred: "bg-[#C8A26A]/10 text-[#9A7137] border-[#C8A26A]/20",
      graduated: "bg-blue-50 text-blue-700 border-blue-200",
      withdrawn: "bg-gray-100 text-gray-700 border-gray-200",
    };
    return styles[status];
  };

  const formatDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return t.noValue;
    return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ" : "en-GB").format(
      date
    );
  };

  const renderLoadedContent = () => {
    if (students.length === 0) {
      return (
        <Card className="p-10 text-center text-gray-500 border border-gray-100">
          {t.empty}
        </Card>
      );
    }

    return (
      <>
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
                onChange={event => setSearchQuery(event.target.value)}
                className="pr-10 h-10"
              />
            </div>
            <select
              value={filterBranch}
              onChange={event => setFilterBranch(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
            >
              <option value="all">{t.allBranches}</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <select
              value={filterClass}
              onChange={event => setFilterClass(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
            >
              <option value="all">{t.allClasses}</option>
              {classes.map(classItem => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={event => setFilterStatus(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
            >
              <option value="all">{t.allStatuses}</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {translateStudentStatus(status, language)}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <Card className="hidden md:block border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {[t.name, t.phone, t.email, t.branch, t.class, t.status, t.registrationDate].map(
                    heading => (
                      <th
                        key={heading}
                        className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map(student => (
                    <tr
                      key={student.id}
                      className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-[#2C3E50] text-sm">
                        {student.first_name} {student.last_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {student.phone ?? t.noValue}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 break-all">
                        {student.email ?? t.noValue}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {branchNames.get(student.branch_id) ?? t.unavailable}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {student.class_id
                          ? (classNames.get(student.class_id) ?? t.unavailable)
                          : t.noClass}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(student.status)}`}
                        >
                          {translateStudentStatus(student.status, language)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(student.start_date)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      {t.noResults}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="md:hidden space-y-3">
          {filteredStudents.length > 0 ? (
            filteredStudents.map(student => (
              <Card key={student.id} className="p-4 border border-gray-100">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="font-semibold text-[#2C3E50]">
                    {student.first_name} {student.last_name}
                  </p>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(student.status)}`}
                  >
                    {translateStudentStatus(student.status, language)}
                  </span>
                </div>
                <dl className="grid grid-cols-1 gap-2 text-sm text-gray-600">
                  <div><dt className="inline text-gray-400">{t.phone}: </dt><dd className="inline">{student.phone ?? t.noValue}</dd></div>
                  <div><dt className="inline text-gray-400">{t.email}: </dt><dd className="inline break-all">{student.email ?? t.noValue}</dd></div>
                  <div><dt className="inline text-gray-400">{t.branch}: </dt><dd className="inline">{branchNames.get(student.branch_id) ?? t.unavailable}</dd></div>
                  <div><dt className="inline text-gray-400">{t.class}: </dt><dd className="inline">{student.class_id ? (classNames.get(student.class_id) ?? t.unavailable) : t.noClass}</dd></div>
                  <div><dt className="inline text-gray-400">{t.registrationDate}: </dt><dd className="inline">{formatDate(student.start_date)}</dd></div>
                </dl>
              </Card>
            ))
          ) : (
            <Card className="p-8 text-center text-gray-500 border border-gray-100">
              {t.noResults}
            </Card>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-end">
        <Button
          onClick={() => setLocation("/students/new")}
          className="flex items-center gap-2 rounded-xl bg-[#0B4738] text-white shadow-md transition-all hover:bg-[#08382d] hover:shadow-lg active:scale-[0.97]"
        >
          <Plus size={18} />
          {t.addStudent}
        </Button>
      </div>

          {isLoading ? (
            <Card className="p-10 text-center text-gray-500 border border-gray-100">
              <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
              {t.loading}
            </Card>
          ) : hasLoadError ? (
            <Card className="p-10 text-center border border-red-100">
              <p className="text-red-700 mb-4">{t.loadError}</p>
              <Button variant="outline" onClick={() => void loadStudents()}>
                <RefreshCw size={16} />
                {t.retry}
              </Button>
            </Card>
          ) : (
            renderLoadedContent()
          )}
    </div>
  );
};

export default StudentsList;
