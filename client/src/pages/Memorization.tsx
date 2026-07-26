import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  History,
  Home,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Star,
  UserRound,
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
  MEMORIZATION_SESSION_TYPES,
  QURAN_SURAHS,
  createMemorizationDraft,
  draftFromMemorizationRecord,
  fetchMemorizationAudit,
  fetchMemorizationScope,
  fetchMemorizationWorkspace,
  fetchStudentMemorizationRecords,
  getMemorizationErrorMessage,
  getMemorizationSessionLabel,
  getSurahByNumber,
  getTodayInputValue,
  saveMemorizationRecord,
  type MemorizationAuditEntry,
  type MemorizationDraft,
  type MemorizationRecord,
  type MemorizationScope,
  type MemorizationWorkspace,
} from "@/lib/memorization";

const sessionOptions = MEMORIZATION_SESSION_TYPES.map(value => ({
  value,
  label: getMemorizationSessionLabel(value),
}));

const auditFieldLabels: Record<string, string> = {
  record_date: "التاريخ",
  session_type: "نوع الجلسة",
  surah_number: "السورة",
  ayah_start: "بداية الآيات",
  ayah_end: "نهاية الآيات",
  rating: "التقييم",
  errors_count: "عدد الأخطاء",
  notes: "الملاحظات",
  next_assignment: "الواجب القادم",
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
  action?: ReactNode;
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ar-DZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getChangedLabels(entry: MemorizationAuditEntry): string[] {
  if (entry.operation === "insert" || !entry.oldValues) {
    return ["إنشاء السجل"];
  }

  return Object.keys(entry.newValues).flatMap(key => {
    if (entry.oldValues?.[key] === entry.newValues[key]) return [];
    return [auditFieldLabels[key] ?? key];
  });
}

export default function Memorization() {
  const { school, session, isSchoolAdmin, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [scope, setScope] = useState<MemorizationScope | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [classId, setClassId] = useState("");
  const [recordDate, setRecordDate] = useState(getTodayInputValue);
  const [workspace, setWorkspace] = useState<MemorizationWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [records, setRecords] = useState<MemorizationRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [recordsReload, setRecordsReload] = useState(0);
  const [draft, setDraft] = useState<MemorizationDraft>(() =>
    createMemorizationDraft(getTodayInputValue())
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [auditRecordId, setAuditRecordId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<MemorizationAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadScope = useCallback(async () => {
    if (!school?.id) return;

    setScopeLoading(true);
    setScopeError(null);
    setScope(null);

    try {
      const nextScope = await fetchMemorizationScope(school.id);
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
      setScopeError(getMemorizationErrorMessage(error));
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
  const selectedStudent = useMemo(
    () =>
      workspace?.students.find(student => student.id === selectedStudentId) ??
      null,
    [selectedStudentId, workspace?.students]
  );
  const currentTeacherId = useMemo(
    () =>
      workspace?.teachers.find(
        teacher => teacher.profileId === session?.user.id
      )?.id ?? null,
    [session?.user.id, workspace?.teachers]
  );
  const teacherById = useMemo(
    () => new Map(workspace?.teachers.map(item => [item.id, item.fullName])),
    [workspace?.teachers]
  );
  const selectedSurah = useMemo(
    () => getSurahByNumber(draft.surahNumber),
    [draft.surahNumber]
  );
  const canManageSelectedClass = selectedClass?.canManage === true;
  const teacherLocked = currentTeacherId !== null;

  useEffect(() => {
    if (!school?.id || !branchId || !classId) {
      setWorkspace(null);
      setSelectedStudentId("");
      return;
    }

    let active = true;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    setWorkspace(null);
    setSelectedStudentId("");
    setRecords([]);
    setSaveSuccess(null);
    setAuditRecordId(null);
    setAuditEntries([]);

    void fetchMemorizationWorkspace(school.id, branchId, classId)
      .then(nextWorkspace => {
        if (!active) return;
        setWorkspace(nextWorkspace);
        const firstStudentId = nextWorkspace.students[0]?.id ?? "";
        const linkedTeacherId =
          nextWorkspace.teachers.find(
            teacher => teacher.profileId === session?.user.id
          )?.id ?? null;
        const defaultTeacherId =
          linkedTeacherId ?? nextWorkspace.teachers[0]?.id ?? "";
        setSelectedStudentId(firstStudentId);
        setDraft(createMemorizationDraft(recordDate, defaultTeacherId));
        setDirty(false);
      })
      .catch(error => {
        if (!active) return;
        setWorkspaceError(getMemorizationErrorMessage(error));
      })
      .finally(() => {
        if (active) setWorkspaceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branchId, classId, recordDate, school?.id, session?.user.id]);

  useEffect(() => {
    if (!school?.id || !branchId || !classId || !selectedStudentId) {
      setRecords([]);
      setRecordsLoading(false);
      return;
    }

    let active = true;
    setRecordsLoading(true);
    setRecordsError(null);
    setRecords([]);
    setAuditRecordId(null);
    setAuditEntries([]);

    void fetchStudentMemorizationRecords(
      school.id,
      branchId,
      classId,
      selectedStudentId,
      showAllHistory ? null : recordDate
    )
      .then(nextRecords => {
        if (active) setRecords(nextRecords);
      })
      .catch(error => {
        if (active) setRecordsError(getMemorizationErrorMessage(error));
      })
      .finally(() => {
        if (active) setRecordsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    branchId,
    classId,
    recordDate,
    recordsReload,
    school?.id,
    selectedStudentId,
    showAllHistory,
  ]);

  const handleBranchChange = (nextBranchId: string) => {
    setBranchId(nextBranchId);
    setClassId(
      scope?.classes.find(item => item.branchId === nextBranchId)?.id ?? ""
    );
  };

  const updateDraft = (update: Partial<MemorizationDraft>) => {
    if (!canManageSelectedClass) return;
    setDraft(current => ({ ...current, ...update }));
    setDirty(true);
    setSaveSuccess(null);
  };

  const handleSurahChange = (surahNumber: number) => {
    if (!canManageSelectedClass) return;
    updateDraft({ surahNumber, ayahStart: 1, ayahEnd: 1 });
  };

  const handleNewRecord = () => {
    const defaultTeacherId =
      currentTeacherId ?? workspace?.teachers[0]?.id ?? "";
    setDraft(createMemorizationDraft(recordDate, defaultTeacherId));
    setDirty(false);
    setSaveSuccess(null);
  };

  const handleEditRecord = (record: MemorizationRecord) => {
    if (
      !canManageSelectedClass ||
      (currentTeacherId && record.teacherId !== currentTeacherId)
    ) {
      return;
    }
    setDraft(draftFromMemorizationRecord(record));
    setDirty(false);
    setSaveSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async () => {
    if (
      !school?.id ||
      !canManageSelectedClass ||
      !branchId ||
      !classId ||
      !selectedStudentId ||
      !draft.teacherId ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setSaveSuccess(null);
    setWorkspaceError(null);

    try {
      const result = await saveMemorizationRecord({
        schoolId: school.id,
        branchId,
        classId,
        studentId: selectedStudentId,
        draft,
      });
      const message =
        result.mode === "created"
          ? "تم حفظ متابعة الطالب بنجاح."
          : "تم تحديث سجل المتابعة بنجاح.";
      setSaveSuccess(message);
      toast.success(message);
      setRecordsReload(current => current + 1);
      const defaultTeacherId =
        currentTeacherId ?? workspace?.teachers[0]?.id ?? "";
      setDraft(createMemorizationDraft(recordDate, defaultTeacherId));
      setDirty(false);
    } catch (error) {
      const message = getMemorizationErrorMessage(error);
      setWorkspaceError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAuditToggle = async (recordId: string) => {
    if (!school?.id || !branchId || !classId) return;
    if (auditRecordId === recordId) {
      setAuditRecordId(null);
      setAuditEntries([]);
      setAuditError(null);
      return;
    }

    setAuditRecordId(recordId);
    setAuditEntries([]);
    setAuditError(null);
    setAuditLoading(true);

    try {
      setAuditEntries(
        await fetchMemorizationAudit(
          school.id,
          branchId,
          classId,
          recordId
        )
      );
    } catch (error) {
      setAuditError(getMemorizationErrorMessage(error));
    } finally {
      setAuditLoading(false);
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
      <main className="min-h-screen bg-[#F8F9FA] p-4 md:p-8" dir="rtl">
        <div className="mx-auto max-w-6xl">
          <LoadingCard label="جارٍ تحميل نطاق متابعة الحفظ..." />
        </div>
      </main>
    );
  }

  if (scopeError || !scope) {
    return (
      <main className="min-h-screen bg-[#F8F9FA] p-4 md:p-8" dir="rtl">
        <div className="mx-auto max-w-6xl">
          <StateCard
            kind="error"
            title="تعذر تحميل متابعة الحفظ"
            description={
              scopeError ?? "تعذر التحقق من صلاحيات متابعة الحفظ حاليًا."
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
      <main className="min-h-screen bg-[#F8F9FA] p-4 md:p-8" dir="rtl">
        <div className="mx-auto max-w-6xl">
          <StateCard
            kind="forbidden"
            title="لا توجد صلاحية لعرض متابعة الحفظ"
            description="يجب أن يملك حسابك memorization.view أو memorization.manage ضمن المدرسة أو الفرع أو الحلقة."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F9FA] pb-28" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B4738] text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="text-xs text-white/65">{school?.name}</p>
            <h1 className="truncate text-lg font-bold">
              متابعة الحفظ والمراجعة
            </h1>
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

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 md:px-6">
        <Card className="border border-gray-100 p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList size={20} className="text-[#0B4738]" />
            <div>
              <h2 className="font-bold text-[#2C3E50]">نطاق المتابعة</h2>
              <p className="text-xs text-gray-500">
                اختر التاريخ والفرع والحلقة والطالب ضمن صلاحياتك.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#2C3E50]">
                <CalendarDays size={16} className="text-[#0B4738]" />
                التاريخ
              </span>
              <Input
                type="date"
                value={recordDate}
                onChange={event => {
                  setRecordDate(event.target.value);
                  setDraft(current => ({
                    ...current,
                    recordDate: event.target.value,
                  }));
                  setDirty(current => current || Boolean(draft.recordId));
                }}
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
                {availableClasses.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.scheduleLabel ? ` — ${item.scheduleLabel}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#2C3E50]">
                <UserRound size={16} className="text-[#0B4738]" />
                الطالب
              </span>
              <select
                value={selectedStudentId}
                onChange={event => {
                  setSelectedStudentId(event.target.value);
                  handleNewRecord();
                }}
                disabled={!workspace || workspace.students.length === 0}
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/15 disabled:bg-gray-100"
              >
                {(!workspace || workspace.students.length === 0) && (
                  <option value="">لا يوجد طلاب نشطون</option>
                )}
                {workspace?.students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        {scope.branches.length === 0 ? (
          <StateCard
            title="لا توجد فروع متاحة"
            description="لا توجد فروع نشطة ضمن نطاق صلاحية متابعة الحفظ لهذا الحساب."
          />
        ) : availableClasses.length === 0 ? (
          <StateCard
            title="لا توجد حلقات متاحة"
            description="لا توجد حلقات نشطة ومصرح بها في الفرع المحدد. المعلم لا يرى إلا حلقاته المعيّنة."
          />
        ) : workspaceLoading ? (
          <LoadingCard label="جارٍ تحميل طلاب الحلقة والمعلمين المعيّنين..." />
        ) : workspaceError || !workspace ? (
          <StateCard
            kind="error"
            title="تعذر تحميل بيانات الحلقة"
            description={workspaceError ?? "تعذر تحميل بيانات الحلقة حاليًا."}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => setClassId(current => current)}
              >
                <RefreshCw size={16} />
                إعادة المحاولة
              </Button>
            }
          />
        ) : workspace.students.length === 0 ? (
          <StateCard
            title="لا يوجد طلاب في الحلقة"
            description="لا يوجد طلاب نشطون مسجلون في الحلقة المحددة حاليًا."
          />
        ) : (
          <>
            {!canManageSelectedClass && (
              <div
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800"
                role="status"
              >
                وضع العرض فقط: يمكنك مشاهدة سجلات الطالب وسجل التدقيق، ولا
                تُرسل الصفحة أي عملية إنشاء أو تعديل.
              </div>
            )}

            {canManageSelectedClass && workspace.teachers.length === 0 && (
              <StateCard
                kind="forbidden"
                title="لا يوجد معلم معيّن للحلقة"
                description="يجب تعيين معلم نشط للحلقة قبل تسجيل متابعة الحفظ."
              />
            )}

            {canManageSelectedClass && workspace.teachers.length > 0 && (
              <Card className="border border-gray-100 p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-bold text-[#2C3E50]">
                      <BookOpenCheck size={20} className="text-[#0B4738]" />
                      {draft.recordId ? "تعديل سجل المتابعة" : "تسجيل متابعة جديدة"}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      الطالب: {selectedStudent?.fullName ?? "غير محدد"}
                    </p>
                  </div>
                  {draft.recordId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleNewRecord}
                    >
                      <RotateCcw size={16} />
                      سجل جديد
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      المعلم
                    </span>
                    <select
                      value={currentTeacherId ?? draft.teacherId}
                      disabled={teacherLocked}
                      onChange={event => updateDraft({ teacherId: event.target.value })}
                      className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/15 disabled:bg-gray-100"
                    >
                      {workspace.teachers.map(teacher => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.fullName}
                        </option>
                      ))}
                    </select>
                    {teacherLocked && (
                      <span className="text-xs text-gray-500">
                        تم ربط السجل بحساب المعلم الحالي تلقائيًا.
                      </span>
                    )}
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      نوع الجلسة
                    </span>
                    <select
                      value={draft.sessionType}
                      onChange={event =>
                        updateDraft({
                          sessionType: event.target
                            .value as MemorizationDraft["sessionType"],
                        })
                      }
                      className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/15"
                    >
                      {sessionOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      السورة
                    </span>
                    <select
                      value={draft.surahNumber}
                      onChange={event =>
                        handleSurahChange(Number(event.target.value))
                      }
                      className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/15"
                    >
                      {QURAN_SURAHS.map(surah => (
                        <option key={surah.number} value={surah.number}>
                          {surah.number}. {surah.name} — {surah.ayahCount} آية
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      من الآية
                    </span>
                    <Input
                      type="number"
                      min={1}
                      max={selectedSurah.ayahCount}
                      value={draft.ayahStart}
                      onChange={event =>
                        updateDraft({ ayahStart: Number(event.target.value) })
                      }
                      className="h-11"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      إلى الآية
                    </span>
                    <Input
                      type="number"
                      min={draft.ayahStart}
                      max={selectedSurah.ayahCount}
                      value={draft.ayahEnd}
                      onChange={event =>
                        updateDraft({ ayahEnd: Number(event.target.value) })
                      }
                      className="h-11"
                    />
                    <span className="text-xs text-gray-500">
                      الحد الأعلى لسورة {selectedSurah.name}: {selectedSurah.ayahCount}
                    </span>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      عدد الأخطاء
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.errorsCount}
                      onChange={event =>
                        updateDraft({ errorsCount: Number(event.target.value) })
                      }
                      className="h-11"
                    />
                  </label>
                </div>

                <div className="mt-4 space-y-2">
                  <span className="text-sm font-semibold text-[#2C3E50]">
                    التقييم
                  </span>
                  <div
                    className="grid grid-cols-5 gap-2"
                    role="group"
                    aria-label="تقييم المتابعة"
                  >
                    {[1, 2, 3, 4, 5].map(rating => (
                      <button
                        key={rating}
                        type="button"
                        aria-pressed={draft.rating === rating}
                        onClick={() => updateDraft({ rating })}
                        className={`flex min-h-11 items-center justify-center gap-1 rounded-xl border text-sm font-bold transition active:scale-[0.98] ${
                          draft.rating === rating
                            ? "border-[#C8A26A] bg-[#C8A26A] text-[#0B4738]"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <Star size={15} />
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      الملاحظات
                    </span>
                    <Textarea
                      value={draft.notes}
                      maxLength={1000}
                      rows={3}
                      placeholder="ملاحظات الأداء والتصحيح — اختياري"
                      onChange={event => updateDraft({ notes: event.target.value })}
                      className="resize-none"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      الواجب القادم
                    </span>
                    <Textarea
                      value={draft.nextAssignment}
                      maxLength={1000}
                      rows={3}
                      placeholder="المقدار المطلوب في الحصة القادمة — اختياري"
                      onChange={event =>
                        updateDraft({ nextAssignment: event.target.value })
                      }
                      className="resize-none"
                    />
                  </label>
                </div>
              </Card>
            )}

            {workspaceError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {workspaceError}
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

            <section aria-label="السجل السابق" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-bold text-[#2C3E50]">
                    <History size={19} className="text-[#0B4738]" />
                    سجل الطالب السابق
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {showAllHistory
                      ? "آخر 20 سجلًا عبر جميع التواريخ."
                      : `سجلات تاريخ ${recordDate} فقط.`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAllHistory(current => !current)}
                >
                  {showAllHistory ? "عرض تاريخ اليوم" : "عرض كل السجل السابق"}
                </Button>
              </div>

              {recordsError && (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  <span>{recordsError}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRecordsReload(current => current + 1)}
                  >
                    <RefreshCw size={15} />
                    إعادة التحميل
                  </Button>
                </div>
              )}

              {recordsLoading ? (
                <LoadingCard label="جارٍ تحميل سجل الحفظ والمراجعة..." />
              ) : records.length === 0 && !recordsError ? (
                <StateCard
                  title="لا توجد سجلات متابعة"
                  description={
                    showAllHistory
                      ? "لم يُسجل لهذا الطالب حفظ أو مراجعة أو اختبار حتى الآن."
                      : "لا توجد سجلات لهذا الطالب في التاريخ المحدد."
                  }
                />
              ) : (
                records.map(record => {
                  const surah = getSurahByNumber(record.surahNumber);
                  const canEdit =
                    canManageSelectedClass &&
                    (!currentTeacherId || record.teacherId === currentTeacherId);
                  const auditOpen = auditRecordId === record.id;

                  return (
                    <Card
                      key={record.id}
                      className="border border-gray-100 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#0B4738]/10 px-2.5 py-1 text-xs font-bold text-[#0B4738]">
                              {getMemorizationSessionLabel(record.sessionType)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {record.recordDate}
                            </span>
                          </div>
                          <h3 className="mt-2 font-bold text-[#2C3E50]">
                            سورة {surah.name}: من الآية {record.ayahStart} إلى {record.ayahEnd}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500">
                            المعلم: {teacherById.get(record.teacherId) ?? "معلم الحلقة"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditRecord(record)}
                            >
                              <Pencil size={15} />
                              تعديل
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleAuditToggle(record.id)}
                          >
                            <History size={15} />
                            {auditOpen ? "إخفاء التدقيق" : "سجل التدقيق"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">التقييم</p>
                          <p className="mt-1 font-bold text-[#2C3E50]">
                            {record.rating} / 5
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">الأخطاء</p>
                          <p className="mt-1 font-bold text-[#2C3E50]">
                            {record.errorsCount}
                          </p>
                        </div>
                        <div className="col-span-2 rounded-xl bg-gray-50 p-3 sm:col-span-1">
                          <p className="text-xs text-gray-500">آخر تحديث</p>
                          <p className="mt-1 text-xs font-medium text-[#2C3E50]">
                            {formatDateTime(record.updatedAt)}
                          </p>
                        </div>
                      </div>

                      {(record.notes || record.nextAssignment) && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {record.notes && (
                            <div className="rounded-xl border border-gray-100 p-3 text-sm leading-7 text-gray-700">
                              <strong className="block text-xs text-gray-500">
                                الملاحظات
                              </strong>
                              {record.notes}
                            </div>
                          )}
                          {record.nextAssignment && (
                            <div className="rounded-xl border border-[#C8A26A]/30 bg-[#C8A26A]/5 p-3 text-sm leading-7 text-gray-700">
                              <strong className="block text-xs text-gray-500">
                                الواجب القادم
                              </strong>
                              {record.nextAssignment}
                            </div>
                          )}
                        </div>
                      )}

                      {auditOpen && (
                        <div className="mt-4 border-t border-gray-100 pt-4">
                          <h4 className="mb-3 text-sm font-bold text-[#2C3E50]">
                            سجل التدقيق
                          </h4>
                          {auditLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500" role="status">
                              <Loader2 size={16} className="animate-spin" />
                              جارٍ تحميل سجل التدقيق...
                            </div>
                          ) : auditError ? (
                            <p className="text-sm text-red-700" role="alert">
                              {auditError}
                            </p>
                          ) : auditEntries.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              لا توجد حركات تدقيق متاحة.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {auditEntries.map(entry => (
                                <div
                                  key={entry.id}
                                  className="rounded-xl bg-gray-50 px-3 py-2 text-sm"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <strong className="text-[#2C3E50]">
                                      {entry.operation === "insert"
                                        ? "إنشاء السجل"
                                        : "تعديل السجل"}
                                    </strong>
                                    <span className="text-xs text-gray-500">
                                      {formatDateTime(entry.changedAt)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs leading-6 text-gray-600">
                                    الحقول: {getChangedLabels(entry).join("، ")}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </section>
          </>
        )}
      </div>

      {canManageSelectedClass &&
        workspace &&
        workspace.teachers.length > 0 &&
        selectedStudentId && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="min-w-0 text-xs text-gray-500">
                {dirty
                  ? "توجد تغييرات غير محفوظة."
                  : draft.recordId
                    ? "السجل المحمّل لم يتغير."
                    : "أدخل بيانات المتابعة ثم احفظ."}
              </div>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || !draft.teacherId || saving}
                className="h-11 min-w-40 bg-[#0B4738] text-white hover:bg-[#08382D]"
              >
                {saving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {draft.recordId ? "حفظ التعديل" : "حفظ المتابعة"}
              </Button>
            </div>
          </div>
        )}
    </main>
  );
}
