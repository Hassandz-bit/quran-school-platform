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
} from "@/lib/financial-reports";

type LoadState = "loading" | "ready" | "error" | "forbidden";
type ReportTab =
  | "charges"
  | "payments"
  | "overdue"
  | "expenses"
  | "cashflow";

const chargeStatuses = [
  "pending",
  "partially_paid",
  "paid",
  "waived",
  "cancelled",
] as const;
const paymentMethods = [
  "cash",
  "bank_transfer",
  "postal",
  "cheque",
  "other",
] as const;
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
const expenseCategoryLabels: Record<
  (typeof expenseCategories)[number],
  string
> = {
  salaries: "الرواتب",
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

const selectClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm";

export default function FinancialReports() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pageData, setPageData] =
    useState<FinancialReportPageData | null>(null);
  const [filters, setFilters] =
    useState<FinancialReportFilters>(emptyFilters);
  const [activeReport, setActiveReport] =
    useState<ReportTab>("charges");
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
      setLoadState(
        error instanceof FinancialReportPermissionError
          ? "forbidden"
          : "error"
      );
    }
  }, [school?.id]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const reports = useMemo(
    () =>
      pageData
        ? buildFinancialReports(
            pageData,
            filters,
            new Date().toISOString().slice(0, 10)
          )
        : null,
    [filters, pageData]
  );
  const branchNames = useMemo(
    () =>
      new Map(
        (pageData?.branches ?? []).map(branch => [branch.id, branch.name])
      ),
    [pageData?.branches]
  );

  const updateFilter = <K extends keyof FinancialReportFilters>(
    key: K,
    value: FinancialReportFilters[K]
  ) => setFilters(current => ({ ...current, [key]: value }));

  const exportCsv = () => {
    if (!reports || !pageData) return;
    const csv = buildFinancialReportCsv(
      activeReport,
      reports,
      pageData.branches
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finance-${activeReport}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const scopeLabel = (branchId: string | null) =>
    branchId === null
      ? "مستوى المدرسة"
      : (branchNames.get(branchId) ?? "فرع غير متاح");

  const tabs: Array<{ key: ReportTab; label: string; allowed: boolean }> =
    pageData
      ? [
          {
            key: "charges",
            label: "الاستحقاقات",
            allowed: pageData.access.canViewFinance,
          },
          {
            key: "payments",
            label: "التحصيلات",
            allowed: pageData.access.canViewFinance,
          },
          {
            key: "overdue",
            label: "المتأخرات",
            allowed: pageData.access.canViewFinance,
          },
          {
            key: "expenses",
            label: "المصروفات",
            allowed: pageData.access.canViewExpenses,
          },
          {
            key: "cashflow",
            label: "صافي التدفق",
            allowed:
              pageData.access.canViewFinance &&
              pageData.access.canViewExpenses,
          },
        ]
      : [];

  const renderFilters = () => (
    <Card className="border border-gray-100 bg-white p-4 print:hidden">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Input
          type="date"
          aria-label="تاريخ البداية"
          value={filters.dateFrom}
          onChange={event => updateFilter("dateFrom", event.target.value)}
          className="h-10"
        />
        <Input
          type="date"
          aria-label="تاريخ النهاية"
          value={filters.dateTo}
          onChange={event => updateFilter("dateTo", event.target.value)}
          className="h-10"
        />
        <select
          aria-label="الفرع"
          value={filters.branch}
          onChange={event => updateFilter("branch", event.target.value)}
          className={selectClass}
        >
          <option value="all">كل النطاقات المسموحة</option>
          {pageData?.access.canViewExpensesSchoolWide && (
            <option value="school">مستوى المدرسة</option>
          )}
          {pageData?.branches
            .filter(
              branch =>
                pageData.access.financeBranchIds.includes(branch.id) ||
                pageData.access.expenseBranchIds.includes(branch.id)
            )
            .map(branch => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
        </select>
        <select
          aria-label="حالة الاستحقاق"
          value={filters.chargeStatus}
          onChange={event =>
            updateFilter("chargeStatus", event.target.value)
          }
          disabled={!pageData?.access.canViewFinance}
          className={selectClass}
        >
          <option value="all">كل حالات الاستحقاق</option>
          {chargeStatuses.map(status => (
            <option key={status} value={status}>
              {chargeStatusLabels[status]}
            </option>
          ))}
        </select>
        <select
          aria-label="طريقة الدفع"
          value={filters.paymentMethod}
          onChange={event =>
            updateFilter("paymentMethod", event.target.value)
          }
          className={selectClass}
        >
          <option value="all">كل طرق الدفع</option>
          {paymentMethods.map(method => (
            <option key={method} value={method}>
              {paymentMethodLabels[method]}
            </option>
          ))}
        </select>
        <select
          aria-label="تصنيف المصروف"
          value={filters.expenseCategory}
          onChange={event =>
            updateFilter("expenseCategory", event.target.value)
          }
          disabled={!pageData?.access.canViewExpenses}
          className={selectClass}
        >
          <option value="all">كل تصنيفات المصروف</option>
          {expenseCategories.map(category => (
            <option key={category} value={category}>
              {expenseCategoryLabels[category]}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFilters(emptyFilters)}
        >
          مسح الفلاتر
        </Button>
      </div>
    </Card>
  );

  const renderSummaryCards = () => {
    if (!reports || !pageData) return null;
    const cards = [
      ...(pageData.access.canViewFinance
        ? [
            {
              label: "الاستحقاقات المحتسبة",
              value: reports.dueTotal,
              tone: "text-[#0B4738]",
            },
            {
              label: "التحصيلات المكتملة",
              value: reports.collectedTotal,
              tone: "text-emerald-700",
            },
            {
              label: "المتأخرات",
              value: reports.overdueTotal,
              tone: "text-amber-700",
            },
          ]
        : []),
      ...(pageData.access.canViewExpenses
        ? [
            {
              label: "المصروفات المسجلة",
              value: reports.expenseTotal,
              tone: "text-rose-700",
            },
          ]
        : []),
      ...(pageData.access.canViewFinance && pageData.access.canViewExpenses
        ? [
            {
              label: "صافي التدفق",
              value: reports.netFlow,
              tone:
                reports.netFlow >= 0 ? "text-sky-700" : "text-rose-700",
            },
          ]
        : []),
    ];
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(card => (
          <Card key={card.label} className="border border-gray-100 bg-white p-5">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className={`mt-2 text-xl font-bold ${card.tone}`}>
              {formatDzd(card.value)}
            </p>
          </Card>
        ))}
      </div>
    );
  };

  const emptyRow = (colSpan: number) => (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-gray-500">
        لا توجد بيانات مطابقة للفلاتر الحالية.
      </td>
    </tr>
  );

  const renderReportTable = () => {
    if (!reports || !pageData) return null;
    if (activeReport === "charges") {
      return (
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">الوصف</th>
              <th className="px-4 py-3">الفرع</th>
              <th className="px-4 py-3">الاستحقاق</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">صافي المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.charges.length === 0
              ? emptyRow(5)
              : reports.charges.map(row => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.description}</td>
                    <td className="px-4 py-3">{scopeLabel(row.branch_id)}</td>
                    <td className="px-4 py-3">{row.due_date}</td>
                    <td className="px-4 py-3">
                      {chargeStatusLabels[row.status]}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {formatDzd(Number(row.net_amount))}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      );
    }
    if (activeReport === "payments") {
      return (
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">الفرع</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الطريقة</th>
              <th className="px-4 py-3">المرجع</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.payments.length === 0
              ? emptyRow(6)
              : reports.payments.map(row => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{scopeLabel(row.branch_id)}</td>
                    <td className="px-4 py-3">{row.payment_date}</td>
                    <td className="px-4 py-3">
                      {paymentMethodLabels[row.payment_method]}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.reference_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "completed" ? "مكتملة" : "معكوسة"}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {formatDzd(Number(row.amount))}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      );
    }
    if (activeReport === "overdue") {
      return (
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">الوصف</th>
              <th className="px-4 py-3">الفرع</th>
              <th className="px-4 py-3">تاريخ الاستحقاق</th>
              <th className="px-4 py-3">المسدد</th>
              <th className="px-4 py-3">الرصيد المتأخر</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.overdue.length === 0
              ? emptyRow(5)
              : reports.overdue.map(row => (
                  <tr key={row.charge.id}>
                    <td className="px-4 py-3">{row.charge.description}</td>
                    <td className="px-4 py-3">
                      {scopeLabel(row.charge.branch_id)}
                    </td>
                    <td className="px-4 py-3">{row.charge.due_date}</td>
                    <td className="px-4 py-3">{formatDzd(row.paid)}</td>
                    <td className="px-4 py-3 font-bold text-amber-700">
                      {formatDzd(row.outstanding)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      );
    }
    if (activeReport === "expenses") {
      return (
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">الوصف</th>
              <th className="px-4 py-3">النطاق</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">التصنيف</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.expenses.length === 0
              ? emptyRow(6)
              : reports.expenses.map(row => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.description}</td>
                    <td className="px-4 py-3">{scopeLabel(row.branch_id)}</td>
                    <td className="px-4 py-3">{row.expense_date}</td>
                    <td className="px-4 py-3">
                      {expenseCategoryLabels[row.category]}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "recorded" ? "مسجل" : "ملغى"}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {formatDzd(Number(row.amount))}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <Card className="border border-emerald-100 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-700">التحصيلات المكتملة</p>
          <p className="mt-2 text-xl font-bold text-emerald-800">
            {formatDzd(reports.collectedTotal)}
          </p>
        </Card>
        <Card className="border border-rose-100 bg-rose-50 p-5">
          <p className="text-sm text-rose-700">المصروفات المسجلة</p>
          <p className="mt-2 text-xl font-bold text-rose-800">
            {formatDzd(reports.expenseTotal)}
          </p>
        </Card>
        <Card className="border border-sky-100 bg-sky-50 p-5">
          <p className="text-sm text-sky-700">صافي التدفق المالي</p>
          <p className="mt-2 text-xl font-bold text-sky-800">
            {formatDzd(reports.netFlow)}
          </p>
        </Card>
      </div>
    );
  };

  const renderAmountSummary = (
    title: string,
    rows: Array<{ key: string; count: number; amount: number }>,
    label: (key: string) => string
  ) => (
    <Card className="border border-gray-100 bg-white p-5">
      <h3 className="font-bold text-[#2C3E50]">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">لا توجد بيانات.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map(row => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-gray-600">
                {label(row.key)} ({row.count})
              </span>
              <span className="font-semibold">{formatDzd(row.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const renderSummaries = () => {
    if (!reports || !pageData) return null;
    return (
      <section className="mt-6">
        <h2 className="mb-4 text-lg font-bold text-[#2C3E50]">
          الملخصات التحليلية
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden border border-gray-100 bg-white">
            <h3 className="p-5 font-bold text-[#2C3E50]">حسب الفرع</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-right text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3">النطاق</th>
                    <th className="px-4 py-3">الاستحقاق</th>
                    <th className="px-4 py-3">التحصيل</th>
                    <th className="px-4 py-3">المصروف</th>
                    <th className="px-4 py-3">الصافي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.byBranch.map(row => (
                    <tr key={row.key}>
                      <td className="px-4 py-3">{row.label}</td>
                      <td className="px-4 py-3">{formatDzd(row.due)}</td>
                      <td className="px-4 py-3">
                        {formatDzd(row.collected)}
                      </td>
                      <td className="px-4 py-3">
                        {pageData.access.canViewExpenses
                          ? formatDzd(row.expenses)
                          : "ممنوع"}
                      </td>
                      <td className="px-4 py-3">
                        {pageData.access.canViewExpenses &&
                        pageData.access.canViewFinance
                          ? formatDzd(row.net)
                          : "ممنوع"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="overflow-hidden border border-gray-100 bg-white">
            <h3 className="p-5 font-bold text-[#2C3E50]">حسب الشهر</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-right text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3">الشهر</th>
                    <th className="px-4 py-3">الاستحقاق</th>
                    <th className="px-4 py-3">التحصيل</th>
                    <th className="px-4 py-3">المصروف</th>
                    <th className="px-4 py-3">الصافي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.byMonth.map(row => (
                    <tr key={row.month}>
                      <td className="px-4 py-3">{row.month}</td>
                      <td className="px-4 py-3">{formatDzd(row.due)}</td>
                      <td className="px-4 py-3">
                        {formatDzd(row.collected)}
                      </td>
                      <td className="px-4 py-3">
                        {pageData.access.canViewExpenses
                          ? formatDzd(row.expenses)
                          : "ممنوع"}
                      </td>
                      <td className="px-4 py-3">
                        {pageData.access.canViewExpenses &&
                        pageData.access.canViewFinance
                          ? formatDzd(row.net)
                          : "ممنوع"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {pageData.access.canViewFinance &&
            renderAmountSummary(
              "حسب حالة الاستحقاق",
              reports.byChargeStatus,
              key =>
                chargeStatusLabels[
                  key as keyof typeof chargeStatusLabels
                ] ?? key
            )}
          {pageData.access.canViewFinance &&
            renderAmountSummary(
              "حسب طريقة الدفع",
              reports.byPaymentMethod,
              key =>
                paymentMethodLabels[
                  key as keyof typeof paymentMethodLabels
                ] ?? key
            )}
          {pageData.access.canViewExpenses &&
            renderAmountSummary(
              "حسب تصنيف المصروف",
              reports.byExpenseCategory,
              key =>
                expenseCategoryLabels[
                  key as keyof typeof expenseCategoryLabels
                ] ?? key
            )}
        </div>
      </section>
    );
  };

  const renderContent = () => {
    if (loadState === "loading") {
      return (
        <Card
          role="status"
          className="border border-gray-100 bg-white p-12 text-center text-gray-500"
        >
          <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
          جارٍ إعداد التقارير المالية...
        </Card>
      );
    }
    if (loadState === "forbidden") {
      return (
        <Card
          role="alert"
          className="border border-amber-200 bg-white p-12 text-center"
        >
          <ShieldAlert className="mx-auto text-amber-700" size={34} />
          <h2 className="mt-4 text-lg font-bold">لا تملك صلاحية التقارير</h2>
          <p className="mt-2 text-sm leading-7 text-gray-600">
            يلزم finance.view أو finance.manage للتقارير المالية العامة، أو
            finance.expenses لتقرير المصروفات.
          </p>
        </Card>
      );
    }
    if (loadState === "error" || !pageData || !reports) {
      return (
        <Card
          role="alert"
          className="border border-red-100 bg-white p-12 text-center"
        >
          <p className="mb-4 text-red-700">تعذر تحميل التقارير المالية.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadReports()}
            className="gap-2"
          >
            <RefreshCw size={16} />
            إعادة المحاولة
          </Button>
        </Card>
      );
    }

    return (
      <>
        {renderSummaryCards()}
        <div className="mt-4">{renderFilters()}</div>
        {!pageData.access.canViewExpenses && (
          <Card
            role="note"
            className="mt-4 border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-800"
          >
            تقرير المصروفات وصافي التدفق مخفيان لأن الحساب لا يملك
            finance.expenses. تقارير الاستحقاقات والتحصيلات والمتأخرات ما
            زالت متاحة.
          </Card>
        )}
        {!pageData.access.canViewFinance && (
          <Card
            role="note"
            className="mt-4 border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-800"
          >
            تقارير الاستحقاقات والتحصيلات والمتأخرات مخفية لعدم وجود
            finance.view أو finance.manage. تقرير المصروفات ما زال متاحًا.
          </Card>
        )}

        <Card className="mt-4 overflow-hidden border border-gray-100 bg-white">
          <div className="flex gap-2 overflow-x-auto border-b border-gray-100 p-3 print:hidden">
            {tabs
              .filter(tab => tab.allowed)
              .map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveReport(tab.key)}
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
                    activeReport === tab.key
                      ? "bg-[#0B4738] text-white"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
          </div>
          <div className="overflow-x-auto">{renderReportTable()}</div>
        </Card>
        {renderSummaries()}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]" dir="rtl">
      <header className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm print:border-0 print:shadow-none md:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/finance")}
              className="print:hidden"
              aria-label="العودة إلى المالية"
            >
              <ArrowRight size={20} />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-[#2C3E50]">
                التقارير المالية
              </h1>
              <p className="mt-0.5 text-xs text-gray-500">
                تقارير مباشرة من Supabase ضمن RLS ونطاق الفروع
              </p>
            </div>
          </div>
          {loadState === "ready" && (
            <div className="flex gap-2 print:hidden">
              <Button type="button" variant="outline" onClick={exportCsv}>
                <Download size={16} />
                CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                طباعة
              </Button>
            </div>
          )}
        </div>
      </header>
      <FinanceNavigation
        currentPath="/finance/reports"
        className="mx-auto max-w-[1600px]"
      />
      <main className="mx-auto max-w-[1600px] p-4 md:p-6">
        <div className="mb-5 hidden items-center gap-2 print:flex">
          <FileText size={20} />
          <span className="font-bold">تقرير مالي</span>
        </div>
        {renderContent()}
      </main>
    </div>
  );
}
