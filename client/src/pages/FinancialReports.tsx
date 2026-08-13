import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  Printer,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import FinanceNavigation from "@/components/FinanceNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import {
  buildFinancialReportCsv,
  buildFinancialReports,
  fetchFinancialReportData,
  FinancialReportPermissionError,
  type FinancialReportFilters,
  type FinancialReportPageData,
  type FinancialReports as ReportResult,
} from "@/lib/financial-reports";

type LoadState = "loading" | "ready" | "error" | "forbidden";
type ReportTab = "charges" | "payments" | "overdue" | "expenses" | "cashflow";

const chargeStatuses = ["pending", "partially_paid", "paid", "waived", "cancelled"] as const;
const paymentMethods = ["cash", "bank_transfer", "postal", "cheque", "other"] as const;
const expenseCategories = [
  "salaries",
  "rent",
  "utilities",
  "maintenance",
  "supplies",
  "transport",
  "activities",
  "other",
] as const;

const chargeStatusLabels: Record<(typeof chargeStatuses)[number], string> = {
  pending: "قيد الانتظار",
  partially_paid: "مدفوع جزئيًا",
  paid: "مدفوع",
  waived: "معفى",
  cancelled: "ملغى",
};
const paymentMethodLabels: Record<(typeof paymentMethods)[number], string> = {
  cash: "نقدًا",
  bank_transfer: "تحويل بنكي",
  postal: "بريدي",
  cheque: "صك",
  other: "أخرى",
};
const expenseCategoryLabels: Record<(typeof expenseCategories)[number], string> = {
  salaries: "رواتب قديمة/مصروفات أجور",
  rent: "الإيجار",
  utilities: "الخدمات",
  maintenance: "الصيانة",
  supplies: "اللوازم",
  transport: "النقل",
  activities: "الأنشطة",
  other: "أخرى",
};

const emptyFilters: FinancialReportFilters = {
  dateFrom: "",
  dateTo: "",
  branch: "all",
  chargeStatus: "all",
  paymentMethod: "all",
  expenseCategory: "all",
};
const selectClass = "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm";

