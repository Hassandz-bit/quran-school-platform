import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getOfflineAttendanceDraft,
  getOfflineAttendanceScope,
  listOfflineAttendanceRosters,
  type AttendanceDraftScope,
  type CachedAttendanceRoster,
} from "@/lib/attendance-offline";
import type { AttendanceDraftRow, AttendanceScope } from "@/lib/attendance";

const statusLabels: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused_absence: "غياب مبرر",
};

type OfflineItem = CachedAttendanceRoster & {
  branchName: string;
  className: string;
  rows: AttendanceDraftRow[];
  hasPendingDraft: boolean;
  draftNeedsReview: boolean;
  scopeSavedAt: string | null;
};

function sameRoster(
  cachedRows: AttendanceDraftRow[],
  draftRows: AttendanceDraftRow[]
): boolean {
  if (cachedRows.length !== draftRows.length) return false;
  const byId = new Map(cachedRows.map(row => [row.id, row]));
  return draftRows.every(row => {
    const cached = byId.get(row.id);
    return cached &&
      cached.recordId === row.recordId &&
      cached.baseUpdatedAt === row.baseUpdatedAt;
  });
}

export default function OfflineAttendance() {
  const { user, loading } = useAuth();
  const { locale } = useLocale();
  const dateLocale = locale === "ar" ? "ar-DZ-u-nu-latn" : "en-GB";
  const [items, setItems] = useState<OfflineItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (loading) return;
    if (!user?.id) {
      setItems([]);
      setBusy(false);
      return;
    }

    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const snapshots = await listOfflineAttendanceRosters(user.id);
        const nextItems = await Promise.all(snapshots.map(async snapshot => {
          const scopeSnapshot = await getOfflineAttendanceScope(user.id, snapshot.schoolId).catch(() => null);
          const schoolScope = scopeSnapshot?.scope as AttendanceScope | undefined;
          const branch = schoolScope?.branches.find(item => item.id === snapshot.branchId);
          const attendanceClass = schoolScope?.classes.find(item => item.id === snapshot.classId);
          const draftScope: AttendanceDraftScope = {
            userId: user.id,
            schoolId: snapshot.schoolId,
            branchId: snapshot.branchId,
            classId: snapshot.classId,
            sessionDate: snapshot.sessionDate,
          };
          const draft = await getOfflineAttendanceDraft(draftScope).catch(() => null);
          const draftMatches = draft ? sameRoster(snapshot.roster.rows, draft.rows) : false;
          return {
            ...snapshot,
            branchName: branch?.name ?? "فرع محفوظ",
            className: attendanceClass?.name ?? "حلقة محفوظة",
            rows: draft && draftMatches ? draft.rows : snapshot.roster.rows,
            hasPendingDraft: Boolean(draft),
            draftNeedsReview: Boolean(draft && !draftMatches),
            scopeSavedAt: scopeSnapshot?.savedAt ?? null,
          };
        }));
        if (active) setItems(nextItems);
      } catch {
        if (active) setError("تعذر قراءة البيانات المحفوظة على هذا الجهاز.");
      } finally {
        if (active) setBusy(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loading, user?.id]);

  useEffect(() => {
    if (!items.some(item => item.hasPendingDraft)) return;
    const resumeSyncWhenOnline = () => {
      window.location.assign("/attendance");
    };
    window.addEventListener("online", resumeSyncWhenOnline);
    return () => window.removeEventListener("online", resumeSyncWhenOnline);
  }, [items]);

  return (
    <main dir="rtl" className="min-h-screen bg-[#F7F8F3] px-4 py-6 text-[#173B2D] md:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-2xl bg-[#0B4738] p-6 text-white shadow-sm">
          <p className="text-sm text-white/70">QuranOS</p>
          <h1 className="mt-1 text-2xl font-bold">الوضع دون اتصال</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-white/85">
            هذه نسخة محلية للقراءة ومراجعة مسودات الحضور التي سبق تحميلها على هذا الجهاز.
            لا تُعدّ البيانات المعروضة تأكيدًا لصلاحياتك الحالية، ولا تُرسل أي تغييرات إلى الخادم من هذه الصفحة.
          </p>
        </header>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900" role="status">
          <strong>تنبيه أمان:</strong> البيانات قديمة بحسب آخر وقت حفظ ظاهر لكل حلقة.
          لا تعتمد عليها لاتخاذ قرار إداري نهائي حتى يعود الاتصال وتُحدّث البيانات وتُراجع الصلاحيات.
        </section>

        {busy ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-600">جارٍ استرجاع البيانات المحلية...</div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 text-red-700">{error}</div>
        ) : !user?.id ? (
          <div className="rounded-xl border bg-white p-6 text-center">
            <h2 className="font-bold">يلزم وجود جلسة محفوظة</h2>
            <p className="mt-2 text-sm leading-7 text-gray-600">لا توجد جلسة مستخدم محلية يمكن ربط البيانات المحفوظة بها. اتصل بالإنترنت وسجّل الدخول مجددًا.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-center">
            <h2 className="font-bold">لا توجد قوائم حضور محفوظة بعد</h2>
            <p className="mt-2 text-sm leading-7 text-gray-600">افتح وحدة الحضور أثناء الاتصال بالإنترنت مرة واحدة لتحميل القوائم التي تحتاج إليها على هذا الجهاز.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(item => (
              <article key={\`\${item.schoolId}:\${item.branchId}:\${item.classId}:\${item.sessionDate}\`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-gray-50 p-4">
                  <div>
                    <h2 className="font-bold">{item.className}</h2>
                    <p className="mt-1 text-sm text-gray-600">{item.branchName} · {item.sessionDate}</p>
                    <p className="mt-1 text-xs text-gray-500">آخر حفظ: {new Date(item.savedAt).toLocaleString(dateLocale)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.hasPendingDraft && <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">مسودة غير متزامنة</span>}
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-gray-700">قراءة فقط</span>
                  </div>
                </div>
                {item.draftNeedsReview && (
                  <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    توجد مسودة محلية لم ندمجها لأننا لم نستطع التحقق من تطابق قائمة الطلاب. احتُفظ بها دون تعديل.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-right text-sm">
                    <thead className="bg-white text-gray-500">
                      <tr>
                        <th className="px-4 py-3">الطالب</th>
                        <th className="px-4 py-3">الحالة</th>
                        <th className="px-4 py-3">وقت الوصول</th>
                        <th className="px-4 py-3">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.rows.map(row => (
                        <tr key={row.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium">{row.fullName}</td>
                          <td className="px-4 py-3">{row.status ? statusLabels[row.status] ?? row.status : "غير محدد"}</td>
                          <td className="px-4 py-3">{row.arrivalTime || "—"}</td>
                          <td className="px-4 py-3">{row.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-gray-500">المزامنة الآلية الشاملة لم تُفعّل بعد؛ لا تُحذف هذه المسودات قبل مراجعتها عند عودة الاتصال.</p>
          <div className="flex flex-wrap gap-4"><Link href="/attendance" className="font-semibold text-[#0B4738] underline underline-offset-4">فتح الحضور للمزامنة عند عودة الاتصال</Link><Link href="/login" className="font-semibold text-[#0B4738] underline underline-offset-4">العودة إلى تسجيل الدخول</Link></div>
        </footer>
      </div>
    </main>
  );
}
