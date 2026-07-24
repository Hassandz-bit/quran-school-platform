import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  BookOpen,
  DollarSign,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import FinanceNavigation from "@/components/FinanceNavigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import {
  addPayment,
  buildPaymentLedgerRows,
  canManagePayment,
  fetchPaymentPageData,
  getOpenChargeBalances,
  getPaymentSaveErrorMessage,
  paymentMethods,
  paymentStatuses,
  PaymentPermissionError,
  reversePayment,
  translatePaymentMethod,
  translatePaymentStatus,
  validatePaymentForm,
  type ChargeBalance,
  type PaymentFormErrors,
  type PaymentFormValues,
  type PaymentLedgerRow,
  type PaymentPageData,
  type PaymentStudent,
} from "@/lib/payments";

type LoadState = "loading" | "ready" | "error" | "forbidden";

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): PaymentFormValues => ({
  studentId: "",
  chargeId: "",
  amount: "",
  paymentMethod: "cash",
  paymentDate: today(),
  referenceNumber: "",
  notes: "",
});

const displayStudentName = (student?: PaymentStudent): string =>
  student
    ? `${student.first_name} ${student.last_name}`.trim()
    : "طالب غير متاح";

export default function Payments() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pageData, setPageData] = useState<PaymentPageData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState<PaymentFormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<PaymentFormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { school, isSchoolAdmin, signOut } = useAuth();

  const loadPayments = useCallback(async () => {
    if (!school?.id) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");
    try {
      const data = await fetchPaymentPageData(school.id);
      setPageData(data);
      setLoadState("ready");
    } catch (error) {
      setPageData(null);
      setLoadState(
        error instanceof PaymentPermissionError ? "forbidden" : "error"
      );
    }
  }, [school?.id]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const studentsById = useMemo(
    () => new Map((pageData?.students ?? []).map(student => [student.id, student])),
    [pageData?.students]
  );
  const branchesById = useMemo(
    () => new Map((pageData?.branches ?? []).map(branch => [branch.id, branch])),
    [pageData?.branches]
  );
  const ledgerRows = useMemo(
    () =>
      pageData
        ? buildPaymentLedgerRows(pageData.charges, pageData.payments)
        : [],
    [pageData]
  );
  const openBalances = useMemo(
    () =>
      pageData
        ? getOpenChargeBalances(pageData.charges, pageData.payments).filter(
            balance =>
              pageData.access.manageableBranchIds.includes(
                balance.charge.branch_id
              )
          )
        : [],
    [pageData]
  );
  const selectedBalance = useMemo(
    () =>
      openBalances.find(
        balance => balance.charge.id === formValues.chargeId
      ) ?? null,
    [formValues.chargeId, openBalances]
  );
  const studentOpenBalances = useMemo(
    () =>
      openBalances.filter(
        balance =>
          !formValues.studentId ||
          balance.charge.student_id === formValues.studentId
      ),
    [formValues.studentId, openBalances]
  );
  const manageableStudents = useMemo(() => {
    if (!pageData) return [];
    const manageable = new Set(pageData.access.manageableBranchIds);
    return pageData.students.filter(student =>
      manageable.has(student.branch_id)
    );
  }, [pageData]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return ledgerRows.filter(row => {
      const student = studentsById.get(row.payment.student_id);
      const branch = branchesById.get(row.payment.branch_id);
      const searchable = [
        displayStudentName(student),
        row.charge?.description ?? "",
        row.payment.reference_number ?? "",
        row.payment.notes ?? "",
        branch?.name ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase();

      return (
        (query === "" || searchable.includes(query)) &&
        (studentFilter === "all" ||
          row.payment.student_id === studentFilter) &&
        (branchFilter === "all" ||
          row.payment.branch_id === branchFilter) &&
        (methodFilter === "all" ||
          row.payment.payment_method === methodFilter) &&
        (statusFilter === "all" || row.payment.status === statusFilter) &&
        (dateFrom === "" || row.payment.payment_date >= dateFrom) &&
        (dateTo === "" || row.payment.payment_date <= dateTo)
      );
    });
  }, [
    branchFilter,
    branchesById,
    dateFrom,
    dateTo,
    ledgerRows,
    methodFilter,
    searchQuery,
    statusFilter,
    studentFilter,
    studentsById,
  ]);

  const updateField = <K extends keyof PaymentFormValues>(
    field: K,
    value: PaymentFormValues[K]
  ) => {
    setFormValues(current => ({ ...current, [field]: value }));
    setFormErrors(current => ({ ...current, [field]: undefined }));
  };

  const openAddDialog = () => {
    if (!pageData?.access.canManage) return;
    setFormValues(emptyForm());
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!school?.id || !selectedBalance || !pageData) {
      const errors = validatePaymentForm(formValues, selectedBalance);
      setFormErrors(errors);
      return;
    }

    const errors = validatePaymentForm(formValues, selectedBalance);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (
      !pageData.access.manageableBranchIds.includes(
        selectedBalance.charge.branch_id
      )
    ) {
      toast.error("لا تملك صلاحية تسجيل دفعة في هذا الفرع.");
      return;
    }

    setIsSaving(true);
    try {
      await addPayment(school.id, selectedBalance, formValues);
      toast.success(
        Number(formValues.amount) === selectedBalance.remaining
          ? "تم تسجيل السداد الكامل."
          : "تم تسجيل الدفعة الجزئية."
      );
      setDialogOpen(false);
      await loadPayments();
    } catch (error) {
      toast.error(getPaymentSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReverse = async (row: PaymentLedgerRow) => {
    if (
      !school?.id ||
      !pageData ||
      row.payment.status !== "completed" ||
      !canManagePayment(row.payment, pageData.access)
    ) {
      return;
    }

    const confirmed = window.confirm(
      `هل تريد عكس الدفعة بمبلغ ${formatDzd(Number(row.payment.amount))}؟ سيبقى القيد محفوظًا ولن يُحذف.`
    );
    if (!confirmed) return;

    setReversingId(row.payment.id);
    try {
      await reversePayment(school.id, row.payment.id);
      toast.success("تم عكس الدفعة وتحديث حالة الاستحقاق.");
      await loadPayments();
    } catch (error) {
      toast.error(getPaymentSaveErrorMessage(error));
    } finally {
      setReversingId(null);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("تعذر تسجيل الخروج حاليًا.");
        return;
      }
      setLocation("/login");
    } catch {
      toast.error("تعذر تسجيل الخروج حاليًا.");
    }
  };

  const menuItems = useMemo(
    () => [
      {
        label: "لوحة التحكم",
        icon: Home,
        path: isSchoolAdmin ? "/dashboard" : null,
      },
      {
        label: "الطلاب",
        icon: Users,
        path: isSchoolAdmin ? "/students" : null,
      },
      {
        label: "المعلمون",
        icon: GraduationCap,
        path: isSchoolAdmin ? "/teachers" : null,
      },
      {
        label: "الحلقات",
        icon: BookOpen,
        path: isSchoolAdmin ? "/classes" : null,
      },
      { label: "المالية", icon: DollarSign, path: "/finance" },
      { label: "الإعدادات", icon: Settings, path: null },
    ],
    [isSchoolAdmin]
  );

  const SidebarContent = ({ showLabels }: { showLabels: boolean }) => (
    <>
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C8A26A]">
            <span className="text-lg font-bold text-[#0B4738]">ق</span>
          </div>
          {showLabels && (
            <span className="line-clamp-2 text-sm font-semibold text-white">
              {school?.name ?? "المدرسة القرآنية"}
            </span>
          )}
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {menuItems.map(item => {
          const content = (
            <>
              <item.icon size={20} className="shrink-0" />
              {showLabels && <span className="text-sm">{item.label}</span>}
            </>
          );
          if (!item.path) {
            return (
              <div
                key={item.label}
                aria-disabled="true"
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-white/40"
              >
                {content}
              </div>
            );
          }
          return (
            <a
              key={item.label}
              href={item.path}
              onClick={event => {
                event.preventDefault();
                setLocation(item.path!);
                setMobileSidebarOpen(false);
              }}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                item.path === "/finance"
                  ? "bg-white/15 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {content}
            </a>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-white/70 hover:bg-red-500/20 hover:text-white"
        >
          <LogOut size={20} />
          {showLabels && <span className="text-sm">تسجيل الخروج</span>}
        </button>
      </div>
    </>
  );

  const statusBadge = (status: "completed" | "reversed") =>
    status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-gray-200 bg-gray-100 text-gray-600";

  const renderActions = (row: PaymentLedgerRow) => {
    const canReverse =
      pageData &&
      row.payment.status === "completed" &&
      canManagePayment(row.payment, pageData.access);

    if (!canReverse) {
      return <span className="text-xs text-gray-400">عرض فقط</span>;
    }

    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={reversingId === row.payment.id}
        onClick={() => void handleReverse(row)}
        className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
      >
        {reversingId === row.payment.id ? (
          <RefreshCw size={14} className="animate-spin" />
        ) : (
          <ArrowLeftRight size={14} />
        )}
        عكس الدفعة
      </Button>
    );
  };

  const renderFilters = () => (
    <Card className="border border-gray-100 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative">
          <Search
            size={18}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <Input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="طالب، استحقاق، مرجع..."
            className="h-10 pr-10"
          />
        </div>
        <select
          aria-label="تصفية حسب الطالب"
          value={studentFilter}
          onChange={event => setStudentFilter(event.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          <option value="all">جميع الطلاب</option>
          {pageData?.students.map(student => (
            <option key={student.id} value={student.id}>
              {displayStudentName(student)}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب الفرع"
          value={branchFilter}
          onChange={event => setBranchFilter(event.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          <option value="all">جميع الفروع</option>
          {pageData?.branches.map(branch => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب طريقة الدفع"
          value={methodFilter}
          onChange={event => setMethodFilter(event.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          <option value="all">جميع طرق الدفع</option>
          {paymentMethods.map(method => (
            <option key={method} value={method}>
              {translatePaymentMethod(method)}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب الحالة"
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          <option value="all">جميع الحالات</option>
          {paymentStatuses.map(status => (
            <option key={status} value={status}>
              {translatePaymentStatus(status)}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="من تاريخ"
          value={dateFrom}
          onChange={event => setDateFrom(event.target.value)}
          className="h-10"
        />
        <Input
          type="date"
          aria-label="إلى تاريخ"
          value={dateTo}
          onChange={event => setDateTo(event.target.value)}
          className="h-10"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSearchQuery("");
            setStudentFilter("all");
            setBranchFilter("all");
            setMethodFilter("all");
            setStatusFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
        >
          مسح التصفية
        </Button>
      </div>
    </Card>
  );

  const renderDesktopTable = () => (
    <Card className="hidden overflow-hidden border border-gray-100 bg-white lg:block">
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full text-right text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-3 font-medium">الطالب والاستحقاق</th>
              <th className="px-3 py-3 font-medium">مبلغ الاستحقاق</th>
              <th className="px-3 py-3 font-medium">مدفوع سابقًا</th>
              <th className="px-3 py-3 font-medium">الرصيد المتبقي</th>
              <th className="px-3 py-3 font-medium">مبلغ الدفعة</th>
              <th className="px-3 py-3 font-medium">طريقة الدفع</th>
              <th className="px-3 py-3 font-medium">تاريخ الدفع</th>
              <th className="px-3 py-3 font-medium">الرقم المرجعي</th>
              <th className="px-3 py-3 font-medium">الحالة</th>
              <th className="px-3 py-3 font-medium">الفرع</th>
              <th className="px-3 py-3 font-medium">الملاحظات</th>
              <th className="px-3 py-3 font-medium">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRows.map(row => (
              <tr key={row.payment.id} className="align-top hover:bg-gray-50/70">
                <td className="px-3 py-4">
                  <p className="font-semibold text-[#2C3E50]">
                    {displayStudentName(
                      studentsById.get(row.payment.student_id)
                    )}
                  </p>
                  <p className="mt-1 max-w-56 text-xs text-gray-500">
                    {row.charge?.description ?? "استحقاق غير متاح"}
                  </p>
                  {row.charge && (
                    <p className="mt-1 text-xs text-gray-400">
                      استحقاق {row.charge.due_date}
                    </p>
                  )}
                </td>
                <td className="px-3 py-4 font-semibold">
                  {formatDzd(Number(row.charge?.net_amount ?? 0))}
                </td>
                <td className="px-3 py-4">
                  {formatDzd(row.paidPreviously)}
                </td>
                <td className="px-3 py-4 font-semibold text-amber-700">
                  {formatDzd(row.remaining)}
                </td>
                <td className="px-3 py-4 font-bold text-[#0B4738]">
                  {formatDzd(Number(row.payment.amount))}
                </td>
                <td className="px-3 py-4">
                  {translatePaymentMethod(row.payment.payment_method)}
                </td>
                <td className="px-3 py-4">{row.payment.payment_date}</td>
                <td className="px-3 py-4 font-mono text-xs">
                  {row.payment.reference_number ?? "—"}
                </td>
                <td className="px-3 py-4">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(row.payment.status)}`}
                  >
                    {translatePaymentStatus(row.payment.status)}
                  </span>
                </td>
                <td className="px-3 py-4">
                  {branchesById.get(row.payment.branch_id)?.name ?? "—"}
                </td>
                <td className="px-3 py-4">
                  <p className="max-w-48 text-xs leading-6 text-gray-500">
                    {row.payment.notes ?? "—"}
                  </p>
                </td>
                <td className="px-3 py-4">{renderActions(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const renderMobileCards = () => (
    <div className="space-y-3 lg:hidden">
      {filteredRows.map(row => (
        <Card key={row.payment.id} className="border border-gray-100 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#2C3E50]">
                {displayStudentName(studentsById.get(row.payment.student_id))}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {row.charge?.description ?? "استحقاق غير متاح"}
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(row.payment.status)}`}
            >
              {translatePaymentStatus(row.payment.status)}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-400">مبلغ الدفعة</dt>
              <dd className="mt-1 font-bold text-[#0B4738]">
                {formatDzd(Number(row.payment.amount))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">المتبقي</dt>
              <dd className="mt-1 font-semibold text-amber-700">
                {formatDzd(row.remaining)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">طريقة الدفع</dt>
              <dd className="mt-1">
                {translatePaymentMethod(row.payment.payment_method)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">التاريخ</dt>
              <dd className="mt-1">{row.payment.payment_date}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">الفرع</dt>
              <dd className="mt-1">
                {branchesById.get(row.payment.branch_id)?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">المرجع</dt>
              <dd className="mt-1 font-mono text-xs">
                {row.payment.reference_number ?? "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-6 text-gray-500">
            {row.payment.notes ?? "لا توجد ملاحظات"}
          </p>
          <div className="mt-4 border-t border-gray-100 pt-3">
            {renderActions(row)}
          </div>
        </Card>
      ))}
    </div>
  );

  const renderContent = () => {
    if (loadState === "loading") {
      return (
        <div role="status" className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-white" />
          <div className="h-80 animate-pulse rounded-xl bg-white" />
          <span className="sr-only">جارٍ تحميل الدفعات</span>
        </div>
      );
    }

    if (loadState === "forbidden") {
      return (
        <Card
          role="alert"
          className="border border-amber-200 bg-white p-10 text-center"
        >
          <ShieldAlert className="mx-auto text-amber-700" size={32} />
          <h2 className="mt-4 text-lg font-bold text-[#2C3E50]">
            لا تملك صلاحية عرض الدفعات
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            يلزم finance.view أو finance.manage في فرع واحد على الأقل.
          </p>
        </Card>
      );
    }

    if (loadState === "error" || !pageData) {
      return (
        <Card
          role="alert"
          className="border border-red-100 bg-white p-10 text-center"
        >
          <p className="mb-4 text-red-700">تعذر تحميل سجل الدفعات.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadPayments()}
            className="gap-2"
          >
            <RefreshCw size={16} />
            إعادة المحاولة
          </Button>
        </Card>
      );
    }

    if (pageData.payments.length === 0) {
      return (
        <Card className="border border-dashed border-[#C8A26A]/60 bg-white p-10 text-center">
          <Banknote className="mx-auto text-[#9A7137]" size={36} />
          <h2 className="mt-4 text-lg font-bold text-[#2C3E50]">
            لا توجد دفعات مسجلة
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-gray-600">
            يمكن تسجيل أول دفعة عند وجود استحقاق مفتوح في فرع تملك فيه
            finance.manage.
          </p>
          {pageData.access.canManage && openBalances.length > 0 && (
            <Button
              type="button"
              onClick={openAddDialog}
              className="mt-5 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
            >
              <Plus size={17} />
              تسجيل دفعة
            </Button>
          )}
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {renderFilters()}
        {filteredRows.length === 0 ? (
          <Card className="border border-gray-100 bg-white p-10 text-center text-gray-500">
            لا توجد دفعات مطابقة للبحث والتصفية.
          </Card>
        ) : (
          <>
            {renderDesktopTable()}
            {renderMobileCards()}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]" dir="rtl">
      <aside
        className={`hidden flex-col shadow-xl transition-all md:flex ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
        style={{ backgroundColor: "#0B4738" }}
      >
        <SidebarContent showLabels={sidebarOpen} />
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="absolute bottom-0 right-0 top-0 flex w-72 flex-col shadow-xl"
            style={{ backgroundColor: "#0B4738" }}
          >
            <SidebarContent showLabels />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-4 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="تبديل القائمة"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileSidebarOpen(open => !open);
                } else {
                  setSidebarOpen(open => !open);
                }
              }}
              className="rounded-lg p-2 hover:bg-gray-100"
            >
              {mobileSidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div>
              <button
                type="button"
                onClick={() => setLocation("/finance")}
                className="text-xs font-medium text-[#0B4738] hover:underline"
              >
                المالية / الدفعات
              </button>
              <h1 className="mt-1 text-xl font-bold text-[#2C3E50]">
                الدفعات والتحصيل
              </h1>
              <p className="mt-0.5 text-xs text-gray-500">
                سجل محاسبي كامل مع دعم السداد الجزئي والعكس
              </p>
            </div>
          </div>
          {pageData?.access.canManage && loadState === "ready" && (
            <Button
              type="button"
              onClick={openAddDialog}
              disabled={openBalances.length === 0}
              className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
              title={
                openBalances.length === 0
                  ? "لا توجد استحقاقات مفتوحة قابلة للدفع"
                  : undefined
              }
            >
              <Plus size={17} />
              تسجيل دفعة
            </Button>
          )}
        </header>

        <FinanceNavigation currentPath="/finance/payments" />
        <main className="flex-1 p-4 md:p-6">{renderContent()}</main>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={open => {
          if (!isSaving) setDialogOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-2xl overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader className="text-right">
            <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
            <DialogDescription>
              تظهر الاستحقاقات المفتوحة فقط، وتتحقق قاعدة البيانات نهائيًا من
              الرصيد والحالة.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">الطالب</label>
              <select
                value={formValues.studentId}
                onChange={event => {
                  updateField("studentId", event.target.value);
                  updateField("chargeId", "");
                }}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="">اختر الطالب</option>
                {manageableStudents.map(student => (
                  <option key={student.id} value={student.id}>
                    {displayStudentName(student)} —{" "}
                    {branchesById.get(student.branch_id)?.name ?? "فرع"}
                  </option>
                ))}
              </select>
              {formErrors.studentId && (
                <p className="mt-1 text-xs text-red-600">
                  {formErrors.studentId}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                الاستحقاق المفتوح
              </label>
              <select
                value={formValues.chargeId}
                onChange={event => updateField("chargeId", event.target.value)}
                disabled={!formValues.studentId}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-50"
              >
                <option value="">اختر الاستحقاق</option>
                {studentOpenBalances.map(balance => (
                  <option key={balance.charge.id} value={balance.charge.id}>
                    {balance.charge.description} — متبقي{" "}
                    {formatDzd(balance.remaining)}
                  </option>
                ))}
              </select>
              {formValues.studentId && studentOpenBalances.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  لا توجد استحقاقات مفتوحة لهذا الطالب.
                </p>
              )}
              {formErrors.chargeId && (
                <p className="mt-1 text-xs text-red-600">
                  {formErrors.chargeId}
                </p>
              )}
            </div>

            {selectedBalance && (
              <div className="grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-500">مبلغ الاستحقاق</p>
                  <p className="mt-1 font-bold">
                    {formatDzd(Number(selectedBalance.charge.net_amount))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">المدفوع سابقًا</p>
                  <p className="mt-1 font-bold text-emerald-700">
                    {formatDzd(selectedBalance.paid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">الرصيد المتبقي</p>
                  <p className="mt-1 font-bold text-amber-700">
                    {formatDzd(selectedBalance.remaining)}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  مبلغ الدفعة
                </label>
                <Input
                  inputMode="decimal"
                  value={formValues.amount}
                  onChange={event => updateField("amount", event.target.value)}
                  placeholder="0.00"
                />
                {selectedBalance && (
                  <button
                    type="button"
                    onClick={() =>
                      updateField("amount", String(selectedBalance.remaining))
                    }
                    className="mt-1 text-xs font-medium text-[#0B4738] hover:underline"
                  >
                    سداد الرصيد كاملًا
                  </button>
                )}
                {formErrors.amount && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.amount}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  طريقة الدفع
                </label>
                <select
                  value={formValues.paymentMethod}
                  onChange={event =>
                    updateField(
                      "paymentMethod",
                      event.target.value as PaymentFormValues["paymentMethod"]
                    )
                  }
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                >
                  {paymentMethods.map(method => (
                    <option key={method} value={method}>
                      {translatePaymentMethod(method)}
                    </option>
                  ))}
                </select>
                {formErrors.paymentMethod && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.paymentMethod}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  تاريخ الدفع
                </label>
                <Input
                  type="date"
                  value={formValues.paymentDate}
                  onChange={event =>
                    updateField("paymentDate", event.target.value)
                  }
                />
                {formErrors.paymentDate && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.paymentDate}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  الرقم المرجعي
                </label>
                <Input
                  value={formValues.referenceNumber}
                  onChange={event =>
                    updateField("referenceNumber", event.target.value)
                  }
                  placeholder="اختياري"
                />
                {formErrors.referenceNumber && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.referenceNumber}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                الملاحظات
              </label>
              <Textarea
                value={formValues.notes}
                onChange={event => updateField("notes", event.target.value)}
                placeholder="ملاحظات اختيارية"
                rows={3}
              />
              {formErrors.notes && (
                <p className="mt-1 text-xs text-red-600">
                  {formErrors.notes}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                {isSaving && <RefreshCw size={15} className="animate-spin" />}
                حفظ الدفعة
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
