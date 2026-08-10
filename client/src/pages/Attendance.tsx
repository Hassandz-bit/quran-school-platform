import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Home,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  ShieldAlert,
  UserCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAttendanceRoster,
  fetchAttendanceScope,
  getAttendanceErrorMessage,
  getTodayInputValue,
  markAllPresent,
  saveAttendance,
  summarizeAttendance,
  updateAttendanceDraft,
  type AttendanceDraftRow,
  type AttendanceScope,
  type AttendanceStatus,
} from "@/lib/attendance";
import { dispatchGuardianAttendanceNotifications } from "@/lib/guardian-notification-dispatch";

const statusOptions: Array<{
  value: AttendanceStatus;
  label: string;
  shortLabel: string;
  activeClass: string;
}> = [
  {
    value: "present",
    label: "حاضر",
    shortLabel: "حاضر",
    activeClass: "border-emerald-600 bg-emerald-600 text-white",
  },
  {
    value: "absent",
    label: "غائب",
    shortLabel: "غائب",
    activeClass: "border-red-600 bg-red-600 text-white",
  },
  {
    value: "late",
    label: "متأخر",
    shortLabel: "متأخر",
    activeClass: "border-amber-500 bg-amber-500 text-white",
  },
  {
    value: "excused_absence",
    label: "غياب مبرر",
    shortLabel: "مبرر",
    activeClass: "border-blue-600 bg-blue-600 text-white",
  },
];

const statusLabels: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused_absence: "غياب مبرر",
};

function StateCard({
  title,
  description,
  kind = "neutral",
  action,
}: {
  title: string;
  description: string;
  kind?: "neutral" | "error" | "forbidden";
  action?: React.ReactNode;
}) {
  const Icon = kind === "forbidden" ? ShieldAlert : Users;
  const color =
    kind === "error"
      ? "border-red-200 text-red-700"
      : kind === "forbidden"
        ? "border-amber-200 text-amber-800"
        : "border-gray-200 text-gray-600";

  return (
    <Card
      className={`border p-8 text-center shadow-sm ${color}`}
      role={kind === "error" || kind === "forbidden" ? "alert" : "status"}
    >
      <Icon className="mx-auto mb-3" size={30} aria-hidden="true" />
      <h2 className="text-lg font-bold text-[#2C3E50]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-7">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <Card
      className="flex items-center justify-center gap-3 border border-gray-100 p-10 text-gray-600"
      role="status"
    >
      <Loader2 className="animate-spin text-[#0B4738]" size={24} />
      <span className="text-sm font-medium">{label}</span>
    </Card>
  );
}

