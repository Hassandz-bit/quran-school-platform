import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarOff, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import StaffPayrollNavigation from "@/components/StaffPayrollNavigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { fetchPayrollScopes, type PayrollScope } from "@/lib/payroll";
import { fetchStaffAttendanceCandidates, type StaffAttendanceCandidate } from "@/lib/staff-attendance";
import { getSupabaseClient } from "@/lib/supabase";

type ScheduleRow = {
  schedule_id: string;
  payee_kind: "teacher" | "employee";
  teacher_id: string | null;
  employee_id: string | null;
  full_name: string;
  schedule_label: string;
  weekday: number;
  start_time: string;
  end_time: string;
  unit_kind: string;
  units: number;
  active: boolean;
  source_kind: "class" | "employee";
};
type LeaveRow = {
  leave_id: string;
  payee_kind: "teacher" | "employee";
  full_name: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
  note: string | null;
};
type ClosureRow = { closure_id: string; closure_date: string; reason: string };
const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const leaveLabels: Record<string, string> = {
  annual: "سنوية", sick: "مرضية", personal: "شخصية", unpaid: "دون أجر", other: "أخرى",
};
const dayLabel = (value: number, en: boolean) => en
  ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][value] ?? "—"
  : weekdays[value] ?? "—";

export default function StaffSchedules() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const en = locale === "en";
  const [scopes, setScopes] = useState<PayrollScope[]>([]);
  const [scopeKey, setScopeKey] = useState("");
  const [candidates, setCandidates] = useState<StaffAttendanceCandidate[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [closures, setClosures] = useState<ClosureRow[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("18:00");
  const [unitKind, setUnitKind] = useState("day");
  const [units, setUnits] = useState("1");
  const [scheduleLabel, setScheduleLabel] = useState("الدوام اليومي");
  const [leaveCandidateKey, setLeaveCandidateKey] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveType, setLeaveType] = useState("annual");
  const [leaveNote, setLeaveNote] = useState("");
  const [closureDate, setClosureDate] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedScope = useMemo(
    () => scopes.find(scope => (scope.branchId ?? "school") === scopeKey) ?? null,
    [scopeKey, scopes]
  );
  const employees = useMemo(() => candidates.filter(item => item.payeeKind === "employee"), [candidates]);
  const selectedLeaveCandidate = useMemo(() => candidates.find(item =>
    `${item.payeeKind}:${item.teacherId ?? item.employeeId}` === leaveCandidateKey
  ) ?? null, [candidates, leaveCandidateKey]);

  const load = useCallback(async () => {
    if (!school?.id || !selectedScope) return;
    setLoading(true);
    const client = getSupabaseClient();
    try {
      const [nextCandidates, scheduleResult, leaveResult, closureResult] = await Promise.all([
        fetchStaffAttendanceCandidates(school.id, selectedScope.branchId),
        client.rpc("list_staff_work_schedules", { target_school_id: school.id, target_branch_id: selectedScope.branchId }),
        client.rpc("list_staff_leave_periods", { target_school_id: school.id, target_branch_id: selectedScope.branchId }),
        client.rpc("list_staff_closure_days", { target_school_id: school.id, target_branch_id: selectedScope.branchId }),
      ]);
      if (scheduleResult.error) throw scheduleResult.error;
      if (leaveResult.error) throw leaveResult.error;
      if (closureResult.error) throw closureResult.error;
      setCandidates(nextCandidates);
      setSchedules((scheduleResult.data ?? []) as ScheduleRow[]);
      setLeaves((leaveResult.data ?? []) as LeaveRow[]);
      setClosures((closureResult.data ?? []) as ClosureRow[]);
      setEmployeeId(current => nextCandidates.some(item => item.payeeKind === "employee" && item.employeeId === current)
        ? current : (nextCandidates.find(item => item.payeeKind === "employee")?.employeeId ?? ""));
      setLeaveCandidateKey(current => nextCandidates.some(item =>
        `${item.payeeKind}:${item.teacherId ?? item.employeeId}` === current
      ) ? current : nextCandidates[0]
        ? `${nextCandidates[0].payeeKind}:${nextCandidates[0].teacherId ?? nextCandidates[0].employeeId}`
        : "");
    } catch (error) {
      console.error(error);
      toast.error(en ? "Could not load schedules and leave." : "تعذر تحميل الجداول والإجازات.");
    } finally {
      setLoading(false);
    }
  }, [en, school?.id, selectedScope]);

  useEffect(() => {
    if (!school?.id) return;
    void fetchPayrollScopes(school.id).then(next => {
      setScopes(next);
      setScopeKey(current => current || (next[0]?.branchId ?? "school"));
    }).catch(() => toast.error(en ? "Could not load scopes." : "تعذر تحميل نطاقات الإدارة."));
  }, [en, school?.id]);
  useEffect(() => { void load(); }, [load]);

  const saveSchedule = async () => {
    if (!school?.id || !selectedScope?.canManage || !employeeId || !startTime || !endTime) return;
    setSaving(true);
    try {
      const { error } = await getSupabaseClient().rpc("save_employee_work_schedule", {
        target_school_id: school.id,
        target_branch_id: selectedScope.branchId,
        target_employee_id: employeeId,
        target_weekday: Number(weekday),
        target_start_time: startTime,
        target_end_time: endTime,
        target_unit_kind: unitKind,
        target_units: Number(units),
        target_schedule_label: scheduleLabel.trim(),
        target_schedule_id: null,
      });
      if (error) throw error;
      toast.success(en ? "Work schedule saved." : "تم حفظ جدول الدوام.");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(en ? "Could not save the schedule." : "تعذر حفظ الجدول؛ تحقق من الوقت والوحدات والصلاحيات.");
    } finally { setSaving(false); }
  };

  const toggleSchedule = async (row: ScheduleRow) => {
    if (!school?.id || row.source_kind !== "employee" || !selectedScope?.canManage) return;
    setSaving(true);
    try {
      const { error } = await getSupabaseClient().rpc("set_employee_work_schedule_active", {
        target_school_id: school.id, target_schedule_id: row.schedule_id, target_active: !row.active,
      });
      if (error) throw error;
      await load();
    } catch (error) {
      console.error(error);
      toast.error(en ? "Could not update schedule." : "تعذر تحديث الجدول.");
    } finally { setSaving(false); }
  };

  const saveLeave = async () => {
    if (!school?.id || !selectedScope?.canManage || !selectedLeaveCandidate || !leaveStart || !leaveEnd) return;
    setSaving(true);
    try {
      const { error } = await getSupabaseClient().rpc("save_staff_leave_period", {
        target_school_id: school.id,
        target_branch_id: selectedScope.branchId,
        target_payee_kind: selectedLeaveCandidate.payeeKind,
        target_teacher_id: selectedLeaveCandidate.teacherId,
        target_employee_id: selectedLeaveCandidate.employeeId,
        target_start_date: leaveStart,
        target_end_date: leaveEnd,
        target_leave_type: leaveType,
        target_note: leaveNote.trim() || null,
      });
      if (error) throw error;
      toast.success(en ? "Approved leave recorded." : "تم تسجيل الإجازة المعتمدة.");
      setLeaveNote("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(en ? "Could not save leave." : "تعذر تسجيل الإجازة؛ تحقق من المدة والصلاحيات.");
    } finally { setSaving(false); }
  };

  const saveClosure = async () => {
    if (!school?.id || !selectedScope?.canManage || !closureDate || closureReason.trim().length < 2) return;
    setSaving(true);
    try {
      const { error } = await getSupabaseClient().rpc("save_staff_closure_day", {
        target_school_id: school.id, target_branch_id: selectedScope.branchId,
        target_closure_date: closureDate, target_reason: closureReason.trim(),
      });
      if (error) throw error;
      toast.success(en ? "Closure day saved." : "تم حفظ يوم العطلة.");
      setClosureReason("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(en ? "Could not save closure day." : "تعذر حفظ يوم العطلة.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5" dir={direction}>
      <StaffPayrollNavigation currentPath="/staff/schedules" />
      <header className="rounded-2xl border border-[#DDE8DF] bg-white p-5">
        <p className="text-xs font-bold text-[#17663B]">{en ? "Human resources" : "الموارد البشرية"}</p>
        <h1 className="mt-1 text-2xl font-bold text-[#173B2D]">{en ? "Staff schedules and leave" : "جداول دوام المعلمين والموظفين"}</h1>
        <p className="mt-1 text-sm text-[#607368]">{en
          ? "Teacher schedules follow assigned classes and their duwam. Employee shifts are configured here. Absence is marked only after the scheduled end plus a 30-minute grace period."
          : "جدول المعلم يُستمد من الحلقات والدوام المرتبط بها، أما دوام الموظف فيُحدد هنا. لا يُسجل الغياب آليًا إلا بعد نهاية الموعد بنصف ساعة."}</p>
      </header>

      <Card className="p-4">
        <label className="block text-xs font-bold">{en ? "Branch / scope" : "الفرع / النطاق"}
          <select value={scopeKey} onChange={event => setScopeKey(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            {scopes.map(scope => <option key={scope.branchId ?? "school"} value={scope.branchId ?? "school"}>{scope.label}</option>)}
          </select>
        </label>
      </Card>

      {selectedScope?.canManage ? (
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-[#173B2D]"><CalendarClock className="size-5" />{en ? "Add employee shift" : "إضافة دوام موظف"}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold">{en ? "Employee" : "الموظف"}
              <select value={employeeId} onChange={event => setEmployeeId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                {employees.map(item => <option key={item.employeeId} value={item.employeeId ?? ""}>{item.fullName} · {item.jobLabel}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">{en ? "Weekday" : "اليوم"}
              <select value={weekday} onChange={event => setWeekday(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                {weekdays.map((day, index) => <option key={index} value={index}>{en ? dayLabel(index, true) : day}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">{en ? "Start time" : "بداية الدوام"}<Input className="mt-1" type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
            <label className="text-xs font-bold">{en ? "End time" : "نهاية الدوام"}<Input className="mt-1" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label>
            <label className="text-xs font-bold">{en ? "Pay unit" : "وحدة الاحتساب"}
              <select value={unitKind} onChange={event => setUnitKind(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                <option value="day">{en ? "Day" : "يوم"}</option><option value="hour">{en ? "Hour" : "ساعة"}</option><option value="task">{en ? "Task" : "مهمة"}</option><option value="session">{en ? "Session" : "حصة"}</option>
              </select>
            </label>
            <label className="text-xs font-bold">{en ? "Units" : "الوحدات"}<Input className="mt-1" type="number" min="0.25" max="100" step="0.25" value={units} onChange={event => setUnits(event.target.value)} /></label>
            <label className="text-xs font-bold sm:col-span-2">{en ? "Shift description" : "وصف الدوام"}<Input className="mt-1" maxLength={120} value={scheduleLabel} onChange={event => setScheduleLabel(event.target.value)} /></label>
            <Button type="button" onClick={() => void saveSchedule()} disabled={saving || !employeeId} className="self-end gap-2"><Plus className="size-4" />{en ? "Add shift" : "إضافة الدوام"}</Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-4"><h2 className="font-bold text-[#173B2D]">{en ? "Weekly staff timetable" : "جدول الدوام الأسبوعي"}</h2><Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`me-1 size-4 ${loading ? "animate-spin" : ""}`} />{en ? "Refresh" : "تحديث"}</Button></div>
        {loading ? <p className="p-8 text-center text-sm text-gray-500">{en ? "Loading..." : "جارٍ التحميل..."}</p>
          : schedules.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">{en ? "No schedules configured." : "لا توجد جداول دوام محددة."}</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-[#F5F8F5] text-xs"><tr><th className="p-3">{en ? "Name" : "الاسم"}</th><th className="p-3">{en ? "Type" : "النوع"}</th><th className="p-3">{en ? "Day" : "اليوم"}</th><th className="p-3">{en ? "Time" : "الوقت"}</th><th className="p-3">{en ? "Class / shift" : "الحلقة / الدوام"}</th><th className="p-3">{en ? "Status" : "الحالة"}</th><th className="p-3">{en ? "Action" : "إجراء"}</th></tr></thead><tbody className="divide-y">{schedules.map((row,index) => <tr key={`${row.source_kind}-${row.schedule_id}-${row.weekday}-${index}`}><td className="p-3 font-medium">{row.full_name}</td><td className="p-3">{row.payee_kind === "teacher" ? (en ? "Teacher" : "معلم") : (en ? "Employee" : "موظف")}</td><td className="p-3">{dayLabel(Number(row.weekday),en)}</td><td className="p-3 tabular-nums">{String(row.start_time).slice(0,5)} – {String(row.end_time).slice(0,5)}</td><td className="p-3">{row.schedule_label}</td><td className="p-3">{row.active ? (en ? "Active" : "نشط") : (en ? "Paused" : "موقف")}</td><td className="p-3">{row.source_kind === "employee" && selectedScope?.canManage ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void toggleSchedule(row)}>{row.active ? (en ? "Pause" : "إيقاف") : (en ? "Activate" : "تفعيل")}</Button> : row.source_kind === "class" ? <span className="text-xs text-gray-500">{en ? "From class schedule" : "من جدول الحلقة"}</span> : "—"}</td></tr>)}</tbody></table></div>}
      </Card>

      {selectedScope?.canManage ? (
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-[#173B2D]"><ShieldCheck className="size-5" />{en ? "Record approved leave" : "تسجيل إجازة معتمدة"}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold">{en ? "Teacher / employee" : "المعلم أو الموظف"}
              <select value={leaveCandidateKey} onChange={event => setLeaveCandidateKey(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                {candidates.map(item => <option key={`${item.payeeKind}:${item.teacherId ?? item.employeeId}`} value={`${item.payeeKind}:${item.teacherId ?? item.employeeId}`}>{item.fullName} · {item.jobLabel}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">{en ? "Leave type" : "نوع الإجازة"}<select value={leaveType} onChange={event => setLeaveType(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">{Object.entries(leaveLabels).map(([key,value]) => <option key={key} value={key}>{en ? key : value}</option>)}</select></label>
            <label className="text-xs font-bold">{en ? "From" : "من"}<Input className="mt-1" type="date" value={leaveStart} onChange={event => setLeaveStart(event.target.value)} /></label>
            <label className="text-xs font-bold">{en ? "To" : "إلى"}<Input className="mt-1" type="date" value={leaveEnd} onChange={event => setLeaveEnd(event.target.value)} /></label>
            <label className="text-xs font-bold sm:col-span-3">{en ? "Notes" : "ملاحظة"}<Input className="mt-1" maxLength={500} value={leaveNote} onChange={event => setLeaveNote(event.target.value)} /></label>
            <Button type="button" onClick={() => void saveLeave()} disabled={saving || !selectedLeaveCandidate || !leaveStart || !leaveEnd} className="self-end gap-2"><Plus className="size-4" />{en ? "Save leave" : "حفظ الإجازة"}</Button>
          </div>
          <div className="mt-4 divide-y">{leaves.map(row => <div key={row.leave_id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="font-medium">{row.full_name} · {leaveLabels[row.leave_type] ?? row.leave_type}</span><span className="text-gray-500 tabular-nums">{row.start_date} — {row.end_date}</span></div>)}{leaves.length===0 ? <p className="py-3 text-sm text-gray-500">{en ? "No leave periods." : "لا توجد إجازات مسجلة."}</p> : null}</div>
        </Card>
      ) : null}

      {selectedScope?.canManage ? (
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-[#173B2D]"><CalendarOff className="size-5" />{en ? "School / branch closure days" : "العطل وأيام توقف الدراسة"}</h2>
          <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold">{en ? "Date" : "التاريخ"}<Input className="mt-1" type="date" value={closureDate} onChange={event => setClosureDate(event.target.value)} /></label><label className="text-xs font-bold sm:col-span-2">{en ? "Reason" : "سبب العطلة"}<Input className="mt-1" maxLength={160} value={closureReason} onChange={event => setClosureReason(event.target.value)} /></label><Button type="button" onClick={() => void saveClosure()} disabled={saving || !closureDate || closureReason.trim().length<2} className="gap-2"><Plus className="size-4" />{en ? "Add closure day" : "إضافة يوم عطلة"}</Button></div>
          <div className="mt-3 divide-y">{closures.map(row => <div key={row.closure_id} className="flex justify-between gap-2 py-2 text-sm"><span>{row.reason}</span><span className="text-gray-500 tabular-nums">{row.closure_date}</span></div>)}{closures.length===0 ? <p className="py-2 text-sm text-gray-500">{en ? "No closure days." : "لا توجد أيام عطلة مسجلة."}</p> : null}</div>
        </Card>
      ) : null}
      <Card className="bg-[#F5F8F5] p-4 text-sm text-[#607368]"><CalendarClock className="me-2 inline size-4" />{en ? "Automatic absence runs every 15 minutes. It never records absence before the scheduled end plus 30 minutes, and skips approved leave and school closure days. Teacher sessions are read from class and duwam assignments." : "تعمل آلية الغياب الآلي كل 15 دقيقة، ولا تسجل الغياب قبل مرور 30 دقيقة على نهاية الموعد، وتتجاوز الإجازات المعتمدة وأيام العطل. ويُستمد دوام المعلم من الحلقات والدوامات المسندة إليه."}</Card>
    </div>
  );
}
