import { useMemo, useState } from "react";
import { BookOpenCheck, Filter, Lightbulb, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MEMORIZATION_SESSION_TYPES,
  QURAN_SURAHS,
  getMemorizationSessionLabel,
  getMemorizationRatingLabel,
  getMemorizationResultLabel,
  type MemorizationRecord,
} from "@/lib/memorization";
import { analyzeStudentQuranRecords } from "@/lib/memorization-analysis";
import { getQuranDivisionsForRange, type QuranDivisionKind } from "@/lib/quran-divisions";

type Props = {
  studentName: string;
  records: MemorizationRecord[];
  loading?: boolean;
};

export default function StudentQuranCard({ studentName, records, loading = false }: Props) {
  const [surah, setSurah] = useState("all");
  const [mapSurah, setMapSurah] = useState("1");
  const [groupBy, setGroupBy] = useState<"surah" | "juz" | "hizb" | "session">("surah");
  const [session, setSession] = useState("all");
  const [minimumRating, setMinimumRating] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => records.filter(record =>
    (surah === "all" || record.surahNumber === Number(surah)) &&
    (session === "all" || record.sessionType === session) &&
    (minimumRating === "all" || record.rating <= Number(minimumRating)) &&
    (!fromDate || record.recordDate >= fromDate) &&
    (!toDate || record.recordDate <= toDate)
  ), [records, surah, session, minimumRating, fromDate, toDate]);

  const analysis = useMemo(() => analyzeStudentQuranRecords(records), [records]);
  const alerts = analysis.alerts.map(alert => {
    const name = QURAN_SURAHS[alert.surahNumber - 1]?.name ?? "غير معروفة";
    const juz = getQuranDivisionsForRange("juz", alert.surahNumber, alert.ayahStart, alert.ayahEnd);
    const hizb = getQuranDivisionsForRange("hizb", alert.surahNumber, alert.ayahStart, alert.ayahEnd);
    const location = [juz.length ? "الجزء " + juz.join("، ") : "", hizb.length ? "الحزب " + hizb.join("، ") : ""].filter(Boolean).join(" · ");
    return `سورة ${name} · الآيات ${alert.ayahStart}–${alert.ayahEnd}${location ? " · " + location : ""} · ${alert.message}`;
  });
  const memorizedAyat = analysis.memorizedAyat;
  const selectedMapSurah = QURAN_SURAHS[Number(mapSurah) - 1];
  const average = records.length
    ? records.reduce((sum, item) => sum + item.rating, 0) / records.length
    : 0;
  const revisionCount = records.filter(item => item.sessionType === "near_revision" || item.sessionType === "distant_revision").length;
  const groupedPath = useMemo(() => {
    const groups = new Map<string, { label: string; records: MemorizationRecord[] }>();
    for (const record of filtered) {
      const keys: Array<{ key: string; label: string }> = groupBy === "session"
        ? [{ key: record.sessionType, label: getMemorizationSessionLabel(record.sessionType) }]
        : groupBy === "surah"
          ? [{ key: String(record.surahNumber), label: "سورة " + (QURAN_SURAHS[record.surahNumber - 1]?.name ?? record.surahNumber) }]
          : getQuranDivisionsForRange(groupBy as QuranDivisionKind, record.surahNumber, record.ayahStart, record.ayahEnd).map(number => ({ key: String(number), label: (groupBy === "juz" ? "الجزء " : "الحزب ") + number }));
      for (const item of keys) {
        const group = groups.get(item.key) ?? { label: item.label, records: [] };
        group.records.push(record);
        groups.set(item.key, group);
      }
    }
    return [...groups.values()].map(group => ({
      ...group,
      averageRating: group.records.reduce((sum, item) => sum + item.rating, 0) / group.records.length,
      errors: group.records.reduce((sum, item) => sum + item.errorsCount, 0),
      revisions: group.records.filter(item => item.sessionType === "near_revision" || item.sessionType === "distant_revision").length,
      memorization: group.records.filter(item => item.sessionType === "new_memorization" || item.sessionType === "new_hifz").length,
      latestDate: group.records.reduce((latest, item) => item.recordDate > latest ? item.recordDate : latest, group.records[0].recordDate),
      notes: [...new Set(group.records.flatMap(item => [item.notes, item.focusWords, item.nextAssignment].filter(Boolean)))].slice(0, 4),
    })).sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [filtered, groupBy]);

  return (
    <Card className="space-y-4 border border-[#DCE8E0] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-[#173B2D]"><BookOpenCheck size={19} /> البطاقة القرآنية للطالب</h2>
          <p className="mt-1 text-xs text-gray-500">{studentName} · تحليل سجلات المعلم المسجلة فقط</p>
        </div>
        <span className="rounded-full bg-[#E8F3EC] px-3 py-1 text-xs font-semibold text-[#17663B]">{records.length} سجلًا متاحًا</span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">آيات الحفظ المسجلة دون تكرار</p><p className="mt-1 text-xl font-bold text-[#173B2D]">{memorizedAyat}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">جلسات المراجعة</p><p className="mt-1 text-xl font-bold text-[#173B2D]">{revisionCount}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">متوسط التقييم المسجل</p><p className="mt-1 text-xl font-bold text-[#173B2D]">{records.length ? average.toFixed(1) + " / 5" : "—"}</p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">السور المسجلة</p><p className="mt-1 text-xl font-bold text-[#173B2D]">{new Set(records.map(item => item.surahNumber)).size}</p></div>
      </div>

      <section className="space-y-3 rounded-xl border border-[#DCE8E0] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[#173B2D]">خريطة الحفظ والمراجعة حسب الآية</h3>
          <select
            aria-label="سورة خريطة الحفظ"
            value={mapSurah}
            onChange={event => setMapSurah(event.target.value)}
            className="h-10 min-w-40 rounded-md border border-gray-200 bg-white px-2 text-sm"
          >
            {QURAN_SURAHS.map(item => <option key={item.number} value={item.number}>{item.number}. {item.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-emerald-600" /> استظهر وفق السجل</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-amber-500" /> موعد المراجعة</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-rose-600" /> ضعف متكرر</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-sm border border-gray-300 bg-gray-100" /> غير مقيّم</span>
        </div>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {Array.from({ length: selectedMapSurah?.ayahCount ?? 0 }, (_, index) => index + 1).map(ayah => {
            const status = analysis.ayahStatuses[`${mapSurah}:${ayah}`] ?? "unassessed";
            const style = status === "memorized"
              ? "border-emerald-700 bg-emerald-600 text-white"
              : status === "review_due"
                ? "border-amber-500 bg-amber-100 text-amber-950"
                : status === "repeated_weakness"
                  ? "border-rose-700 bg-rose-600 text-white"
                  : "border-gray-200 bg-gray-50 text-gray-500";
            const label = status === "memorized"
              ? "استظهر وفق السجل"
              : status === "review_due"
                ? "يحتاج مراجعة"
                : status === "repeated_weakness"
                  ? "ضعف متكرر"
                  : "غير مقيّم";
            return <span
              key={ayah}
              title={`الآية ${ayah}: ${label}`}
              aria-label={`الآية ${ayah}: ${label}`}
              className={`flex h-9 items-center justify-center rounded-md border text-sm font-semibold ${style}`}
            >{ayah}</span>;
          })}
        </div>
        <p className="text-xs leading-5 text-gray-500">الخريطة تعرض أدلة السجلات فقط. اللون الرمادي يعني عدم توفر تسجيل كافٍ، ولا يعني أن الآية غير محفوظة. اللون الأخضر لا يثبت الإتقان النهائي.</p>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#2C3E50]"><Filter size={16} /> فلاتر البطاقة</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-xs text-gray-600">السورة
            <select value={surah} onChange={event => setSurah(event.target.value)} className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm">
              <option value="all">كل السور</option>
              {QURAN_SURAHS.map(item => <option key={item.number} value={item.number}>{item.number}. {item.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600">نوع المتابعة
            <select value={session} onChange={event => setSession(event.target.value)} className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm">
              <option value="all">كل الأنواع</option>
              {MEMORIZATION_SESSION_TYPES.map(item => <option key={item} value={item}>{getMemorizationSessionLabel(item)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600">التقييم حتى
            <select value={minimumRating} onChange={event => setMinimumRating(event.target.value)} className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm">
              <option value="all">كل التقييمات</option><option value="2">2 / 5 أو أقل</option><option value="3">3 / 5 أو أقل</option><option value="4">4 / 5 أو أقل</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600">من تاريخ<Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="h-10" /></label>
          <label className="space-y-1 text-xs text-gray-600">إلى تاريخ<Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="h-10" /></label>
        </div>
        <p className="text-xs text-gray-500">نتائج الفلاتر: {filtered.length} من {records.length} سجلًا. حدود الأجزاء والأحزاب مستندة إلى بيانات وصفية قرآنية موثقة، وتُحسب للسجلات التي تتقاطع معها الآيات.</p>
      </section>

      <section className="space-y-3 rounded-xl border border-[#DCE8E0] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[#173B2D]">تحليل المسار حسب وحدات القرآن</h3>
          <select aria-label="تجميع تحليل المسار" value={groupBy} onChange={event => setGroupBy(event.target.value as typeof groupBy)} className="h-10 rounded-md border border-gray-200 bg-white px-2 text-sm">
            <option value="surah">حسب السورة</option><option value="juz">حسب الجزء</option><option value="hizb">حسب الحزب</option><option value="session">حسب نوع الجلسة</option>
          </select>
        </div>
        {groupedPath.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-right text-xs text-gray-500"><th className="p-2">النطاق</th><th className="p-2">الجلسات</th><th className="p-2">الحفظ الجديد</th><th className="p-2">المراجعة</th><th className="p-2">متوسط التقييم</th><th className="p-2">الأخطاء</th><th className="p-2">آخر نشاط</th></tr></thead><tbody>{groupedPath.map(group => <tr key={group.label} className="border-b border-gray-100 align-top"><td className="p-2 font-semibold">{group.label}</td><td className="p-2">{group.records.length}</td><td className="p-2">{group.memorization}</td><td className="p-2">{group.revisions}</td><td className="p-2">{group.averageRating.toFixed(1)} / 5</td><td className="p-2">{group.errors}</td><td className="p-2" dir="ltr">{group.latestDate}</td></tr>)}</tbody></table>
          <div className="mt-3 space-y-2">{groupedPath.map(group => group.notes.length ? <article key={group.label} className="rounded-lg bg-slate-50 p-3"><h4 className="text-sm font-bold">{group.label} · ملاحظات المعلم</h4><ul className="mt-1 list-inside list-disc text-sm leading-6 text-slate-700">{group.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></article> : null)}</div>
        </div> : <p className="text-sm text-gray-500">لا توجد سجلات في هذا النطاق بعد تطبيق الفلاتر.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#2C3E50]"><Lightbulb size={16} /> تنبيهات تحليلية قابلة للتحقق</h3>
        {loading ? <p className="text-sm text-gray-500">جارٍ تحليل السجلات...</p> : alerts.length ? alerts.map((message, index) => <div key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{message}</div>) : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">لا تظهر تنبيهات وفق السجلات المتاحة حاليًا.</p>}
        <p className="text-xs text-gray-500">هذه مؤشرات آلية مبنية على تواريخ وأنواع وتقييمات سجّلها المعلم، وليست حكمًا على إتقان الطالب أو نسيانه. لا يغيّر التحليل أي سجل أو علامة.</p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#2C3E50]"><TrendingDown size={16} /> تفاصيل السجلات بعد الفلترة</h3>
        {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-right text-xs text-gray-500"><th className="p-2">التاريخ</th><th className="p-2">السورة والآيات</th><th className="p-2">النوع</th><th className="p-2">النتيجة</th><th className="p-2">الدرجة</th><th className="p-2">الأخطاء</th><th className="p-2">ملاحظات وتكليف المعلم</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-b border-gray-100"><td className="p-2" dir="ltr">{item.recordDate}</td><td className="p-2">{QURAN_SURAHS[item.surahNumber - 1]?.name ?? "—"} · {item.ayahStart}–{item.ayahEnd}</td><td className="p-2">{getMemorizationSessionLabel(item.sessionType)}</td><td className="p-2">{item.recitationResult ? getMemorizationResultLabel(item.recitationResult) : "—"}</td><td className="p-2">{getMemorizationRatingLabel(item.rating)}</td><td className="p-2">{item.errorsCount}</td><td className="p-2">{[item.focusWords, item.notes, item.nextAssignment].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-gray-500">لا توجد سجلات تطابق الفلاتر.</p>}
      </section>
    </Card>
  );
}