export default function Attendance() {
  const { school, isSchoolAdmin, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [scope, setScope] = useState<AttendanceScope | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [classId, setClassId] = useState("");
  const [sessionDate, setSessionDate] = useState(getTodayInputValue);
  const [rows, setRows] = useState<AttendanceDraftRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterReload, setRosterReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const loadScope = useCallback(async () => {
    if (!school?.id) return;

    setScopeLoading(true);
    setScopeError(null);
    setScope(null);

    try {
      const nextScope = await fetchAttendanceScope(school.id);
      setScope(nextScope);

      const firstClass = nextScope.classes[0];
      const firstBranchId =
        firstClass?.branchId ?? nextScope.branches[0]?.id ?? "";
      const firstClassId =
        nextScope.classes.find(item => item.branchId === firstBranchId)?.id ??
        "";

      setBranchId(firstBranchId);
      setClassId(firstClassId);
    } catch (error) {
      setScopeError(getAttendanceErrorMessage(error));
    } finally {
      setScopeLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void loadScope();
  }, [loadScope]);

  const availableClasses = useMemo(
    () => scope?.classes.filter(item => item.branchId === branchId) ?? [],
    [branchId, scope?.classes]
  );
  const selectedClass = useMemo(
    () => scope?.classes.find(item => item.id === classId) ?? null,
    [classId, scope?.classes]
  );

  useEffect(() => {
    if (!school?.id || !branchId || !classId || !sessionDate) {
      setRows([]);
      setSessionId(null);
      setRosterError(null);
      setRosterLoading(false);
      return;
    }

    let active = true;
    setRosterLoading(true);
    setRosterError(null);
    setSaveSuccess(null);
    setRows([]);
    setSessionId(null);
    setDirty(false);

    void fetchAttendanceRoster(
      school.id,
      branchId,
      classId,
      sessionDate
    )
      .then(roster => {
        if (!active) return;
        setRows(roster.rows);
        setSessionId(roster.sessionId);
      })
      .catch(error => {
        if (!active) return;
        setRosterError(getAttendanceErrorMessage(error));
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branchId, classId, rosterReload, school?.id, sessionDate]);

  const summary = useMemo(() => summarizeAttendance(rows), [rows]);
  const allStudentsHaveStatus =
    rows.length > 0 && rows.every(row => row.status !== null);
  const canManageSelectedClass = selectedClass?.canManage === true;

  const handleBranchChange = (nextBranchId: string) => {
    setBranchId(nextBranchId);
    setClassId(
      scope?.classes.find(item => item.branchId === nextBranchId)?.id ?? ""
    );
  };

  const handleStatusChange = (
    studentId: string,
    status: AttendanceStatus
  ) => {
    if (!canManageSelectedClass) return;
    setRows(current => updateAttendanceDraft(current, studentId, { status }));
    setDirty(true);
    setSaveSuccess(null);
  };

  const handleMarkAllPresent = () => {
    if (!canManageSelectedClass) return;
    setRows(current => markAllPresent(current));
    setDirty(true);
    setSaveSuccess(null);
  };

  const handleSave = async () => {
    if (
      !school?.id ||
      !canManageSelectedClass ||
      !branchId ||
      !classId ||
      !allStudentsHaveStatus ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setSaveSuccess(null);
    setRosterError(null);

    try {
      const result = await saveAttendance({
        schoolId: school.id,
        branchId,
        classId,
        sessionDate,
        rows,
      });
      setSessionId(result.sessionId);
      setDirty(false);
      const message = `تم حفظ حضور ${result.savedCount} طالب بنجاح.`;
      setSaveSuccess(message);
      toast.success(message);

      // Attendance is already committed at this point. Dispatching guardian
      // notifications is deliberately best-effort so Push/provider outages can
      // never turn a successful attendance save into an attendance failure.
      void dispatchGuardianAttendanceNotifications({
        schoolId: school.id,
        branchId,
        classId,
        sessionId: result.sessionId,
      });
    } catch (error) {
      const message = getAttendanceErrorMessage(error);
      setRosterError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error("تعذر تسجيل الخروج حاليًا.");
      return;
    }
    setLocation("/login");
  };

  if (scopeLoading) {
    return (
      <main
        className="min-h-screen bg-[#F8F9FA] p-4 md:p-8"
        dir="rtl"
      >
        <div className="mx-auto max-w-5xl">
          <LoadingCard label="جارٍ تحميل نطاق الحضور..." />
        </div>
      </main>
    );
  }

  if (scopeError || !scope) {
    return (
      <main
        className="min-h-screen bg-[#F8F9FA] p-4 md:p-8"
        dir="rtl"
      >
        <div className="mx-auto max-w-5xl">
          <StateCard
            kind="error"
            title="تعذر تحميل الحضور"
            description={
              scopeError ?? "تعذر التحقق من صلاحيات الحضور حاليًا."
            }
            action={
              <Button type="button" onClick={() => void loadScope()}>
                <RefreshCw size={16} />
                إعادة المحاولة
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  if (!scope.canView) {
    return (
      <main
        className="min-h-screen bg-[#F8F9FA] p-4 md:p-8"
        dir="rtl"
      >
        <div className="mx-auto max-w-5xl">
          <StateCard
            kind="forbidden"
            title="لا توجد صلاحية لعرض الحضور"
            description="يجب أن يملك حسابك attendance.view أو attendance.manage ضمن المدرسة أو الفرع."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F9FA] pb-28" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B4738] text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="text-xs text-white/65">{school?.name}</p>
            <h1 className="truncate text-lg font-bold">الحضور اليومي</h1>
          </div>
          <div className="flex items-center gap-2">
            {isSchoolAdmin && (
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() => setLocation("/dashboard")}
                aria-label="العودة إلى لوحة التحكم"
              >
                <Home size={18} />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => void handleSignOut()}
              aria-label="تسجيل الخروج"
            >
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-5 md:px-6">
        <Card className="border border-gray-100 p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#2C3E50]">
                <CalendarDays size={16} className="text-[#0B4738]" />
                التاريخ
              </span>
              <Input
                type="date"
                value={sessionDate}
                onChange={event => setSessionDate(event.target.value)}
                className="h-11"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#2C3E50]">
                الفرع
              </span>
              <select
                value={branchId}
                onChange={event => handleBranchChange(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/15"
              >
                {scope.branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                    {branch.isMain ? " — الرئيسي" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#2C3E50]">
                الحلقة
              </span>
              <select
                value={classId}
                onChange={event => setClassId(event.target.value)}
                disabled={availableClasses.length === 0}
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/15 disabled:bg-gray-100"
              >
                {availableClasses.length === 0 && (
                  <option value="">لا توجد حلقات ضمن هذا الفرع</option>
                )}
                {availableClasses.map(attendanceClass => (
                  <option key={attendanceClass.id} value={attendanceClass.id}>
                    {attendanceClass.name}
                    {attendanceClass.scheduleLabel
                      ? ` — ${attendanceClass.scheduleLabel}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        {scope.branches.length === 0 ? (
          <StateCard
            title="لا توجد فروع متاحة"
            description="لا توجد فروع نشطة ضمن نطاق صلاحية الحضور لهذا الحساب."
          />
        ) : availableClasses.length === 0 ? (
          <StateCard
            title="لا توجد حلقات متاحة"
            description="لا توجد حلقات نشطة ومصرح بها في الفرع المحدد. المعلم لا يرى إلا حلقاته المعيّنة."
          />
        ) : (
          <>
            {!canManageSelectedClass && (
              <div
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800"
                role="status"
              >
                وضع العرض فقط: يمكنك مشاهدة السجل والملخص، ولا تُرسل الصفحة
                أي عملية إنشاء أو تعديل.
              </div>
            )}

            <section
              aria-label="ملخص الحضور"
              className="grid grid-cols-2 gap-3 md:grid-cols-4"
            >
              {[
                {
                  label: "الحاضرون",
                  value: summary.present,
                  icon: UserCheck,
                  className: "text-emerald-700 bg-emerald-50",
                },
                {
                  label: "الغائبون",
                  value: summary.absent,
                  icon: UserRoundX,
                  className: "text-red-700 bg-red-50",
                },
                {
                  label: "المتأخرون",
                  value: summary.late,
                  icon: Clock3,
                  className: "text-amber-700 bg-amber-50",
                },
                {
                  label: "غياب مبرر",
                  value: summary.excused_absence,
                  icon: CheckCircle2,
                  className: "text-blue-700 bg-blue-50",
                },
              ].map(item => (
                <Card
                  key={item.label}
                  className="border border-gray-100 p-3 shadow-sm"
                >
                  <div
                    className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${item.className}`}
                  >
                    <item.icon size={18} />
                  </div>
                  <p className="text-2xl font-bold text-[#2C3E50]">
                    {item.value}
                  </p>
                  <p className="text-xs text-gray-500">{item.label}</p>
                </Card>
              ))}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#2C3E50]">
                  سجل الطلاب
                  {rows.length > 0 && (
                    <span className="mr-2 text-sm font-normal text-gray-500">
                      ({rows.length})
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {sessionId
                    ? "تم تحميل جلسة مسجلة لهذا التاريخ."
                    : "لا توجد جلسة سابقة؛ ستُنشأ عند أول حفظ."}
                </p>
              </div>
              {canManageSelectedClass && rows.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleMarkAllPresent}
                  className="border-[#0B4738] text-[#0B4738] hover:bg-[#0B4738]/5"
                >
                  <Check size={17} />
                  تعيين الجميع حاضرًا
                </Button>
              )}
            </div>

            {rosterError && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                <span>{rosterError}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRosterError(null);
                    setRosterReload(current => current + 1);
                  }}
                >
                  <RefreshCw size={15} />
                  إعادة التحميل
                </Button>
              </div>
            )}

            {saveSuccess && (
              <div
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
                role="status"
              >
                <CheckCircle2 size={18} />
                {saveSuccess}
              </div>
            )}

            {rosterLoading ? (
              <LoadingCard label="جارٍ تحميل طلاب الحلقة وسجل الحضور..." />
            ) : rows.length === 0 && !rosterError ? (
              <StateCard
                title="لا يوجد طلاب في الحلقة"
                description="لا يوجد طلاب نشطون مسجلون في الحلقة المحددة حاليًا."
              />
            ) : (
              <section className="space-y-3" aria-label="طلاب الحلقة">
                {rows.map((row, index) => (
                  <Card
                    key={row.id}
                    className="border border-gray-100 p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B4738]/10 text-sm font-bold text-[#0B4738]">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-[#2C3E50]">
                            {row.fullName}
                          </h3>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {row.status
                              ? statusLabels[row.status]
                              : "لم تُحدّد الحالة"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {canManageSelectedClass ? (
                      <>
                        <div
                          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                          role="group"
                          aria-label={`حالة ${row.fullName}`}
                        >
                          {statusOptions.map(option => {
                            const selected = row.status === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() =>
                                  handleStatusChange(row.id, option.value)
                                }
                                className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-bold transition active:scale-[0.98] ${
                                  selected
                                    ? option.activeClass
                                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                                }`}
                              >
                                {option.shortLabel}
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-[11rem_1fr]">
                          {row.status === "late" && (
                            <label className="space-y-1.5">
                              <span className="text-xs font-semibold text-gray-600">
                                وقت الوصول
                              </span>
                              <Input
                                type="time"
                                value={row.arrivalTime}
                                onChange={event => {
                                  setRows(current =>
                                    updateAttendanceDraft(current, row.id, {
                                      arrivalTime: event.target.value,
                                    })
                                  );
                                  setDirty(true);
                                  setSaveSuccess(null);
                                }}
                              />
                            </label>
                          )}
                          <label
                            className={`space-y-1.5 ${
                              row.status === "late" ? "" : "sm:col-span-2"
                            }`}
                          >
                            <span className="text-xs font-semibold text-gray-600">
                              ملاحظة قصيرة
                            </span>
                            <Textarea
                              value={row.note}
                              maxLength={500}
                              rows={2}
                              placeholder="اختياري"
                              onChange={event => {
                                setRows(current =>
                                  updateAttendanceDraft(current, row.id, {
                                    note: event.target.value,
                                  })
                                );
                                setDirty(true);
                                setSaveSuccess(null);
                              }}
                              className="min-h-16 resize-none"
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                        <p>
                          الحالة:{" "}
                          <strong>
                            {row.status
                              ? statusLabels[row.status]
                              : "غير مسجلة"}
                          </strong>
                          {row.status === "late" && row.arrivalTime
                            ? ` — الوصول ${row.arrivalTime}`
                            : ""}
                        </p>
                        {row.note && (
                          <p className="mt-1 text-xs leading-6 text-gray-500">
                            {row.note}
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      {canManageSelectedClass && rows.length > 0 && !rosterLoading && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0 text-xs text-gray-500">
              {!allStudentsHaveStatus
                ? "حدّد حالة جميع الطلاب قبل الحفظ."
                : dirty
                  ? "توجد تغييرات غير محفوظة."
                  : "السجل محفوظ."}
            </div>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!allStudentsHaveStatus || !dirty || saving}
              className="h-11 min-w-36 bg-[#0B4738] text-white hover:bg-[#08382D]"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Save size={18} />
              )}
              {saving
                ? "جارٍ الحفظ..."
                : sessionId
                  ? "حفظ التعديلات"
                  : "إنشاء وحفظ"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
