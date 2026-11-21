import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, ClipboardList, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import StaffPayrollNavigation from "@/components/StaffPayrollNavigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { fetchPayrollScopes, type PayrollScope } from "@/lib/payroll";
import {
  fetchStaffAttendanceCandidates,
  fetchStaffAttendanceRecords,
  saveStaffAttendance,
  updateStaffAttendance,
  type StaffAttendanceCandidate,
  type StaffAttendanceRecord,
} from "@/lib/staff-attendance";

type UnitKind = StaffAttendanceRecord["unitKind"];
type AttendanceStatus = StaffAttendanceRecord["status"];
const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};
const monthStart = () => today().slice(0, 7) + "-01";
const statusLabels: Record<AttendanceStatus, string> = {
  present: "حاضر",
  late: "متأخر",
  partial: "حضور جزئي",
  absent: "غائب",
  excused: "غياب مبرر",
  leave: "إجازة",
};
const unitLabels: Record<UnitKind, string> = {
  session: "حصة",
  day: "يوم",
  hour: "ساعة",
  task: "مهمة",
};

export default function StaffAttendance() {
  const { school } = useAuth();
  const { direction } = useLocale();
  const [scopes, setScopes] = useState<PayrollScope[]>([]);
  const [scopeKey, setScopeKey] = useState("");
  const [candidates, setCandidates] = useState<StaffAttendanceCandidate[]>([]);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [candidateKey, setCandidateKey] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [unitKind, setUnitKind] = useState<UnitKind>("day");
  const [units, setUnits] = useState("1");
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [sessionLabel, setSessionLabel] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedScope = useMemo(
    () => scopes.find(scope => (scope.branchId ?? "school") === scopeKey) ?? null,
    [scopeKey, scopes]
  );
  const selectedCandidate = useMemo(() => {
    return candidates.find(candidate =>
      `${candidate.payeeKind}:${candidate.teacherId ?? candidate.employeeId}` === candidateKey
    ) ?? null;
  }, [candidateKey, candidates]);

  const load = useCallback(async () => {
    if (!school?.id || !selectedScope) return;
    setLoading(true);
    try {
      const [nextCandidates, nextRecords] = await Promise.all([
        fetchStaffAttendanceCandidates(school.id, selectedScope.branchId),
        fetchStaffAttendanceRecords(school.id, selectedScope.branchId, monthStart(), today()),
      ]);
      setCandidates(nextCandidates);
      setRecords(nextRecords);
      setCandidateKey(current => nextCandidates.some(candidate =>
        `${candidate.payeeKind}:${candidate.teacherId ?? candidate.employeeId}` === current
      ) ? current : (nextCandidates[0]
        ? `${nextCandidates[0].payeeKind}:${nextCandidates[0].teacherId ?? nextCandidates[0].employeeId}`
        : ""));
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل سجلات الحضور الوظيفي.");
    } finally {
      setLoading(false);
    }
  }, [school?.id, selectedScope]);

  useEffect(() => {
    if (!school?.id) return;
    void fetchPayrollScopes(school.id).then(next => {
      setScopes(next);
      setScopeKey(current => current || (next[0]?.branchId ?? "school"));
    }).catch(() => toast.error("تعذر تحميل نطاقات الإدارة."));
  }, [school?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedCandidate) return;
    const unit = selectedCandidate.payUnit;
    setUnitKind(unit === "session" || unit === "day" || unit === "hour" || unit === "task"
      ? unit
      : selectedCandidate.payeeKind === "teacher" ? "session" : "day");
    setUnits("1");
  }, [selectedCandidate]);

  const submit = async () => {
    if (!school?.id || !selectedScope || !selectedScope.canManage || !selectedCandidate) return;
    const count = status === "absent" || status === "leave" ? 0 : Number(units);
    if (!date || !Number.isFinite(count) || count < 0 || count > 100
      || (["present", "late", "partial"].includes(status) && count <= 0)) {
      toast.error("تحقق من التاريخ وعدد الوحدات.");
      return;
    }
    setSaving(true);
    try {
      if (editingRecordId) {
        await updateStaffAttendance({
          schoolId: school.id,
          recordId: editingRecordId,
          units: count,
          status,
          sessionLabel,
          note,
        });
        toast.success("تم تصحيح سجل الحضور.");
      } else {
        await saveStaffAttendance({
          schoolId: school.id,
          branchId: selectedScope.branchId,
          candidate: selectedCandidate,
          date,
          unitKind,
          units: count,
          status,
          sessionLabel,
          note,
        });
        toast.success("تم تسجيل الحضور الوظيفي.");
      }
      setEditingRecordId(null);
      setSessionLabel("");
      setNote("");
      setUnits("1");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("تعذر تسجيل الحضور. تحقق من الصلاحيات والبيانات.");
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (record: StaffAttendanceRecord) => {
    setEditingRecordId(record.id);
    setCandidateKey(`${record.payeeKind}:${record.teacherId ?? record.employeeId}`);
    setDate(record.date);
    setUnitKind(record.unitKind);
    setUnits(String(record.units));
    setStatus(record.status);
    setSessionLabel(record.sessionLabel ?? "");
    setNote(record.note ?? "");
  };

  const cancelEdit = () => {
    setEditingRecordId(null);
    setSessionLabel("");
    setNote("");
    setUnits("1");
    setStatus("present");
  };

  return (
    <div className="space-y-5" dir={direction}>
      <StaffPayrollNavigation currentPath="/staff/attendance" />
      <header className="rounded-2xl border border-[#DDE8DF] bg-white p-5">
        <p className="text-xs font-bold text-[#17663B]">الموارد البشرية</p>
        <h1 className="mt-1 text-2xl font-bold text-[#173B2D]">الحضور والغياب الوظيفي</h1>
        <p className="mt-1 text-sm text-[#607368]">سجل مستقل لحضور المعلمين والموظفين، وتُستخدم الوحدات المعتمدة عند احتساب الأجر.</p>
      </header>

      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <label className="text-xs font-bold">الفرع / النطاق
          <select value={scopeKey} onChange={event => setScopeKey(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            {scopes.map(scope => <option key={scope.branchId ?? "school"} value={scope.branchId ?? "school"}>{scope.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">تاريخ التسجيل
          <Input type="date" value={date} onChange={event => setDate(event.target.value)} disabled={Boolean(editingRecordId)} className="mt-1" />
        </label>
      </Card>

      {selectedScope?.canManage ? (
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-[#173B2D]"><CalendarCheck className="size-5" />تسجيل حضور أو غياب</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-bold">المعلم أو الموظف
              <select value={candidateKey} onChange={event => setCandidateKey(event.target.value)} disabled={Boolean(editingRecordId)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                <option value="">اختر الشخص...</option>
                {candidates.map(candidate => {
                  const key = `${candidate.payeeKind}:${candidate.teacherId ?? candidate.employeeId}`;
                  return <option key={key} value={key}>{candidate.fullName} · {candidate.jobLabel}</option>;
                })}
              </select>
            </label>
            <label className="text-xs font-bold">الحالة
              <select value={status} onChange={event => setStatus(event.target.value as AttendanceStatus)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">وحدة الاحتساب
              <select value={unitKind} onChange={event => setUnitKind(event.target.value as UnitKind)} disabled={Boolean(editingRecordId)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                {Object.entries(unitLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">عدد الوحدات المنجزة
              <Input type="number" min="0" max="100" step="0.25" value={status === "absent" || status === "leave" ? "0" : units} disabled={status === "absent" || status === "leave"} onChange={event => setUnits(event.target.value)} className="mt-1" />
            </label>
            <label className="text-xs font-bold">الحصة / المهمة (اختياري)
              <Input value={sessionLabel} onChange={event => setSessionLabel(event.target.value)} maxLength={120} required={selectedCandidate?.payeeKind === "teacher" && unitKind === "session"} className="mt-1" placeholder="مثال: الحلقة الأولى أو الحصة الصباحية" />
            </label>
            <label className="text-xs font-bold">ملاحظة
              <Input value={note} onChange={event => setNote(event.target.value)} maxLength={500} className="mt-1" placeholder="سبب الغياب أو تفاصيل إضافية" />
            </label>
            <div className="flex items-end gap-2"><Button type="button" onClick={() => void submit()} disabled={saving || !selectedCandidate} className="gap-2"><Save className="size-4" />{editingRecordId ? "حفظ التصحيح" : "حفظ السجل"}</Button>{editingRecordId ? <Button type="button" variant="outline" onClick={cancelEdit}>إلغاء التعديل</Button> : null}</div>
          </div>
          {selectedCandidate ? <p className="mt-3 text-xs text-[#718377]">الدوام المتوقع أسبوعيًا: {selectedCandidate.expectedUnitsPerWeek || "غير محدد"} {unitLabels[unitKind]}</p> : null}
          <p className="mt-2 text-xs text-[#718377]">يُسجل الغياب والإجازة بصفر وحدة مستحقة. أما الغياب المبرر فيمكن للإدارة تحديد الوحدات المستحقة له يدويًا.</p>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-amber-800">تحتاج إلى صلاحية إدارة الرواتب في هذا النطاق لتسجيل الحضور والغياب.</Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 font-bold text-[#173B2D]"><ClipboardList className="size-5" />سجل الشهر الحالي</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`me-1 size-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
        </div>
        {loading ? <div className="p-8 text-center text-sm text-gray-500">جارٍ تحميل السجل...</div>
          : records.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">لا توجد سجلات حضور لهذا الشهر.</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm">
            <thead className="bg-[#F5F8F5] text-xs text-[#607368]"><tr><th className="p-3">التاريخ</th><th className="p-3">الاسم</th><th className="p-3">النوع</th><th className="p-3">الحالة</th><th className="p-3">الوحدات</th><th className="p-3">التفاصيل</th><th className="p-3">إجراء</th></tr></thead>
            <tbody className="divide-y">{records.map(record => <tr key={record.id}>
              <td className="p-3 tabular-nums">{record.date}</td>
              <td className="p-3 font-medium">{record.fullName}</td>
              <td className="p-3">{unitLabels[record.unitKind]}</td>
              <td className="p-3">{statusLabels[record.status]}</td>
              <td className="p-3 tabular-nums">{record.units}</td>
              <td className="p-3 text-xs text-gray-500">{[record.sessionLabel, record.note].filter(Boolean).join(" · ") || "—"}</td><td className="p-3"><Button type="button" size="sm" variant="outline" onClick={() => beginEdit(record)}>تصحيح</Button></td>
            </tr>)}</tbody>
          </table></div>}
      </Card>
    </div>
  );
}
