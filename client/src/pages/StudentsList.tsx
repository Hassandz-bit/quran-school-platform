import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  RefreshCw,
  FileSearch,
  Upload,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
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
import { fetchStudentManagementAccess } from "@/lib/student-import";

const statusOptions: StudentStatus[] = [
  "active",
  "suspended",
  "transferred",
  "graduated",
  "withdrawn",
];

const StudentsList: React.FC = () => {
  const { locale, direction } = useLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [, setLocation] = useLocation();
  const { school } = useAuth();

  const content = {
    ar: {
      addStudent: "إضافة طالب",
      importStudents: "استيراد Excel",
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
      viewProfile: "عرض الملف",
    },
    en: {
      addStudent: "Add Student",
      importStudents: "Import Excel",
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
      viewProfile: "View profile",
    },
  };

  const t = content[locale];

  const loadStudents = useCallback(async () => {
    if (!school?.id) {
      setIsLoading(false);
      setHasLoadError(true);
      return;
    }

    setIsLoading(true);
    setHasLoadError(false);

    try {
      const [studentRows, branchRows, classRows, access] = await Promise.all([
        fetchStudents(school.id),
        fetchBranches(school.id, { activeOnly: false }),
        fetchClasses(school.id, undefined, { activeOnly: false }),
        fetchStudentManagementAccess(school.id),
      ]);

      setStudents(studentRows);
      setBranches(branchRows);
      setClasses(classRows);
      setCanManage(access.canManage);
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
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "en-GB").format(
      date
    );
  };

  const renderLoadedContent = () => {
    if (students.length === 0) {
      return (
        <Card className="border border-gray-100 p-10 text-center text-gray-500">
          {t.empty}
        </Card>
      );
    }

    return (
      <>
        <Card className="border border-gray-100 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search
                className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${direction === "rtl" ? "right-3" : "left-3"}`}
                size={18}
              />
              <Input
                placeholder={t.search}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                className={`h-10 ${direction === "rtl" ? "pr-10" : "pl-10"}`}
              />
            </div>
            <select
              value={filterBranch}
              onChange={event => setFilterBranch(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
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
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
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
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
            >
              <option value="all">{t.allStatuses}</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {translateStudentStatus(status, locale)}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <Card className="hidden overflow-hidden border border-gray-100 md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {[t.name, t.phone, t.email, t.branch, t.class, t.status, t.registrationDate].map(
                    heading => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-start text-xs font-semibold uppercase text-gray-500"
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
                      className="border-b border-gray-100 transition-colors hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={() => setLocation(`/students/${student.id}`)}
                          className="font-medium text-[#17663B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                        >
                          {student.first_name} {student.last_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {student.phone ?? t.noValue}
                      </td>
                      <td className="break-all px-4 py-3 text-sm text-gray-600">
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
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadge(student.status)}`}
                        >
                          {translateStudentStatus(student.status, locale)}
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

        <div className="space-y-3 md:hidden">
          {filteredStudents.length > 0 ? (
            filteredStudents.map(student => (
              <Card key={student.id} className="border border-gray-100 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setLocation(`/students/${student.id}`)}
                    className="min-h-11 text-start font-semibold text-[#17663B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                  >
                    {student.first_name} {student.last_name}
                  </button>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadge(student.status)}`}
                  >
                    {translateStudentStatus(student.status, locale)}
                  </span>
                </div>
                <dl className="grid grid-cols-1 gap-2 text-sm text-gray-600">
                  <div><dt className="inline text-gray-400">{t.phone}: </dt><dd className="inline">{student.phone ?? t.noValue}</dd></div>
                  <div><dt className="inline text-gray-400">{t.email}: </dt><dd className="inline break-all">{student.email ?? t.noValue}</dd></div>
                  <div><dt className="inline text-gray-400">{t.branch}: </dt><dd className="inline">{branchNames.get(student.branch_id) ?? t.unavailable}</dd></div>
                  <div><dt className="inline text-gray-400">{t.class}: </dt><dd className="inline">{student.class_id ? (classNames.get(student.class_id) ?? t.unavailable) : t.noClass}</dd></div>
                  <div><dt className="inline text-gray-400">{t.registrationDate}: </dt><dd className="inline">{formatDate(student.start_date)}</dd></div>
                </dl>
                <button
                  type="button"
                  onClick={() => setLocation(`/students/${student.id}`)}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#17663B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                >
                  <FileSearch className="size-4" />
                  {t.viewProfile}
                </button>
              </Card>
            ))
          ) : (
            <Card className="border border-gray-100 p-8 text-center text-gray-500">
              {t.noResults}
            </Card>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6" dir={direction}>
      {canManage && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setLocation("/students/import")}
            className="flex items-center gap-2 rounded-xl border-[#0B4738]/30 text-[#0B4738]"
          >
            <Upload size={18} />
            {t.importStudents}
          </Button>
          <Button
            onClick={() => setLocation("/students/new")}
            className="flex items-center gap-2 rounded-xl bg-[#0B4738] text-white shadow-md transition-all hover:bg-[#08382d] hover:shadow-lg active:scale-[0.97]"
          >
            <Plus size={18} />
            {t.addStudent}
          </Button>
        </div>
      )}

      {isLoading ? (
        <Card className="border border-gray-100 p-10 text-center text-gray-500">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
          {t.loading}
        </Card>
      ) : hasLoadError ? (
        <Card className="border border-red-100 p-10 text-center">
          <p className="mb-4 text-red-700">{t.loadError}</p>
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
