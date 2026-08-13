import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2, RefreshCw, RotateCcw, Scale, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import FinanceNavigation from "@/components/FinanceNavigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import {
  closeFinancialPeriod,
  fetchFinancialPeriodWorkspace,
  financialPeriodErrorMessage,
  recordTreasuryPeriodReconciliation,
  reopenFinancialPeriod,
  startFinancialPeriodClosing,
  type FinancialPeriodStatus,
  type FinancialPeriodWorkspace,
  type PeriodAccount,
} from "@/lib/financial-periods";

const statusLabel: Record<FinancialPeriodStatus, string> = { open: "مفتوحة", closing: "قيد الإقفال", closed: "مغلقة" };
const actionLabel = { create: "إنشاء الفترة", start_closing: "بدء الإقفال", close: "إغلاق الفترة", reopen: "إعادة فتح" } as const;
const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthEnd = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export default function FinancialPeriodClose() {
  const { school } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [workspace, setWorkspace] = useState<FinancialPeriodWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    try { setWorkspace(await fetchFinancialPeriodWorkspace(school.id, `${month}-01`)); }
    catch (error) { toast.error(financialPeriodErrorMessage(error)); setWorkspace(null); }
    finally { setLoading(false); }
  }, [school?.id, month]);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await action(); toast.success(success); await load(); }
    catch (error) { toast.error(financialPeriodErrorMessage(error)); }
    finally { setBusy(false); }
  };

  const reconcile = (account: PeriodAccount) => {
    if (!school?.id || !workspace?.period) return;
    const actualText = window.prompt(`الرصيد الفعلي للحساب «${account.name}» بالعملة المحددة:`, String(account.systemBalance));
    if (actualText === null) return;
    const actual = Number(actualText.replace(",", "."));
    if (!Number.isFinite(actual)) { toast.error("أدخل رصيدًا رقميًا صحيحًا."); return; }
    const evidenceDate = window.prompt("تاريخ العد النقدي أو كشف الحساب (YYYY-MM-DD):", monthEnd(month))?.trim();
    if (!evidenceDate) { toast.error("تاريخ العد أو كشف الحساب مطلوب."); return; }
    let reference: string | null = null;
    if (account.accountType !== "cash") {
      reference = window.prompt(account.accountType === "bank" ? "مرجع كشف البنك:" : "مرجع كشف الحساب البريدي:");
      if (!reference?.trim()) { toast.error("مرجع كشف الحساب مطلوب."); return; }
    }
    const notes = window.prompt("ملاحظة المطابقة (اختيارية):")?.trim() || null;
    void run(
      () => recordTreasuryPeriodReconciliation(school.id, workspace.period!.id, account.id, actual, evidenceDate, reference?.trim() || null, notes),
      "تم حفظ مطابقة جديدة دون الكتابة فوق السجل السابق.",
    );
  };

  const period = workspace?.period ?? null;
  return (
    <div className="min-h-screen bg-[#F8F9FA]" dir="rtl">
      <header className="border-b bg-white px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-bold text-[#173B2D]">إقفال الفترة المالية</h1><p className="mt-1 text-xs text-gray-500">إقفال شهري مدقق: مطابقة الخزينة أولًا، ثم منع أي تعديل عادي بتاريخ يعود للفترة.</p></div>
          <div className="flex items-center gap-2 print:hidden"><Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" /><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> تحديث</Button></div>
        </div>
      </header>
      <FinanceNavigation currentPath="/finance/period-close" className="mx-auto max-w-[1600px]" />
      <main className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3"><CalendarCheck2 className="text-[#17663B]" /><div><p className="text-xs text-gray-500">حالة {month}</p><h2 className="text-lg font-bold">{period ? statusLabel[period.status] : "مفتوحة ضمنيًا — لم تبدأ دورة الإقفال"}</h2>{period?.closedAt && <p className="mt-1 text-xs text-gray-500">أغلقت في {new Date(period.closedAt).toLocaleString("ar-DZ-u-nu-latn")}</p>}</div></div>
            {workspace?.canManageSchool && school?.id && <div className="flex flex-wrap gap-2 print:hidden">
              {(!period || period.status === "open") && <Button disabled={busy} onClick={() => void run(() => startFinancialPeriodClosing(school.id, `${month}-01`), "بدأت مرحلة الإقفال وأصبحت العمليات المؤرخة داخل الشهر محمية.")}><ShieldCheck size={16} /> بدء الإقفال</Button>}
              {period?.status === "closing" && <Button disabled={busy} onClick={() => void run(() => closeFinancialPeriod(school.id, period.id), "أغلقت الفترة المالية بعد اكتمال المطابقة.")}><Scale size={16} /> إغلاق نهائي</Button>}
              {period && period.status !== "open" && <Button variant="outline" disabled={busy} onClick={() => { const reason = window.prompt("سبب إعادة فتح الفترة للتصحيح (يسجل في سجل التدقيق):"); if (reason?.trim()) void run(() => reopenFinancialPeriod(school.id, period.id, reason.trim()), "أعيد فتح الفترة للتصحيح المدقق."); }}><RotateCcw size={16} /> إعادة فتح للتصحيح</Button>}
            </div>}
          </div>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">عند بدء الإقفال يتوقف التسجيل أو التعديل العادي بتاريخ داخل الشهر. إذا ظهر فرق، أعد فتح الفترة بسبب موثق، سجّل التصحيح، ثم أعد المطابقة والإقفال. المطابقات القديمة تبقى محفوظة.</p>
        </Card>

        <section>
          <div className="mb-3"><h2 className="font-bold text-[#173B2D]">مطابقة حسابات الخزينة</h2><p className="text-xs text-gray-500">الصندوق يطابق العد النقدي، والحساب البنكي/البريدي يطابق كشف الحساب المؤرخ بنهاية الفترة.</p></div>
          {loading ? <Card className="flex min-h-40 items-center justify-center"><RefreshCw className="animate-spin text-[#17663B]" /></Card> : !workspace?.accounts.length ? <Card className="p-8 text-center text-sm text-gray-500">لا توجد حسابات خزينة ظاهرة ضمن صلاحياتك.</Card> : <div className="grid gap-4 lg:grid-cols-2">{workspace.accounts.map(account => {
            const rec = account.latestReconciliation;
            return <Card key={account.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{account.name}</h3><p className="text-xs text-gray-500">{account.code} · {account.accountType === "cash" ? "صندوق نقدي" : account.accountType === "bank" ? "حساب بنكي" : "حساب بريدي"}</p></div><span className={`rounded-full px-2 py-1 text-xs ${rec && rec.difference === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{rec ? (rec.difference === 0 ? "مطابق" : "يوجد فرق") : "غير مطابق"}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">رصيد النظام بنهاية الفترة</p><p className="mt-1 font-bold">{formatDzd(account.systemBalance)}</p></div><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">آخر رصيد فعلي</p><p className="mt-1 font-bold">{rec ? formatDzd(rec.actualBalance) : "—"}</p></div></div>{rec && <div className="mt-3 text-xs text-gray-500"><span>الفرق: <b className={rec.difference === 0 ? "text-emerald-700" : "text-red-700"}>{formatDzd(rec.difference)}</b></span><span className="mx-2">·</span><span>سُجلت {new Date(rec.reconciledAt).toLocaleString("ar-DZ-u-nu-latn")}</span>{rec.evidenceReference && <p className="mt-1">المرجع: {rec.evidenceReference}</p>}</div>}{period && period.status !== "closed" && account.canManage && <Button className="mt-4 print:hidden" size="sm" variant="outline" disabled={busy} onClick={() => reconcile(account)}>تسجيل مطابقة جديدة</Button>}</Card>;
          })}</div>}
        </section>

        {workspace?.canManageSchool && workspace.events.length > 0 && <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-bold">سجل أحداث الفترة</h2></div><div className="divide-y">{workspace.events.map((event, index) => <div key={`${event.createdAt}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm"><div><b>{actionLabel[event.action]}</b>{event.reason && <p className="mt-1 text-xs text-gray-500">{event.reason}</p>}</div><span className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString("ar-DZ-u-nu-latn")}</span></div>)}</div></Card>}
      </main>
    </div>
  );
}
