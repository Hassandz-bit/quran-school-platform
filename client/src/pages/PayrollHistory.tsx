import { useCallback, useEffect, useMemo, useState } from "react";
import { History, RefreshCw, RotateCcw, WalletCards } from "lucide-react";
import FinanceNavigation from "@/components/FinanceNavigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import {
  PAYROLL_ENTRY_STATUS_LABELS,
  PAYROLL_PAYMENT_METHOD_LABELS,
  fetchPayrollScopes,
  type PayrollScope,
} from "@/lib/payroll";
import {
  fetchPayrollHistory,
  type PayrollHistoryRow,
} from "@/lib/payroll-history";

type LoadState = "loading" | "ready" | "forbidden" | "error";

export default function PayrollHistory() {
  const { school } = useAuth();
  const [scopes, setScopes] = useState<PayrollScope[]>([]);
  const [scopeKey, setScopeKey] = useState("");
  const [rows, setRows] = useState<PayrollHistoryRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [payeeKey, setPayeeKey] = useState("all");

  const selectedScope = useMemo(
    () => scopes.find(scope => (scope.branchId ?? "school") === scopeKey) ?? null,
    [scopeKey, scopes]
  );

  const loadScopes = useCallback(async () => {
    if (!school?.id) return;
    try {
      const next = await fetchPayrollScopes(school.id);
      setScopes(next);
      if (next.length === 0) {
        setLoadState("forbidden");
        return;
      }
      setScopeKey(current => current || (next[0].branchId ?? "school"));
    } catch {
      setLoadState("error");
    }
  }, [school?.id]);

  const loadHistory = useCallback(async () => {
    if (!school?.id || !selectedScope) return;
    setLoadState("loading");
    try {
      setRows(await fetchPayrollHistory(school.id, selectedScope.branchId));
      setPayeeKey("all");
      setLoadState("ready");
    } catch (error) {
      setRows([]);
      setLoadState(
        String(error).includes("PAYROLL_VIEW_REQUIRED")
          ? "forbidden"
          : "error"
      );
    }
  }, [school?.id, selectedScope]);

  useEffect(() => {
    void loadScopes();
  }, [loadScopes]);
  useEffect(() => {
    if (selectedScope) void loadHistory();
  }, [loadHistory, selectedScope]);

  const payees = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(row => {
      const key = row.payeeKind + ":" + (row.teacherId ?? row.membershipId);
      map.set(key, row.payeeName);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [rows]);

  const visibleRows = useMemo(
    () =>
      payeeKey === "all"
        ? rows
        : rows.filter(
            row =>
              row.payeeKind + ":" + (row.teacherId ?? row.membershipId) ===
              payeeKey
          ),
    [payeeKey, rows]
  );

  const completedPaid = useMemo(
    () =>
      visibleRows
        .filter(row => row.paymentStatus === "completed")
        .reduce((sum, row) => sum + (row.paymentAmount ?? 0), 0),
    [visibleRows]
  );
  const reversedCount = visibleRows.filter(
    row => row.paymentStatus === "reversed"
  ).length;

  return (
    <div className="space-y-5" dir="rtl">
      <FinanceNavigation currentPath="/finance/payroll/history" />
      <header className="flex flex-col gap-3 rounded-2xl border border-[#E2EAE4] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold text-[#17663B]">المالية · الأجور</p>
          <h1 className="mt-1 text-2xl font-bold text-[#173B2D]">سجل الأجور</h1>
          <p className="mt-1 text-sm text-[#607368]">
            تاريخ مسيرات المعلمين والإداريين مع أثر الدفع والعكس، قراءة فقط.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadHistory()}
          disabled={!selectedScope || loadState === "loading"}
          className="gap-2"
        >
          <RefreshCw className="size-4" /> تحديث
        </Button>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-[#53675B]">
          النطاق
          <select
            value={scopeKey}
            onChange={event => setScopeKey(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            {scopes.map(scope => (
              <option
                key={scope.branchId ?? "school"}
                value={scope.branchId ?? "school"}
              >
                {scope.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-[#53675B]">
          الموظف
          <select
            value={payeeKey}
            onChange={event => setPayeeKey(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="all">كل المستفيدين</option>
            {payees.map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </label>
      </Card>

      {loadState === "forbidden" && (
        <Card className="p-8 text-center">
          <h2 className="font-bold">سجل الأجور غير متاح</h2>
          <p className="mt-2 text-sm text-gray-500">
            يلزم finance.view أو finance.manage في هذا النطاق.
          </p>
        </Card>
      )}
      {loadState === "error" && (
        <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-700">
          تعذر تحميل سجل الأجور.
        </Card>
      )}
      {loadState === "loading" && (
        <Card className="grid min-h-32 place-items-center p-6" role="status">
          <span className="flex items-center gap-2 text-sm">
            <RefreshCw className="size-4 animate-spin" /> جارٍ تحميل السجل...
          </span>
        </Card>
      )}

      {loadState === "ready" && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="عدد السجلات"
              value={String(visibleRows.length)}
              icon={<History className="size-5" />}
            />
            <Metric
              label="المدفوع المكتمل"
              value={formatDzd(completedPaid)}
              icon={<WalletCards className="size-5" />}
            />
            <Metric
              label="دفعات معكوسة محفوظة"
              value={String(reversedCount)}
              icon={<RotateCcw className="size-5" />}
            />
          </section>

          <Card className="overflow-hidden">
            {visibleRows.length === 0 ? (
              <p className="p-10 text-center text-sm text-gray-400">
                لا توجد أجور تاريخية في هذا النطاق.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-right text-sm">
                  <thead className="bg-[#F5F8F5] text-xs text-[#607368]">
                    <tr>
                      <th className="p-3">الشهر</th>
                      <th className="p-3">المستفيد</th>
                      <th className="p-3">الأساسي</th>
                      <th className="p-3">زيادات</th>
                      <th className="p-3">خصومات</th>
                      <th className="p-3">سلف</th>
                      <th className="p-3">الصافي</th>
                      <th className="p-3">حالة البند</th>
                      <th className="p-3">الدفع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleRows.map(row => (
                      <tr key={row.entryId}>
                        <td className="p-3">{row.periodMonth.slice(0, 7)}</td>
                        <td className="p-3">
                          <b>{row.payeeName}</b>
                          <p className="text-xs text-[#718377]">
                            {row.roleLabel ??
                              (row.payeeKind === "teacher" ? "معلم" : "إداري/موظف")}
                          </p>
                        </td>
                        <td className="p-3">{formatDzd(row.baseAmount)}</td>
                        <td className="p-3">{formatDzd(row.additions)}</td>
                        <td className="p-3">{formatDzd(row.deductions)}</td>
                        <td className="p-3">{formatDzd(row.advances)}</td>
                        <td className="p-3 font-bold text-[#17663B]">
                          {formatDzd(row.netAmount)}
                        </td>
                        <td className="p-3">
                          {PAYROLL_ENTRY_STATUS_LABELS[row.entryStatus]}
                        </td>
                        <td className="p-3">
                          {row.paymentStatus ? (
                            <div>
                              <b>
                                {row.paymentStatus === "completed"
                                  ? "مكتمل"
                                  : "معكوس"}
                              </b>
                              <p className="text-xs text-[#718377]">
                                {row.paymentDate ?? "—"}
                                {row.paymentMethod
                                  ? ` · ${PAYROLL_PAYMENT_METHOD_LABELS[row.paymentMethod]}`
                                  : ""}
                                {row.paymentReference
                                  ? ` · ${row.paymentReference}`
                                  : ""}
                              </p>
                            </div>
                          ) : (
                            "لم يُسجل دفع"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[#17663B]">
        {icon}<span className="text-xs font-bold">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold text-[#173B2D]">{value}</p>
    </Card>
  );
}
