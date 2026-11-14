import {
  AlertOctagon,
  AlertTriangle,
  BookOpenCheck,
  CalendarX,
  CheckCircle2,
  Clock3,
  Info,
} from "lucide-react";
import type { AttendanceStatus } from "@/lib/attendance";
type AttendanceItem = { id: string; date: string; status: AttendanceStatus | string };
type MemorizationItem = { rating: number; errorsCount: number };

type Level = "critical" | "high" | "medium" | "info" | "positive";
type AlertItem = {
  key: string;
  title: string;
  level: Level;
  description: string;
  action: string;
};

const LEVELS: Record<Level, { label: string; className: string; icon: typeof AlertTriangle; rank: number }> = {
  critical: { label: "خطر — تدخل عاجل", className: "border-red-200 bg-red-50 text-red-800", icon: AlertOctagon, rank: 5 },
  high: { label: "مرتفع — متابعة قريبة", className: "border-orange-200 bg-orange-50 text-orange-800", icon: AlertTriangle, rank: 4 },
  medium: { label: "متوسط — يحتاج انتباهًا", className: "border-amber-200 bg-amber-50 text-amber-800", icon: Info, rank: 3 },
  info: { label: "معلومة", className: "border-blue-200 bg-blue-50 text-blue-800", icon: Info, rank: 2 },
  positive: { label: "مستقر / إيجابي", className: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, rank: 1 },
};

function attendanceAlerts(records: AttendanceItem[]): AlertItem[] {
  const recent = records.slice(0, 12);
  if (recent.length === 0) {
    return [
      { key: "absence", title: "الغيابات", level: "info", description: "لا توجد سجلات حضور كافية لتقييم الغياب.", action: "ابدأ بتسجيل الحضور حتى تظهر مؤشرات موثوقة." },
      { key: "commitment", title: "الالتزام بالمواعيد", level: "info", description: "لا توجد سجلات حضور كافية لتقييم الالتزام بالمواعيد.", action: "تابع تسجيل الحضور والتأخر في الحصص القادمة." },
    ];
  }
  const absent = recent.filter(item => item.status === "absent").length;
  const late = recent.filter(item => item.status === "late").length;
  const excused = recent.filter(item => item.status === "excused_absence").length;
  const absenceLevel: Level =
    absent >= 4 ? "critical" : absent >= 2 ? "high" : absent === 1 ? "medium" : excused > 0 ? "info" : "positive";
  const commitmentLevel: Level =
    late >= 6 ? "critical" : late >= 4 ? "high" : late >= 2 ? "medium" : late === 1 ? "info" : "positive";

  return [
    {
      key: "absence",
      title: "الغيابات",
      level: absenceLevel,
      description: absent
        ? `سُجل ${absent} غياب غير مبرر من آخر ${recent.length} سجل.`
        : excused
          ? `لا توجد غيابات غير مبررة، ويوجد ${excused} غياب بعذر.`
          : "لا توجد غيابات غير مبررة في السجلات المتاحة.",
      action: absent >= 2 ? "مراجعة أسباب الغياب والتواصل مع الولي عند الحاجة." : "مواصلة متابعة الانتظام.",
    },
    {
      key: "commitment",
      title: "الالتزام بالمواعيد",
      level: commitmentLevel,
      description: late
        ? `سُجل ${late} حالات تأخر من آخر ${recent.length} سجل.`
        : "لا توجد حالات تأخر مسجلة في السجلات المتاحة.",
      action: late >= 2 ? "تنبيه الطالب ومتابعة الالتزام بموعد الحلقة." : "تعزيز الانتظام.",
    },
  ];
}

