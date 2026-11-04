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

type Props = {
  studentName: string;
  records: MemorizationRecord[];
  loading?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(older: string, newer: string): number {
  const a = new Date(older + "T00:00:00").getTime();
  const b = new Date(newer + "T00:00:00").getTime();
  return Math.max(0, Math.floor((b - a) / DAY_MS));
}

function uniqueMemorizedAyat(records: MemorizationRecord[]): number {
  const ranges = new Map<number, Array<[number, number]>>();
  for (const record of records) {
    if ((record.sessionType !== "new_memorization" && record.sessionType !== "new_hifz") || record.recitationResult === "not_memorized") continue;
    const items = ranges.get(record.surahNumber) ?? [];
    items.push([record.ayahStart, record.ayahEnd]);
    ranges.set(record.surahNumber, items);
  }
  let total = 0;
  for (const items of ranges.values()) {
    items.sort((a, b) => a[0] - b[0]);
    let start = -1;
    let end = -1;
    for (const [nextStart, nextEnd] of items) {
      if (start === -1) {
        start = nextStart;
        end = nextEnd;
      } else if (nextStart <= end + 1) {
        end = Math.max(end, nextEnd);
      } else {
        total += end - start + 1;
        start = nextStart;
        end = nextEnd;
      }
    }
    if (start !== -1) total += end - start + 1;
  }
  return total;
}

export default function StudentQuranCard({ studentName, records, loading = false }: Props) {
  const [surah, setSurah] = useState("all");
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

  const alerts = useMemo(() => {
    const messages: string[] = [];
    const bySurah = new Map<number, MemorizationRecord[]>();
    for (const record of records) {
      const items = bySurah.get(record.surahNumber) ?? [];
      items.push(record);
      bySurah.set(record.surahNumber, items);
    }
    for (const [number, items] of bySurah) {
      const memorization = items
        .filter(item => item.sessionType === "new_memorization" || item.sessionType === "new_hifz")
        .sort((a, b) => b.recordDate.localeCompare(a.recordDate))[0];
      if (!memorization) continue;
      const revision = items
        .filter(item => item.sessionType === "near_revision" || item.sessionType === "distant_revision")
        .sort((a, b) => b.recordDate.localeCompare(a.recordDate))[0];
      const elapsed = daysBetween(memorization.recordDate, new Date().toISOString().slice(0, 10));
      if ((!revision || revision.recordDate < memorization.recordDate) && elapsed >= 14) {
        const name = QURAN_SURAHS[number - 1]?.name ?? "غير معروفة";
        messages.push(`سورة ${name}: آخر تسجيل للحفظ بتاريخ ${memorization.recordDate}، ولم يظهر في السجلات المتاحة تسجيل مراجعة لاحق لها خلال ${elapsed} يومًا.`);
      }
    }
    const weakBySurah = [...bySurah.entries()].flatMap(([number, items]) => {
      const evaluated = items.filter(item => item.rating <= 2);
      if (evaluated.length < 2) return [];
      const name = QURAN_SURAHS[number - 1]?.name ?? "غير معروفة";
      return [`سورة ${name}: ${evaluated.length} تقييمات من 5 بدرجة 1 أو 2؛ يُستحسن أن يراجع المعلم هذه المواضع.`];
    });
    return [...messages, ...weakBySurah].slice(0, 8);
  }, [records]);

  const memorizedAyat = uniqueMemorizedAyat(records);
  const average = records.length
    ? records.reduce((sum, item) => sum + item.rating, 0) / records.length
    : 0;
  const revisionCount = records.filter(item => item.sessionType === "near_revision" || item.sessionType === "distant_revision").length;

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
        <p className="text-xs text-gray-500">نتائج الفلاتر: {filtered.length} من {records.length} سجلًا. لا تتضمن هذه النسخة بعد تصنيف الأجزاء والأحزاب؛ لن نعرض تصنيفًا قرآنيًا غير موثق.</p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#2C3E50]"><Lightbulb size={16} /> تنبيهات تحليلية قابلة للتحقق</h3>
        {loading ? <p className="text-sm text-gray-500">جارٍ تحليل السجلات...</p> : alerts.length ? alerts.map((message, index) => <div key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{message}</div>) : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">لا تظهر تنبيهات وفق السجلات المتاحة حاليًا.</p>}
        <p className="text-xs text-gray-500">هذه مؤشرات آلية مبنية على تواريخ وأنواع وتقييمات سجّلها المعلم، وليست حكمًا على إتقان الطالب أو نسيانه. لا يغيّر التحليل أي سجل أو علامة.</p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#2C3E50]"><TrendingDown size={16} /> تفاصيل السجلات بعد الفلترة</h3>
        {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-right text-xs text-gray-500"><th className="p-2">التاريخ</th><th className="p-2">السورة والآيات</th><th className="p-2">النوع</th><th className="p-2">النتيجة</th><th className="p-2">الدرجة</th><th className="p-2">الأخطاء</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-b border-gray-100"><td className="p-2" dir="ltr">{item.recordDate}</td><td className="p-2">{QURAN_SURAHS[item.surahNumber - 1]?.name ?? "—"} · {item.ayahStart}–{item.ayahEnd}</td><td className="p-2">{getMemorizationSessionLabel(item.sessionType)}</td><td className="p-2">{item.recitationResult ? getMemorizationResultLabel(item.recitationResult) : "—"}</td><td className="p-2">{getMemorizationRatingLabel(item.rating)}</td><td className="p-2">{item.errorsCount}</td></tr>)}</tbody></table></div> : <p className="text-sm text-gray-500">لا توجد سجلات تطابق الفلاتر.</p>}
      </section>
    </Card>
  );
}
