import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import FinanceNavigation from "@/components/FinanceNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import { fetchTreasuryBootstrap, treasuryAccountTypeLabel, treasuryErrorMessage, type TreasuryAccount } from "@/lib/treasury";
import { fetchTreasuryReconciliation, linkTreasuryBusinessSource, reconciliationSourceLabel, type TreasuryReconciliation, type UnlinkedTreasurySource } from "@/lib/treasury-reconciliation";

type State = "loading" | "ready" | "error";

export default function TreasuryReconciliationPage() {
  const { school } = useAuth();
  const [state, setState] = useState<State>("loading");
  const [data, setData] = useState<TreasuryReconciliation | null>(null);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setState("loading");
    try {
      const [report, bootstrap] = await Promise.all([
        fetchTreasuryReconciliation(school.id),
        fetchTreasuryBootstrap(school.id),
      ]);
      setData(report);
      setAccounts(bootstrap.accounts.filter(account => account.status === "active" && account.canManage));
      setState("ready");
    } catch (error) {
      toast.error(treasuryErrorMessage(error));
      setState("error");
    }
  }, [school?.id]);

  useEffect(() => { void load(); }, [load]);

  const compatible = useCallback((source: UnlinkedTreasurySource) => accounts.filter(account =>
    source.branchId === null
      ? account.branchId === null
      : account.branchId === source.branchId || account.branchId === null
  ), [accounts]);

  const matched = data ? data.unmatched.count === 0 : false;
  const businessNet = data?.business.net ?? 0;
  const treasuryNet = data?.linked.net ?? 0;

  const accountName = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts]);

  const link = async (source: UnlinkedTreasurySource) => {
    if (!school?.id) return;
    const options = compatible(source);
    const accountId = selected[source.sourceId] || options[0]?.id;
    if (!accountId) {
      toast.error("لا يوجد حساب خزينة قابل للربط في نطاق هذه العملية.");
      return;
    }
    setBusyId(source.sourceId);
    try {
      const ok = await linkTreasuryBusinessSource(school.id, source.sourceType, source.sourceId, accountId);
      if (!ok) throw new Error("TREASURY_MANAGE_REQUIRED");
      toast.success(`تم ربط ${source.label} بحساب ${accountName.get(accountId) ?? "الخزينة"}.`);
      await load();
    } catch (error) {
      toast.error(treasuryErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  if (state === "loading") return <main className="flex min-h-[70vh] items-center justify-center" dir="rtl"><RefreshCw className="animate-spin text-[#17663B]" /></main>;
  if (state === "error" || !data) return <main className="p-8 text-center" dir="rtl"><Card className="mx-auto max-w-xl p-10"><p>تعذر تحميل المطابقة.</p><Button className="mt-4" variant="outline" onClick={() => void load()}>إعادة المحاولة</Button></Card></main>;

  return <div className="min-h-screen bg-[#F8F9FA]" dir="rtl">
    <header className="border-b bg-white px-4 py-4 md:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-[#173B2D]">مطابقة الخزينة</h1><p className="mt-1 text-xs text-gray-500">نقارن العمليات التجارية بحركات الخزينة دون احتساب أي حركة مرتين.</p></div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw size={15} /> تحديث</Button>
      </div>
    </header>
    <FinanceNavigation currentPath="/finance/treasury/reconciliation" className="mx-auto max-w-[1600px]" />
    <main className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="التدفقات الداخلة التجارية" value={data.business.totalInflows} />
        <Metric label="التدفقات الخارجة التجارية" value={data.business.totalOutflows} />
        <Metric label="الصافي التجاري" value={businessNet} />
        <Metric label="الصافي المرتبط بالخزينة" value={treasuryNet} />
      </section>

      <Card className={`border p-5 ${matched ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start gap-3">
          {matched ? <CheckCircle2 className="mt-0.5 text-emerald-700" /> : <AlertTriangle className="mt-0.5 text-amber-700" />}
          <div><h2 className="font-bold">{matched ? "الخزينة مطابقة للعمليات المربوطة" : `يوجد ${data.unmatched.count} عملية غير مربوطة`}</h2><p className="mt-1 text-sm">فرق الداخل: {formatDzd(data.unmatched.inflows)} · فرق الخارج: {formatDzd(data.unmatched.outflows)}</p></div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5"><h2 className="font-bold">مصادر التدفق التجاري</h2><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Line label="دفعات الطلاب" value={data.business.studentPayments} /><Line label="إيرادات أخرى" value={data.business.otherIncome} /><Line label="المصروفات" value={data.business.expenses} /><Line label="الرواتب المدفوعة" value={data.business.payroll} /></div></Card>
        <Card className="p-5"><h2 className="font-bold">حركات لا تدخل في الإيراد/المصروف</h2><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Line label="إيداعات يدوية" value={data.adjustments.manualDeposits} /><Line label="سحوبات يدوية" value={data.adjustments.manualWithdrawals} /><Line label="تحويلات داخلية" value={data.adjustments.internalTransfers} /></div><p className="mt-3 text-xs leading-6 text-gray-500">التحويلات والتسويات تؤثر على أرصدة الحسابات فقط، ولا تغيّر صافي الإيراد/المصروف التجاري.</p></Card>
      </section>

      <Card className="overflow-hidden">
        <div className="border-b p-4"><h2 className="font-bold">العمليات غير المربوطة بحساب</h2><p className="text-xs text-gray-500">اختر حسابًا فعليًا للعملية. الربط ينشئ حركة الخزينة تلقائيًا ويحفظ العملية الأصلية كما هي.</p></div>
        {data.unlinkedSources.length === 0 ? <p className="p-10 text-center text-sm text-gray-400">لا توجد عمليات تحتاج مطابقة.</p> : <div className="divide-y">{data.unlinkedSources.map(source => {
          const options = compatible(source);
          return <div key={`${source.sourceType}:${source.sourceId}`} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div><p className="font-bold text-sm">{source.label || reconciliationSourceLabel(source.sourceType)}</p><p className="mt-1 text-xs text-gray-500">{source.sourceDate}{source.referenceNumber ? ` · ${source.referenceNumber}` : ""} · {source.direction === "in" ? "دخول" : "خروج"} {formatDzd(source.amount)}</p></div>
            <select className="h-10 min-w-[220px] rounded-lg border bg-white px-3 text-sm" value={selected[source.sourceId] || options[0]?.id || ""} onChange={event => setSelected(current => ({ ...current, [source.sourceId]: event.target.value }))} disabled={!source.canManage || options.length === 0}>
              {options.length === 0 ? <option value="">لا يوجد حساب متوافق</option> : options.map(account => <option key={account.id} value={account.id}>{account.name} · {treasuryAccountTypeLabel(account.accountType)} · {formatDzd(account.balance)}</option>)}
            </select>
            <Button disabled={!source.canManage || options.length === 0 || busyId === source.sourceId} onClick={() => void link(source)}><Link2 size={15} /> {busyId === source.sourceId ? "جارٍ الربط" : "ربط"}</Button>
          </div>;
        })}</div>}
      </Card>

      <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-bold">أرصدة الحسابات</h2></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map(account => <div key={account.id} className="rounded-xl border bg-white p-4"><p className="font-bold">{account.name}</p><p className="text-xs text-gray-500">{account.code}</p><p className={`mt-3 text-xl font-bold ${account.balance >= 0 ? "text-[#17663B]" : "text-red-700"}`}>{formatDzd(account.balance)}</p></div>)}</div></Card>
    </main>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-4"><p className="text-xs text-gray-500">{label}</p><p className={`mt-2 text-xl font-bold ${value >= 0 ? "text-[#173B2D]" : "text-red-700"}`}>{formatDzd(value)}</p></Card>; }
function Line({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"><span className="text-gray-600">{label}</span><strong>{formatDzd(value)}</strong></div>; }