function memorizationAlert(records: MemorizationItem[]): AlertItem {
  const recent = records.slice(0, 5);
  if (recent.length === 0) {
    return { key: "memorization", title: "الحفظ والمراجعة", level: "info", description: "لا توجد سجلات حفظ كافية لتقييم المستوى.", action: "سجّل متابعة الحفظ والمراجعة لبدء قياس التقدم." };
  }
  const firstStrongRecord = recent.findIndex(item => item.rating > 2);
  const weakStreak = firstStrongRecord === -1 ? recent.length : firstStrongRecord;
  const average = recent.length
    ? recent.reduce((total, item) => total + item.rating, 0) / recent.length
    : 0;
  const latestErrors = recent[0]?.errorsCount ?? 0;
  const level: Level =
    weakStreak >= 3 || (recent.length >= 4 && average < 2.5) || latestErrors >= 8
      ? "critical"
      : weakStreak >= 2 || (recent.length >= 3 && average < 3) || latestErrors >= 5
        ? "high"
        : weakStreak === 1 || (recent.length >= 2 && average < 3.5)
          ? "medium"
          : "positive";

  const reasons: string[] = [];
  if (weakStreak) reasons.push(`تقييم منخفض في ${weakStreak} متابعة متتالية`);
  if (recent.length && average < 3.5) reasons.push(`متوسط التقييم ${average.toFixed(1)}/5`);
  if (latestErrors >= 5) reasons.push(`${latestErrors} أخطاء في آخر متابعة`);

  return {
    key: "memorization",
    title: "الحفظ والمراجعة",
    level,
    description: reasons.length ? reasons.join(" · ") : "مستوى المتابعة مستقر بحسب السجلات المتاحة.",
    action: level === "critical"
      ? "وضع خطة علاجية قصيرة ومراجعة أسباب التعثر مع المعلم."
      : level === "high"
        ? "زيادة المراجعة القريبة وتسجيل نتيجة المتابعة القادمة."
        : "مواصلة التثبيت والتشجيع.",
  };
}

export function StudentAlertSummary({
  attendance,
  memorization,
}: {
  attendance: AttendanceItem[] | null;
  memorization: MemorizationItem[] | null;
}) {
  const alerts = [
    ...(attendance ? attendanceAlerts(attendance) : []),
    ...(memorization ? [memorizationAlert(memorization)] : []),
  ];
  if (!alerts.length) return null;

  const overall = alerts.reduce((best, item) =>
    LEVELS[item.level].rank > LEVELS[best.level].rank ? item : best
  );
  const OverallIcon = LEVELS[overall.level].icon;

  return (
    <section className="space-y-3" aria-label="التنبيهات التربوية">
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 ${LEVELS[overall.level].className}`}>
        <div className="flex items-center gap-2">
          <OverallIcon size={20} aria-hidden="true" />
          <div>
            <p className="text-sm font-extrabold">الحالة التربوية الحالية</p>
            <p className="mt-0.5 text-xs">{LEVELS[overall.level].label}</p>
          </div>
        </div>
        <span className="text-xs font-semibold">{alerts.length} مجالات متابعة</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {alerts.map(alert => {
          const config = LEVELS[alert.level];
          const Icon = alert.key === "absence" ? CalendarX : alert.key === "commitment" ? Clock3 : BookOpenCheck;
          return (
            <article key={alert.key} className={`rounded-2xl border p-4 ${config.className}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-extrabold">
                  <Icon size={17} aria-hidden="true" />
                  {alert.title}
                </h3>
                <span className="rounded-full border border-current/20 px-2 py-1 text-[11px] font-bold">{config.label}</span>
              </div>
              <p className="mt-3 text-sm leading-6">{alert.description}</p>
              <p className="mt-3 border-t border-current/15 pt-3 text-xs leading-6">
                <strong>الإجراء المقترح:</strong> {alert.action}
              </p>
            </article>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-[#718377]">
        التقدير آلي استرشادي مبني على السجلات المتاحة فقط، ولا يصدر حكمًا نهائيًا على الطالب. تُراعى الأعذار والسياق وتُراجع الحالة من المعلم.
      </p>
    </section>
  );
}
