import { useCallback, useEffect, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import FinanceNavigation from "@/components/FinanceNavigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import { buildFinancialStatementCsv, fetchFinancialStatement, type FinancialStatement, type StatementBreakdown } from "@/lib/financial-statements-v2";

const currentMonth = () => new Date().toISOString().slice(0, 7);
const periodLabel = { open: "مفتوحة", closing: "قيد الإقفال", closed: "مغلقة" } as const;
const categoryLabels: Record<string, string> = { fee: "رسوم", registration: "تسجيل", materials: "مواد", transport: "نقل", other: "أخرى", donation: "تبرعات", grant_subsidy: "منح/إعانات", activity: "أنشطة", rent_asset: "تأجير أصول", salaries: "رواتب", supplies: "لوازم", utilities: "خدمات", maintenance: "صيانة" };

function Metric({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <Card className="p-4"><p className="text-xs text-gray-500">{label}</p><p className={`mt-2 text-xl font-bold ${strong ? "text-[#17663B]" : "text-[#173B2D]"}`}>{formatDzd(value)}</p></Card>; }
function CategoryTable({ title, rows }: { title: string; rows: StatementBreakdown[] }) { return <Card className="overflow-hidden"><div className="border-b p-4 font-bold">{title}</div>{rows.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">لا توجد بيانات.</p> : <table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3 text-right">التصنيف</th><th className="p-3 text-left">القيمة</th></tr></thead><tbody className="divide-y">{rows.map(row => <tr key={row.category}><td className="p-3">{categoryLabels[row.category] ?? row.category}</td><td className="p-3 text-left font-semibold">{formatDzd(row.amount)}</td></tr>)}</tbody></table>}</Card>; }

export default function FinancialStatements() {
  const { school } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [statement, setStatement] = useState<FinancialStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    try { setStatement(await fetchFinancialStatement(school.id, `${month}-01`)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل القائمة المالية."); setStatement(null); }
    finally { setLoading(false); }
  }, [school?.id, month]);
  useEffect(() => { void load(); }, [load]);

  const downloadCsv = () => {
    if (!statement) return;
    const blob = new Blob([buildFinancialStatementCsv(statement)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `quranos-financial-statement-${month}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="min-h-screen bg-[#F8F9FA]" dir="rtl">
    <header className="border-b bg-white px-4 py-4 md:px-6 print:border-0">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-[#173B2D]">القوائم المالية الشهرية</h1><p className="mt-1 text-xs text-gray-500">قائمة رسمية مشتقة من العمليات الفعلية، مع فصل نتيجة الأعمال عن مكان حركة النقد.</p></div><div className="flex flex-wrap gap-2 print:hidden"><Input className="w-40" type="month" value={month} onChange={e => setMonth(e.target.value)} /><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> تحديث</Button><Button variant="outline" onClick={() => window.print()} disabled={!statement}><Printer size={15} /> طباعة</Button><Button onClick={downloadCsv} disabled={!statement}><Download size={15} /> CSV</Button></div></div>
    </header>
    <FinanceNavigation currentPath="/finance/statements" className="mx-auto max-w-[1600px]" />
    <main className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 print:max-w-none print:p-0">
      {loading ? <Card className="flex min-h-48 items-center justify-center"><RefreshCw className="animate-spin text-[#17663B]" /></Card> : !statement ? <Card className="p-10 text-center text-sm text-gray-500">تعذر عرض القائمة.</Card> : <>
        <section className="hidden print:block"><h1 className="text-2xl font-bold">{school?.name ?? "QuranOS"} — القائمة المالية</h1><p>الفترة: {statement.periodMonth} إلى {statement.periodEnd}</p></section>
        <Card className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-gray-500">حالة الفترة</p><p className="font-bold">{statement.periodStatus ? periodLabel[statement.periodStatus] : "لم تبدأ دورة الإقفال"}</p></div><p className="text-xs text-gray-500">من {statement.periodMonth} إلى {statement.periodEnd}</p></div>{!statement.scopeComplete && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs leading-6 text-blue-900">أنت ترى نطاق الفروع المصرح لك بها فقط. أرصدة الخزينة وتفاصيل الحسابات أدناه تخص الحسابات الظاهرة لك، ولا يتم إظهار حسابات مدرسية مركزية خارج صلاحيتك.</p>}</Card>
        <section><h2 className="mb-3 font-bold text-[#173B2D]">الاستحقاق والتحصيل ونتيجة التشغيل</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="الاستحقاقات خلال الشهر" value={statement.accruals} /><Metric label="المتبقي المستحق بنهاية الشهر" value={statement.outstanding} /><Metric label="المتأخر بنهاية الشهر" value={statement.overdue} /><Metric label="التحصيلات خلال الشهر" value={statement.collections} /><Metric label="الإيرادات الأخرى" value={statement.otherIncome} /><Metric label="المصروفات" value={statement.expenses} /><Metric label="الرواتب المستحقة" value={statement.payroll.accrued} /><Metric label="الرواتب المدفوعة خلال الشهر" value={statement.payroll.paidInPeriod} /><Metric label="رواتب غير مدفوعة عند النهاية" value={statement.payroll.unpaidAtEnd} /><Metric label="نتيجة التشغيل" value={statement.operatingResult} strong /></div></section>
        <section><h2 className="mb-3 font-bold text-[#173B2D]">التدفقات والخزينة</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="رصيد الخزينة قبل الفترة" value={statement.cash.openingBalance} /><Metric label="قيود أرصدة افتتاحية داخل الفترة" value={statement.cash.openingBalanceEntries} /><Metric label="تدفقات داخلة خارجية" value={statement.cash.inflows} /><Metric label="تدفقات خارجة خارجية" value={statement.cash.outflows} /><Metric label="صافي النقد الخارجي" value={statement.cash.netCash} strong /><Metric label="الرصيد الختامي" value={statement.cash.closingBalance} strong /><Metric label="إيداعات يدوية" value={statement.cash.manualDeposits} /><Metric label="سحوبات يدوية" value={statement.cash.manualWithdrawals} /><Metric label="تحويلات داخلية" value={statement.cash.internalTransfers} /></div></section>
        <Card className="overflow-auto"><div className="border-b p-4 font-bold">حسب الفرع</div><table className="w-full min-w-[800px] text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3 text-right">الفرع</th><th className="p-3">استحقاقات</th><th className="p-3">تحصيلات</th><th className="p-3">إيرادات أخرى</th><th className="p-3">مصروفات</th><th className="p-3">رواتب مستحقة</th><th className="p-3">رواتب مدفوعة</th></tr></thead><tbody className="divide-y">{statement.branches.map(row => <tr key={row.branchId}><td className="p-3 font-semibold">{row.branchName}</td>{[row.accruals,row.collections,row.otherIncome,row.expenses,row.payrollAccrued,row.payrollPaid].map((value,index) => <td key={index} className="p-3 text-center">{formatDzd(value)}</td>)}</tr>)}</tbody></table></Card>
        <section className="grid gap-4 lg:grid-cols-3"><CategoryTable title="الاستحقاقات حسب التصنيف" rows={statement.categories.charges} /><CategoryTable title="الإيرادات الأخرى حسب التصنيف" rows={statement.categories.otherIncome} /><CategoryTable title="المصروفات حسب التصنيف" rows={statement.categories.expenses} /></section>
        <Card className="overflow-auto"><div className="border-b p-4 font-bold">تفصيل حسابات الخزينة</div><table className="w-full min-w-[900px] text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3 text-right">الحساب</th><th className="p-3">افتتاحي</th><th className="p-3">قيد افتتاحي</th><th className="p-3">داخل</th><th className="p-3">خارج</th><th className="p-3">تحويل داخل</th><th className="p-3">تحويل خارج</th><th className="p-3">ختامي</th></tr></thead><tbody className="divide-y">{statement.accounts.map(row => <tr key={row.accountId}><td className="p-3"><b>{row.accountName}</b><p className="font-mono text-xs text-gray-400">{row.code}</p></td>{[row.openingBalance,row.openingEntries,row.inflows,row.outflows,row.transfersIn,row.transfersOut,row.closingBalance].map((value,index) => <td key={index} className="p-3 text-center">{formatDzd(value)}</td>)}</tr>)}</tbody></table></Card>
      </>}
    </main>
  </div>;
}
