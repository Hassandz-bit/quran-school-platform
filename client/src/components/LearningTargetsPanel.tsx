import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, CalendarClock, CheckCircle2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QURAN_SURAHS } from "@/lib/memorization";
import { getSupabaseClient } from "@/lib/supabase";

type TargetRow = {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  target_type: "new_memorization" | "revision";
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  assigned_on: string;
  due_on: string;
  completed: boolean;
  overdue: boolean;
  note: string | null;
};
type Dashboard = {
  summary: {
    targets_total: number;
    completed: number;
    overdue_memorization: number;
    overdue_revision: number;
    absence_alerts: number;
    weak_passages: number;
  };
  targets: TargetRow[];
  attendance: Array<{ student_id: string; student_name: string; class_name: string; absences_30d: number; last_absence: string | null }>;
  weak_passages: Array<{ student_id: string; student_name: string; surah_number: number; ayah_start: number; ayah_end: number; attempts: number; errors_total: number; average_rating: number }>;
};
type StudentOption = { id: string; first_name: string; last_name: string };

const today = () => new Date().toISOString().slice(0, 10);
const surahLabel = (number: number) => QURAN_SURAHS.find(item => item.number === number)?.name ?? `سورة ${number}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("ar-DZ-u-nu-latn", { dateStyle: "medium" }).format(new Date(value + "T12:00:00"));

export default function LearningTargetsPanel({
  schoolId,
  branchId,
  classId,
  studentId,
}: {
  schoolId: string;
  branchId: string;
  classId: string;
  studentId: string;
}) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [student, setStudent] = useState(studentId);
  const [targetType, setTargetType] = useState<"new_memorization" | "revision">("new_memorization");
  const [surah, setSurah] = useState("1");
  const [ayahStart, setAyahStart] = useState("1");
  const [ayahEnd, setAyahEnd] = useState("7");
  const [dueOn, setDueOn] = useState(today);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const { data, error } = await client.rpc("get_learning_follow_up_dashboard", {
        target_school_id: schoolId,
        target_branch_id: branchId || null,
        target_class_id: classId || null,
        target_limit: 50,
      });
      if (error) throw error;
      setDashboard(data as Dashboard);
      if (classId) {
        let query = client.from("students")
          .select("id, first_name, last_name")
          .eq("school_id", schoolId)
          .eq("class_id", classId)
          .eq("status", "active")
          .order("last_name");
        if (branchId) query = query.eq("branch_id", branchId);
        const result = await query;
        if (result.error) throw result.error;
        setStudents((result.data ?? []) as StudentOption[]);
      } else {
        setStudents([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل لوحة المتابعة الذكية");
    } finally {
      setLoading(false);
    }
  }, [branchId, classId, client, schoolId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setStudent(studentId); }, [studentId]);
  const selectedSurah = QURAN_SURAHS.find(item => item.number === Number(surah));
  const maxAyah = selectedSurah?.ayahCount ?? 286;

  const createTarget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!branchId || !classId || !student) {
      toast.error("اختر الفرع والحلقة والطالب أولًا");
      return;
    }
    if (Number(ayahStart) < 1 || Number(ayahEnd) < Number(ayahStart) || Number(ayahEnd) > maxAyah) {
      toast.error("تحقق من نطاق الآيات");
      return;
    }
    setSaving(true);
    try {
      const { error } = await client.from("student_learning_targets").insert({
        school_id: schoolId,
        branch_id: branchId,
        class_id: classId,
        student_id: student,
        target_type: targetType,
        surah_number: Number(surah),
        ayah_start: Number(ayahStart),
        ayah_end: Number(ayahEnd),
        assigned_on: today(),
        due_on: dueOn,
        note: note.trim() || null,
      });
      if (error) throw error;
      toast.success("تم إسناد هدف المتابعة");
      setNote("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الهدف");
    } finally {
      setSaving(false);
    }
  };

  const summary = dashboard?.summary;
  return (
    <div className="space-y-5" dir="rtl">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="border border-[#DCE7DF] p-4"><p className="text-xs text-[#64766B]">الأهداف المسندة</p><p className="mt-1 text-2xl font-bold">{summary?.targets_total ?? "—"}</p></Card>
        <Card className="border border-[#DCE7DF] p-4"><p className="text-xs text-[#64766B]">أهداف أُنجزت</p><p className="mt-1 text-2xl font-bold text-[#17663B]">{summary?.completed ?? "—"}</p></Card>
        <Card className="border border-red-200 p-4"><p className="text-xs text-red-700">حفظ متأخر</p><p className="mt-1 text-2xl font-bold text-red-700">{summary?.overdue_memorization ?? "—"}</p></Card>
        <Card className="border border-amber-200 p-4"><p className="text-xs text-amber-700">مراجعة متأخرة</p><p className="mt-1 text-2xl font-bold text-amber-700">{summary?.overdue_revision ?? "—"}</p></Card>
        <Card className="border border-red-200 p-4"><p className="text-xs text-red-700">طلاب تكرر غيابهم</p><p className="mt-1 text-2xl font-bold text-red-700">{summary?.absence_alerts ?? "—"}</p></Card>
        <Card className="border border-amber-200 p-4"><p className="text-xs text-amber-700">مواضع ضعف متكررة</p><p className="mt-1 text-2xl font-bold text-amber-700">{summary?.weak_passages ?? "—"}</p></Card>
      </section>

      <Card className="space-y-4 border border-[#DCE7DF] p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-bold text-[#173B2D]">إسناد هدف حفظ أو مراجعة</h3><p className="mt-1 text-xs text-[#718377]">حدد الموضع المطلوب وتاريخ إنجازه حتى تُحتسب المتابعة بدقة.</p></div>
          <BookOpenCheck className="text-[#17663B]" />
        </div>
        {!classId ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">اختر حلقة من فلاتر التقرير لإسناد الأهداف.</p> : (
          <form onSubmit={createTarget} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-bold">الطالب<select value={student} onChange={e => setStudent(e.target.value)} required className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3"><option value="">اختر الطالب</option>{students.map(item => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}</select></label>
            <label className="text-xs font-bold">نوع الهدف<select value={targetType} onChange={e => setTargetType(e.target.value as typeof targetType)} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3"><option value="new_memorization">حفظ جديد</option><option value="revision">مراجعة</option></select></label>
            <label className="text-xs font-bold">السورة<select value={surah} onChange={e => { setSurah(e.target.value); setAyahStart("1"); setAyahEnd("1"); }} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] bg-white px-3">{QURAN_SURAHS.map(item => <option key={item.number} value={item.number}>{item.number}. {item.name}</option>)}</select></label>
            <label className="text-xs font-bold">من الآية<input type="number" min="1" max={maxAyah} value={ayahStart} onChange={e => setAyahStart(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" /></label>
            <label className="text-xs font-bold">إلى الآية<input type="number" min="1" max={maxAyah} value={ayahEnd} onChange={e => setAyahEnd(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" /></label>
            <label className="text-xs font-bold">آخر أجل<input type="date" min={today()} value={dueOn} onChange={e => setDueOn(e.target.value)} required className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" /></label>
            <label className="text-xs font-bold sm:col-span-2 lg:col-span-3">ملاحظة (اختيارية)<input value={note} onChange={e => setNote(e.target.value)} maxLength={500} className="mt-1 min-h-11 w-full rounded-xl border border-[#D6E2D9] px-3" placeholder="مثال: تثبيت الآيات مع مراجعة المتشابهات" /></label>
            <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={saving || students.length === 0} className="min-h-11"><Save size={16} className="ml-2" />{saving ? "جارٍ الحفظ..." : "إسناد الهدف"}</Button></div>
          </form>
        )}
      </Card>

      <Card className="border border-[#DCE7DF] p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-bold">الأهداف والمواضع المطلوب متابعتها</h3><p className="text-xs text-[#718377]">يُحتسب الإنجاز عند وجود سجل ناجح يغطي نطاق الآيات المحدد.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className="ml-2" />تحديث</Button></div>
        {loading ? <p className="p-5 text-center text-sm text-[#718377]">جارٍ تحميل المتابعة...</p> : (dashboard?.targets.length ?? 0) === 0 ? <p className="p-5 text-center text-sm text-[#718377]">لا توجد أهداف مسندة ضمن هذا النطاق.</p> : (
          <div className="space-y-2">{dashboard?.targets.map(target => <article key={target.id} className={`rounded-xl border p-3 ${target.overdue ? "border-red-200 bg-red-50" : target.completed ? "border-green-200 bg-green-50" : "border-[#E5EDE7] bg-white"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><b>{target.student_name}</b><span className="text-xs text-[#718377]">{target.class_name}</span></div>
            <p className="mt-1 text-sm">{target.target_type === "revision" ? "مراجعة" : "حفظ جديد"} · {surahLabel(target.surah_number)} · الآيات {target.ayah_start}–{target.ayah_end}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs"><span>الأجل: {formatDate(target.due_on)}</span>{target.completed ? <span className="inline-flex items-center gap-1 font-bold text-green-700"><CheckCircle2 size={14} /> أُنجز</span> : target.overdue ? <span className="inline-flex items-center gap-1 font-bold text-red-700"><AlertTriangle size={14} /> متأخر</span> : <span className="inline-flex items-center gap-1 text-[#64766B]"><CalendarClock size={14} /> قيد المتابعة</span>}</div>
            {target.note && <p className="mt-2 text-xs text-[#64766B]">{target.note}</p>}
          </article>)}</div>
        )}
      </Card>

      {!!dashboard?.attendance.length && <Card className="border border-red-100 p-4"><h3 className="mb-3 font-bold text-red-800">تنبيهات الغياب خلال 30 يومًا</h3><div className="space-y-2">{dashboard.attendance.map(row => <div key={row.student_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm"><b>{row.student_name}</b><span>{row.absences_30d} غياب · آخر غياب {row.last_absence ? formatDate(row.last_absence) : "—"}</span></div>)}</div></Card>}

      {!!dashboard?.weak_passages.length && <Card className="border border-amber-100 p-4"><h3 className="mb-3 font-bold text-amber-800">مواضع ضعف متكررة</h3><div className="space-y-2">{dashboard.weak_passages.map((row,index) => <div key={row.student_id + "-" + row.surah_number + "-" + index} className="rounded-lg bg-amber-50 p-3 text-sm"><b>{row.student_name}</b><p>{surahLabel(row.surah_number)} · الآيات {row.ayah_start}–{row.ayah_end}</p><p className="mt-1 text-xs text-[#718377]">{row.attempts} محاولات ضعيفة · {row.errors_total} أخطاء · متوسط التقييم {row.average_rating}</p></div>)}</div></Card>}
    </div>
  );
}
