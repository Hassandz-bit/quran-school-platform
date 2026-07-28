import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Clock3,
  FilterX,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchMembersDirectory,
  filterMembers,
  getMembersErrorMessage,
  isMembersPermissionError,
  summarizeMembers,
  type MemberMembershipStatus,
  type MemberRoleAssignment,
  type MembersDirectory,
  type MembersFilters,
  type SchoolMember,
} from "@/lib/members";

const membershipLabels: Record<MemberMembershipStatus, string> = {
  active: "نشط",
  suspended: "معلق",
  pending: "قيد الانتظار",
};

const membershipClasses: Record<MemberMembershipStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  suspended: "border-amber-200 bg-amber-50 text-amber-800",
  pending: "border-sky-200 bg-sky-50 text-sky-700",
};

const defaultFilters: MembersFilters = {
  search: "",
  membershipStatus: "all",
  roleId: "all",
  branchId: "all",
  withoutRolesOnly: false,
};

function formatDate(value: string | null): string {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  return new Intl.DateTimeFormat("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function MemberAvatar({ member }: { member: SchoolMember }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [member.avatarUrl]);
  const initials = member.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("");

  if (member.avatarUrl && !failed) {
    return (
      <img
        src={member.avatarUrl}
        alt={`صورة ${member.fullName}`}
        className="h-12 w-12 shrink-0 rounded-full border border-gray-200 object-cover"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0B4738]/10 text-sm font-bold text-[#0B4738]"
      aria-label={`صورة بديلة لـ${member.fullName}`}
    >
      {initials || "ع"}
    </div>
  );
}

function ProfileBadge({ status }: { status: SchoolMember["profileStatus"] }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {active ? "الملف نشط" : "الملف معطل"}
    </span>
  );
}

function MembershipBadge({ status }: { status: MemberMembershipStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${membershipClasses[status]}`}
    >
      {membershipLabels[status]}
    </span>
  );
}

function RolesList({ roles }: { roles: MemberRoleAssignment[] }) {
  if (roles.length === 0) {
    return (
      <span className="inline-flex rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        لا توجد أدوار مسندة
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {roles.map(role => (
        <span
          key={role.assignmentId}
          className="inline-flex flex-col rounded-lg border border-[#0B4738]/15 bg-[#0B4738]/5 px-3 py-2 text-xs"
        >
          <strong className="font-semibold text-[#2C3E50]">
            {role.roleName}
          </strong>
          <span className="mt-0.5 text-gray-500">{role.scopeLabel}</span>
        </span>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <Card className="border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[#2C3E50]">{value}</p>
        </div>
        <span className="rounded-xl bg-[#0B4738]/10 p-3 text-[#0B4738]">
          <Icon size={20} />
        </span>
      </div>
    </Card>
  );
}

function MemberCard({ member }: { member: SchoolMember }) {
  return (
    <Card className="border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        <MemberAvatar member={member} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-bold text-[#2C3E50]">
              {member.fullName}
            </h2>
            {member.isCurrent && (
              <span className="rounded-full bg-[#C8A26A]/20 px-2 py-0.5 text-xs font-semibold text-[#7A5425]">
                أنت
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <ProfileBadge status={member.profileStatus} />
            <MembershipBadge status={member.membershipStatus} />
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="text-gray-400">تاريخ الانضمام</dt>
          <dd className="mt-1 font-medium text-gray-700">
            {formatDate(member.joinedAt)}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="text-gray-400">إنشاء العضوية</dt>
          <dd className="mt-1 font-medium text-gray-700">
            {formatDate(member.membershipCreatedAt)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-gray-500">الأدوار والنطاق</p>
        <RolesList roles={member.roles} />
      </div>
    </Card>
  );
}

export default function Members() {
  const [, setLocation] = useLocation();
  const { school, profile, isSchoolAdmin } = useAuth();
  const [directory, setDirectory] = useState<MembersDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [filters, setFilters] = useState<MembersFilters>(defaultFilters);

  const loadDirectory = useCallback(async () => {
    if (!school?.id) {
      setLoading(false);
      setError("تعذر تحديد المدرسة الحالية.");
      return;
    }

    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const result = await fetchMembersDirectory({
        schoolId: school.id,
        currentProfileId: profile?.id ?? null,
        isSchoolAdmin,
      });
      setDirectory(result);
    } catch (loadError) {
      setDirectory(null);
      if (isMembersPermissionError(loadError)) setForbidden(true);
      setError(getMembersErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [isSchoolAdmin, profile?.id, school?.id]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const members = directory?.members ?? [];
  const summary = useMemo(() => summarizeMembers(members), [members]);
  const filteredMembers = useMemo(
    () => filterMembers(members, filters),
    [filters, members]
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA]" dir="rtl">
      <header className="border-b border-white/10 bg-[#0B4738] text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs text-white/65">{school?.name}</p>
            <h1 className="text-xl font-bold">أعضاء المدرسة</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => setLocation("/dashboard")}
          >
            <ArrowRight size={16} />
            لوحة التحكم
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 p-4 pb-12 md:p-6">
        <section className="rounded-2xl border border-[#C8A26A]/30 bg-[#C8A26A]/10 p-4 text-sm leading-7 text-[#69491F]">
          إدارة الدعوات والأدوار ستتوفر في مرحلة مستقلة.
        </section>

        {loading ? (
          <Card className="border border-gray-100 p-10 text-center" role="status">
            <RefreshCw className="mx-auto mb-3 animate-spin text-[#0B4738]" />
            <p className="text-sm text-gray-600">جارٍ تحميل أعضاء المدرسة...</p>
          </Card>
        ) : error || forbidden ? (
          <Card className="border border-red-100 p-10 text-center" role="alert">
            <h2 className="text-lg font-bold text-[#2C3E50]">
              {forbidden ? "الوصول غير مسموح" : "تعذر تحميل دليل الأعضاء"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-red-700">{error}</p>
            {!forbidden && (
              <Button
                type="button"
                variant="outline"
                className="mt-5"
                onClick={() => void loadDirectory()}
              >
                <RefreshCw size={16} />
                إعادة المحاولة
              </Button>
            )}
          </Card>
        ) : directory && members.length === 0 ? (
          <Card className="border border-dashed border-gray-200 p-12 text-center">
            <Users className="mx-auto mb-3 text-gray-300" size={36} />
            <h2 className="font-bold text-[#2C3E50]">لا توجد عضويات متاحة</h2>
            <p className="mt-2 text-sm text-gray-500">
              لم تُرجع سياسات المدرسة أي عضوية غير ملغاة للعرض.
            </p>
          </Card>
        ) : directory ? (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard label="إجمالي الأعضاء" value={summary.total} icon={Users} />
              <SummaryCard label="النشطون" value={summary.active} icon={UserCheck} />
              <SummaryCard label="المعلقون" value={summary.suspended} icon={UserX} />
              <SummaryCard label="قيد الانتظار" value={summary.pending} icon={Clock3} />
            </section>

            <Card className="border border-gray-100 p-4 md:p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <label className="xl:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                    البحث بالاسم
                  </span>
                  <span className="relative block">
                    <Search
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <Input
                      value={filters.search}
                      onChange={event =>
                        setFilters(current => ({
                          ...current,
                          search: event.target.value,
                        }))
                      }
                      placeholder="اكتب اسم العضو"
                      className="pr-9"
                    />
                  </span>
                </label>

                <label htmlFor="membership-status-filter">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                    حالة العضوية
                  </span>
                  <select
                    id="membership-status-filter"
                    value={filters.membershipStatus}
                    onChange={event =>
                      setFilters(current => ({
                        ...current,
                        membershipStatus: event.target.value as MembersFilters["membershipStatus"],
                      }))
                    }
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="all">كل الحالات</option>
                    <option value="active">نشط</option>
                    <option value="pending">قيد الانتظار</option>
                    <option value="suspended">معلق</option>
                  </select>
                </label>

                <label htmlFor="role-filter">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                    الدور
                  </span>
                  <select
                    id="role-filter"
                    value={filters.roleId}
                    onChange={event =>
                      setFilters(current => ({
                        ...current,
                        roleId: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="all">كل الأدوار</option>
                    {directory.roleOptions.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label htmlFor="branch-filter">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                    نطاق الفرع
                  </span>
                  <select
                    id="branch-filter"
                    value={filters.branchId}
                    onChange={event =>
                      setFilters(current => ({
                        ...current,
                        branchId: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="all">كل النطاقات</option>
                    <option value="school-wide">المدرسة كاملة</option>
                    {directory.branchOptions.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={filters.withoutRolesOnly}
                    onChange={event =>
                      setFilters(current => ({
                        ...current,
                        withoutRolesOnly: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[#0B4738]"
                  />
                  إظهار الأعضاء دون أدوار فقط
                </label>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-xs text-gray-500">
                    النتائج: {filteredMembers.length} من {members.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 text-xs text-[#0B4738]"
                    onClick={() => setFilters(defaultFilters)}
                  >
                    <FilterX size={15} />
                    مسح الفلاتر
                  </Button>
                </div>
              </div>
            </Card>

            {filteredMembers.length === 0 ? (
              <Card className="border border-dashed border-gray-200 p-10 text-center">
                <Search className="mx-auto mb-3 text-gray-300" />
                <p className="font-semibold text-[#2C3E50]">لا توجد نتائج مطابقة</p>
                <p className="mt-2 text-sm text-gray-500">
                  جرّب تعديل البحث أو حالة العضوية أو الدور أو الفرع.
                </p>
              </Card>
            ) : (
              <>
                <section className="space-y-3 lg:hidden" aria-label="بطاقات أعضاء المدرسة">
                  {filteredMembers.map(member => (
                    <MemberCard key={member.membershipId} member={member} />
                  ))}
                </section>

                <Card className="hidden overflow-hidden border border-gray-100 lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-right text-sm">
                      <thead className="bg-[#0B4738]/5 text-xs text-gray-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">العضو</th>
                          <th className="px-4 py-3 font-semibold">حالة الملف</th>
                          <th className="px-4 py-3 font-semibold">حالة العضوية</th>
                          <th className="px-4 py-3 font-semibold">التواريخ</th>
                          <th className="px-4 py-3 font-semibold">الأدوار والنطاق</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {filteredMembers.map(member => (
                          <tr key={member.membershipId} className="align-top">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <MemberAvatar member={member} />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-[#2C3E50]">
                                      {member.fullName}
                                    </span>
                                    {member.isCurrent && (
                                      <span className="rounded-full bg-[#C8A26A]/20 px-2 py-0.5 text-[11px] font-semibold text-[#7A5425]">
                                        أنت
                                      </span>
                                    )}
                                  </div>
                                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                                    <ShieldCheck size={13} /> عضوية المدرسة
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <ProfileBadge status={member.profileStatus} />
                            </td>
                            <td className="px-4 py-4">
                              <MembershipBadge status={member.membershipStatus} />
                            </td>
                            <td className="px-4 py-4 text-xs text-gray-600">
                              <div>الانضمام: {formatDate(member.joinedAt)}</div>
                              <div className="mt-1">
                                الإنشاء: {formatDate(member.membershipCreatedAt)}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <RolesList roles={member.roles} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        ) : null}

        <footer className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <Building2 size={14} />
          دليل للعرض فقط وفق صلاحيات المدرسة وسياسات RLS الحالية.
        </footer>
      </main>
    </div>
  );
}