export default function FinancialReports() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pageData, setPageData] = useState<FinancialReportPageData | null>(null);
  const [filters, setFilters] = useState<FinancialReportFilters>(emptyFilters);
  const [activeReport, setActiveReport] = useState<ReportTab>("charges");
  const [, setLocation] = useLocation();
  const { school } = useAuth();

  const loadReports = useCallback(async () => {
    if (!school?.id) {
      setLoadState("error");
      return;
    }
    setLoadState("loading");
    try {
      const data = await fetchFinancialReportData(school.id);
      setPageData(data);
      if (!data.access.canViewFinance && data.access.canViewExpenses) {
        setActiveReport("expenses");
      }
      setLoadState("ready");
    } catch (error) {
      setPageData(null);
      setLoadState(error instanceof FinancialReportPermissionError ? "forbidden" : "error");
    }
  }, [school?.id]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const reports = useMemo(
    () =>
      pageData
        ? buildFinancialReports(pageData, filters, new Date().toISOString().slice(0, 10))
        : null,
    [filters, pageData]
  );
  const branchNames = useMemo(
    () => new Map((pageData?.branches ?? []).map(branch => [branch.id, branch.name])),
    [pageData?.branches]
  );

  const updateFilter = <K extends keyof FinancialReportFilters>(
    key: K,
    value: FinancialReportFilters[K]
  ) => setFilters(current => ({ ...current, [key]: value }));

  const exportCsv = () => {
    if (!reports || !pageData) return;
    const csv = buildFinancialReportCsv(activeReport, reports, pageData.branches);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finance-${activeReport}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const scopeLabel = (branchId: string | null) =>
    branchId === null ? "مستوى المدرسة" : (branchNames.get(branchId) ?? "فرع غير متاح");

  if (loadState === "loading") {
    return <ReportShell onBack={() => setLocation("/finance")}><Card role="status" className="p-12 text-center text-gray-500"><RefreshCw className="mx-auto mb-3 animate-spin" size={24} />جارٍ إعداد التقارير المالية...</Card></ReportShell>;
  }
  if (loadState === "forbidden") {
    return <ReportShell onBack={() => setLocation("/finance")}><Card role="alert" className="border-amber-200 p-12 text-center"><ShieldAlert className="mx-auto text-amber-700" size={34} /><h2 className="mt-4 text-lg font-bold">لا تملك صلاحية التقارير</h2><p className="mt-2 text-sm leading-7 text-gray-600">يلزم finance.view أو finance.manage للتقارير المالية العامة، أو finance.expenses لتقرير المصروفات.</p></Card></ReportShell>;
  }
  if (loadState === "error" || !pageData || !reports) {
    return <ReportShell onBack={() => setLocation("/finance")}><Card role="alert" className="border-red-100 p-12 text-center"><p className="mb-4 text-red-700">تعذر تحميل التقارير المالية.</p><Button variant="outline" onClick={() => void loadReports()} className="gap-2"><RefreshCw size={16} />إعادة المحاولة</Button></Card></ReportShell>;
  }

  const tabs: Array<{ key: ReportTab; label: string; allowed: boolean }> = [
    { key: "charges", label: "الاستحقاقات", allowed: pageData.access.canViewFinance },
    { key: "payments", label: "التحصيلات", allowed: pageData.access.canViewFinance },
    { key: "overdue", label: "المتأخرات", allowed: pageData.access.canViewFinance },
    { key: "expenses", label: "المصروفات", allowed: pageData.access.canViewExpenses },
    {
      key: "cashflow",
      label: "التدفق المالي",
      allowed: pageData.access.canViewFinance && pageData.access.canViewExpenses,
    },
  ];

  return (
    <ReportShell onBack={() => setLocation("/finance")} actions={<><Button variant="outline" onClick={exportCsv}><Download size={16} />CSV</Button><Button variant="outline" onClick={() => window.print()}><Printer size={16} />طباعة</Button></>}>
      <SummaryCards data={reports} access={pageData.access} />
      <Filters filters={filters} updateFilter={updateFilter} pageData={pageData} />

      {!pageData.access.canViewExpenses && (
        <Card role="note" className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">تقرير المصروفات وصافي التدفق مخفيان لعدم وجود finance.expenses.</Card>
      )}
      {!pageData.access.canViewFinance && (
        <Card role="note" className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">الاستحقاقات والتحصيلات والرواتب مخفية لعدم وجود finance.view أو finance.manage.</Card>
      )}

      <Card className="overflow-hidden border-gray-100">
        <div className="flex gap-2 overflow-x-auto border-b p-3 print:hidden">
          {tabs.filter(tab => tab.allowed).map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveReport(tab.key)} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${activeReport === tab.key ? "bg-[#0B4738] text-white" : "bg-gray-50 text-gray-600"}`}>{tab.label}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <ReportTable report={activeReport} data={reports} scopeLabel={scopeLabel} />
        </div>
      </Card>

      <AnalyticsSummaries data={reports} canShowExpenses={pageData.access.canViewExpenses} canShowFinance={pageData.access.canViewFinance} />
    </ReportShell>
  );
}

function ReportShell({ children, onBack, actions }: { children: React.ReactNode; onBack: () => void; actions?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8F9FA]" dir="rtl">
      <header className="border-b bg-white px-4 py-4 shadow-sm print:border-0 print:shadow-none md:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="print:hidden" aria-label="العودة إلى المالية"><ArrowRight size={20} /></Button>
            <div><h1 className="text-xl font-bold text-[#2C3E50]">التقارير المالية</h1><p className="mt-0.5 text-xs text-gray-500">التحصيلات والمصروفات والرواتب ضمن الصلاحيات الحالية</p></div>
          </div>
          {actions && <div className="flex gap-2 print:hidden">{actions}</div>}
        </div>
      </header>
      <FinanceNavigation currentPath="/finance/reports" className="mx-auto max-w-[1600px]" />
      <main className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
        <div className="hidden items-center gap-2 print:flex"><FileText size={20} /><span className="font-bold">تقرير مالي</span></div>
        {children}
      </main>
    </div>
  );
}

function SummaryCards({ data, access }: { data: ReportResult; access: FinancialReportPageData["access"] }) {
  const cards = [
    ...(access.canViewFinance ? [
      ["الاستحقاقات المحتسبة", data.dueTotal, "text-[#0B4738]"],
      ["التحصيلات المكتملة", data.collectedTotal, "text-emerald-700"],
      ["المتأخرات", data.overdueTotal, "text-amber-700"],
      ["الرواتب المدفوعة", data.payrollTotal, "text-violet-700"],
    ] : []),
    ...(access.canViewExpenses ? [["المصروفات التشغيلية", data.expenseTotal, "text-rose-700"]] : []),
    ...(access.canViewFinance && access.canViewExpenses ? [
      ["إجمالي التدفقات الخارجة", data.outflowTotal, "text-rose-800"],
      ["صافي التدفق", data.netFlow, data.netFlow >= 0 ? "text-sky-700" : "text-rose-700"],
    ] : []),
  ] as Array<[string, number, string]>;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, tone]) => <Card key={label} className="p-5"><p className="text-sm text-gray-500">{label}</p><p className={`mt-2 text-xl font-bold ${tone}`}>{formatDzd(value)}</p></Card>)}</div>;
}

function Filters({ filters, updateFilter, pageData }: {
  filters: FinancialReportFilters;
  updateFilter: <K extends keyof FinancialReportFilters>(key: K, value: FinancialReportFilters[K]) => void;
  pageData: FinancialReportPageData;
}) {
  return (
    <Card className="p-4 print:hidden">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Input type="date" aria-label="تاريخ البداية" value={filters.dateFrom} onChange={event => updateFilter("dateFrom", event.target.value)} />
        <Input type="date" aria-label="تاريخ النهاية" value={filters.dateTo} onChange={event => updateFilter("dateTo", event.target.value)} />
        <select aria-label="الفرع" value={filters.branch} onChange={event => updateFilter("branch", event.target.value)} className={selectClass}>
          <option value="all">كل النطاقات المسموحة</option>
          {pageData.access.canViewExpensesSchoolWide && <option value="school">مستوى المدرسة</option>}
          {pageData.branches.filter(branch => pageData.access.financeBranchIds.includes(branch.id) || pageData.access.expenseBranchIds.includes(branch.id)).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <select aria-label="حالة الاستحقاق" value={filters.chargeStatus} onChange={event => updateFilter("chargeStatus", event.target.value)} disabled={!pageData.access.canViewFinance} className={selectClass}>
          <option value="all">كل حالات الاستحقاق</option>
          {chargeStatuses.map(status => <option key={status} value={status}>{chargeStatusLabels[status]}</option>)}
        </select>
        <select aria-label="طريقة الدفع" value={filters.paymentMethod} onChange={event => updateFilter("paymentMethod", event.target.value)} className={selectClass}>
          <option value="all">كل طرق الدفع</option>
          {paymentMethods.map(method => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}
        </select>
        <select aria-label="تصنيف المصروف" value={filters.expenseCategory} onChange={event => updateFilter("expenseCategory", event.target.value)} disabled={!pageData.access.canViewExpenses} className={selectClass}>
          <option value="all">كل تصنيفات المصروف</option>
          {expenseCategories.map(category => <option key={category} value={category}>{expenseCategoryLabels[category]}</option>)}
        </select>
        <Button variant="outline" onClick={() => Object.entries(emptyFilters).forEach(([key, value]) => updateFilter(key as keyof FinancialReportFilters, value))}>مسح الفلاتر</Button>
      </div>
    </Card>
  );
}

function ReportTable({ report, data, scopeLabel }: { report: ReportTab; data: ReportResult; scopeLabel: (branchId: string | null) => string }) {
  const empty = (span: number) => <tr><td colSpan={span} className="px-4 py-12 text-center text-gray-500">لا توجد بيانات مطابقة للفلاتر الحالية.</td></tr>;
  if (report === "charges") return <table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-gray-50"><tr><th className="p-3">الوصف</th><th className="p-3">الفرع</th><th className="p-3">الاستحقاق</th><th className="p-3">الحالة</th><th className="p-3">صافي المبلغ</th></tr></thead><tbody>{data.charges.length === 0 ? empty(5) : data.charges.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.description}</td><td className="p-3">{scopeLabel(row.branch_id)}</td><td className="p-3">{row.due_date}</td><td className="p-3">{chargeStatusLabels[row.status]}</td><td className="p-3 font-semibold">{formatDzd(Number(row.net_amount))}</td></tr>)}</tbody></table>;
  if (report === "payments") return <table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-gray-50"><tr><th className="p-3">الفرع</th><th className="p-3">التاريخ</th><th className="p-3">الطريقة</th><th className="p-3">الحالة</th><th className="p-3">المبلغ</th></tr></thead><tbody>{data.payments.length === 0 ? empty(5) : data.payments.map(row => <tr key={row.id} className="border-t"><td className="p-3">{scopeLabel(row.branch_id)}</td><td className="p-3">{row.payment_date}</td><td className="p-3">{paymentMethodLabels[row.payment_method]}</td><td className="p-3">{row.status === "completed" ? "مكتملة" : "معكوسة"}</td><td className="p-3 font-semibold">{formatDzd(Number(row.amount))}</td></tr>)}</tbody></table>;
  if (report === "overdue") return <table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-gray-50"><tr><th className="p-3">الوصف</th><th className="p-3">الفرع</th><th className="p-3">الاستحقاق</th><th className="p-3">المسدد</th><th className="p-3">المتأخر</th></tr></thead><tbody>{data.overdue.length === 0 ? empty(5) : data.overdue.map(row => <tr key={row.charge.id} className="border-t"><td className="p-3">{row.charge.description}</td><td className="p-3">{scopeLabel(row.charge.branch_id)}</td><td className="p-3">{row.charge.due_date}</td><td className="p-3">{formatDzd(row.paid)}</td><td className="p-3 font-bold text-amber-700">{formatDzd(row.outstanding)}</td></tr>)}</tbody></table>;
  if (report === "expenses") return <table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-gray-50"><tr><th className="p-3">الوصف</th><th className="p-3">النطاق</th><th className="p-3">التاريخ</th><th className="p-3">التصنيف</th><th className="p-3">الحالة</th><th className="p-3">المبلغ</th></tr></thead><tbody>{data.expenses.length === 0 ? empty(6) : data.expenses.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.description}</td><td className="p-3">{scopeLabel(row.branch_id)}</td><td className="p-3">{row.expense_date}</td><td className="p-3">{expenseCategoryLabels[row.category]}</td><td className="p-3">{row.status === "recorded" ? "مسجل" : "ملغى"}</td><td className="p-3 font-semibold">{formatDzd(Number(row.amount))}</td></tr>)}</tbody></table>;
  return <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5"><FlowCard label="التحصيلات" value={data.collectedTotal} /><FlowCard label="المصروفات التشغيلية" value={data.expenseTotal} /><FlowCard label="الرواتب المدفوعة" value={data.payrollTotal} /><FlowCard label="إجمالي الخروج" value={data.outflowTotal} /><FlowCard label="الصافي" value={data.netFlow} /></div>;
}

function FlowCard({ label, value }: { label: string; value: number }) {
  return <Card className="p-5"><p className="text-sm text-gray-500">{label}</p><p className={`mt-2 text-xl font-bold ${value < 0 ? "text-rose-700" : "text-[#0B4738]"}`}>{formatDzd(value)}</p></Card>;
}

function AnalyticsSummaries({ data, canShowExpenses, canShowFinance }: { data: ReportResult; canShowExpenses: boolean; canShowFinance: boolean }) {
  return <section><h2 className="mb-3 text-lg font-bold">الملخصات التحليلية</h2><div className="grid gap-4 xl:grid-cols-2"><SummaryTable title="حسب الفرع" header="النطاق" rows={data.byBranch.map(row => ({ key: row.key, label: row.label, due: row.due, collected: row.collected, expenses: row.expenses, payroll: row.payroll, net: row.net }))} canShowExpenses={canShowExpenses} canShowFinance={canShowFinance} /><SummaryTable title="حسب الشهر" header="الشهر" rows={data.byMonth.map(row => ({ key: row.month, label: row.month, due: row.due, collected: row.collected, expenses: row.expenses, payroll: row.payroll, net: row.net }))} canShowExpenses={canShowExpenses} canShowFinance={canShowFinance} /></div></section>;
}

function SummaryTable({ title, header, rows, canShowExpenses, canShowFinance }: { title: string; header: string; rows: Array<{ key: string; label: string; due: number; collected: number; expenses: number; payroll: number; net: number }>; canShowExpenses: boolean; canShowFinance: boolean }) {
  return <Card className="overflow-hidden"><h3 className="p-4 font-bold">{title}</h3><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead className="bg-gray-50"><tr><th className="p-3">{header}</th><th className="p-3">الاستحقاق</th><th className="p-3">التحصيل</th><th className="p-3">تشغيلي</th><th className="p-3">رواتب</th><th className="p-3">الصافي</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد بيانات</td></tr> : rows.map(row => <tr key={row.key} className="border-t"><td className="p-3">{row.label}</td><td className="p-3">{canShowFinance ? formatDzd(row.due) : "ممنوع"}</td><td className="p-3">{canShowFinance ? formatDzd(row.collected) : "ممنوع"}</td><td className="p-3">{canShowExpenses ? formatDzd(row.expenses) : "ممنوع"}</td><td className="p-3">{canShowFinance ? formatDzd(row.payroll) : "ممنوع"}</td><td className="p-3 font-semibold">{canShowExpenses && canShowFinance ? formatDzd(row.net) : "ممنوع"}</td></tr>)}</tbody></table></div></Card>;
}
