import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpen,
  DollarSign,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
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
import {
  addExpense,
  cancelExpense,
  canEditExpense,
  canManageExpenseScope,
  expenseCategories,
  expensePaymentMethods,
  expenseStatuses,
  ExpensePermissionError,
  fetchExpensePageData,
  filterExpenses,
  getExpenseSaveErrorMessage,
  translateExpenseCategory,
  translateExpenseMethod,
  translateExpenseStatus,
  updateExpense,
  validateExpenseForm,
  type ExpenseFormErrors,
  type ExpenseFormValues,
  type ExpensePageData,
  type ExpenseRow,
} from "@/lib/expenses";
import { formatDzd } from "@/lib/finance";

type LoadState = "loading" | "ready" | "error" | "forbidden";

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): ExpenseFormValues => ({
  branchId: "",
  category: "other",
  description: "",
  amount: "",
  expenseDate: today(),
  paymentMethod: "cash",
  referenceNumber: "",
  notes: "",
});

const inputClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm";

export default function Expenses() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pageData, setPageData] = useState<ExpensePageData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [formValues, setFormValues] =
    useState<ExpenseFormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<ExpenseFormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { school, isSchoolAdmin, signOut } = useAuth();

  const loadExpenses = useCallback(async () => {
    if (!school?.id) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");
    try {
      const data = await fetchExpensePageData(school.id);
      setPageData(data);
      setLoadState("ready");
    } catch (error) {
      setPageData(null);
      setLoadState(
        error instanceof ExpensePermissionError ? "forbidden" : "error"
      );
    }
  }, [school?.id]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const branchNames = useMemo(
    () =>
      new Map(
        (pageData?.branches ?? []).map(branch => [branch.id, branch.name])
      ),
    [pageData?.branches]
  );

  const filteredExpenses = useMemo(
    () =>
      pageData
        ? filterExpenses(pageData.expenses, pageData.branches, {
            search: searchQuery,
            category: categoryFilter,
            branch: branchFilter,
            status: statusFilter,
            paymentMethod: methodFilter,
            dateFrom,
            dateTo,
          })
        : [],
    [
      branchFilter,
      categoryFilter,
      dateFrom,
      dateTo,
      methodFilter,
      pageData,
      searchQuery,
      statusFilter,
    ]
  );

  const totalRecorded = useMemo(
    () =>
      filteredExpenses
        .filter(expense => expense.status === "recorded")
        .reduce((total, expense) => total + Number(expense.amount), 0),
    [filteredExpenses]
  );

  const updateField = <K extends keyof ExpenseFormValues>(
    field: K,
    value: ExpenseFormValues[K]
  ) => {
    setFormValues(current => ({ ...current, [field]: value }));
    setFormErrors(current => ({ ...current, [field]: undefined }));
  };

  const firstAllowedScope = (): string => {
    if (!pageData) return "";
    if (pageData.access.canManageSchoolWide) return "";
    return pageData.access.manageableBranchIds[0] ?? "";
  };

  const openAddDialog = () => {
    if (!pageData) return;
    setEditingExpense(null);
    setFormValues({ ...emptyForm(), branchId: firstAllowedScope() });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (expense: ExpenseRow) => {
    if (!pageData || !canEditExpense(expense, pageData.access)) return;
    setEditingExpense(expense);
    setFormValues({
      branchId: expense.branch_id ?? "",
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      expenseDate: expense.expense_date,
      paymentMethod: expense.payment_method,
      referenceNumber: expense.reference_number ?? "",
      notes: expense.notes ?? "",
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!school?.id || !pageData) return;

    const errors = validateExpenseForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const targetBranchId =
      formValues.branchId === "" ? null : formValues.branchId;
    const mayUseTarget = canManageExpenseScope(
      targetBranchId,
      pageData.access
    );
    const mayEditSource =
      !editingExpense || canEditExpense(editingExpense, pageData.access);
    if (!mayUseTarget || !mayEditSource) {
      toast.error("لا تملك صلاحية إدارة المصروف في هذا النطاق.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingExpense) {
        await updateExpense(school.id, editingExpense.id, formValues);
        toast.success("تم تعديل المصروف المسجل.");
      } else {
        await addExpense(school.id, formValues);
        toast.success("تم تسجيل المصروف.");
      }
      setDialogOpen(false);
      await loadExpenses();
    } catch (error) {
      toast.error(getExpenseSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async (expense: ExpenseRow) => {
    if (
      !school?.id ||
      !pageData ||
      !canEditExpense(expense, pageData.access)
    ) {
      return;
    }
    const confirmed = window.confirm(
      `هل تريد إلغاء المصروف "${expense.description}"؟ سيبقى القيد محفوظًا ولن يمكن إعادته من الواجهة.`
    );
    if (!confirmed) return;

    setCancellingId(expense.id);
    try {
      await cancelExpense(school.id, expense.id);
      toast.success("تم إلغاء المصروف مع حفظ السجل المحاسبي.");
      await loadExpenses();
    } catch (error) {
      toast.error(getExpenseSaveErrorMessage(error));
    } finally {
      setCancellingId(null);
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
              className="flex items-center gap-3 rounded-lg bg-white/15 px-4 py-3 text-white"
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
            placeholder="الوصف، المرجع، الملاحظات..."
            className="h-10 pr-10"
          />
        </div>
        <select
          aria-label="تصفية حسب التصنيف"
          value={categoryFilter}
          onChange={event => setCategoryFilter(event.target.value)}
          className={inputClass}
        >
          <option value="all">جميع التصنيفات</option>
          {expenseCategories.map(category => (
            <option key={category} value={category}>
              {translateExpenseCategory(category)}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب الفرع"
          value={branchFilter}
          onChange={event => setBranchFilter(event.target.value)}
          className={inputClass}
        >
          <option value="all">كل النطاقات</option>
          {pageData?.access.canManageSchoolWide && (
            <option value="school">مستوى المدرسة</option>
          )}
          {pageData?.branches.map(branch => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب الحالة"
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value)}
          className={inputClass}
        >
          <option value="all">جميع الحالات</option>
          {expenseStatuses.map(status => (
            <option key={status} value={status}>
              {translateExpenseStatus(status)}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب طريقة الدفع"
          value={methodFilter}
          onChange={event => setMethodFilter(event.target.value)}
          className={inputClass}
        >
          <option value="all">جميع طرق الدفع</option>
          {expensePaymentMethods.map(method => (
            <option key={method} value={method}>
              {translateExpenseMethod(method)}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="تاريخ البداية"
          value={dateFrom}
          onChange={event => setDateFrom(event.target.value)}
          className="h-10"
        />
        <Input
          type="date"
          aria-label="تاريخ النهاية"
          value={dateTo}
          onChange={event => setDateTo(event.target.value)}
          className="h-10"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSearchQuery("");
            setCategoryFilter("all");
            setBranchFilter("all");
            setStatusFilter("all");
            setMethodFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
        >
          مسح التصفية
        </Button>
      </div>
    </Card>
  );

  const renderActions = (expense: ExpenseRow) => {
    if (!pageData || !canEditExpense(expense, pageData.access)) {
      return <span className="text-xs text-gray-400">عرض فقط</span>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => openEditDialog(expense)}
        >
          <Pencil size={14} />
          تعديل
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cancellingId === expense.id}
          className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
          onClick={() => void handleCancel(expense)}
        >
          {cancellingId === expense.id ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Ban size={14} />
          )}
          إلغاء المصروف
        </Button>
      </div>
    );
  };

  const scopeLabel = (expense: ExpenseRow) =>
    expense.branch_id === null
      ? "مستوى المدرسة"
      : (branchNames.get(expense.branch_id) ?? "فرع غير متاح");

  const statusClass = (status: ExpenseRow["status"]) =>
    status === "recorded"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-gray-200 bg-gray-100 text-gray-600";

  const renderDesktopTable = () => (
    <Card className="hidden overflow-hidden border border-gray-100 bg-white lg:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1300px] text-right text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-3 font-medium">التصنيف</th>
              <th className="px-3 py-3 font-medium">الوصف</th>
              <th className="px-3 py-3 font-medium">المبلغ</th>
              <th className="px-3 py-3 font-medium">تاريخ المصروف</th>
              <th className="px-3 py-3 font-medium">طريقة الدفع</th>
              <th className="px-3 py-3 font-medium">النطاق</th>
              <th className="px-3 py-3 font-medium">الرقم المرجعي</th>
              <th className="px-3 py-3 font-medium">الحالة</th>
              <th className="px-3 py-3 font-medium">الملاحظات</th>
              <th className="px-3 py-3 font-medium">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredExpenses.map(expense => (
              <tr key={expense.id} className="align-top hover:bg-gray-50/70">
                <td className="px-3 py-4 font-semibold text-[#2C3E50]">
                  {translateExpenseCategory(expense.category)}
                </td>
                <td className="px-3 py-4">
                  <p className="max-w-64 leading-6">{expense.description}</p>
                </td>
                <td className="px-3 py-4 font-bold text-rose-700">
                  {formatDzd(Number(expense.amount))}
                </td>
                <td className="px-3 py-4">{expense.expense_date}</td>
                <td className="px-3 py-4">
                  {translateExpenseMethod(expense.payment_method)}
                </td>
                <td className="px-3 py-4">{scopeLabel(expense)}</td>
                <td className="px-3 py-4 font-mono text-xs">
                  {expense.reference_number ?? "—"}
                </td>
                <td className="px-3 py-4">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(expense.status)}`}
                  >
                    {translateExpenseStatus(expense.status)}
                  </span>
                </td>
                <td className="px-3 py-4">
                  <p className="max-w-48 text-xs leading-6 text-gray-500">
                    {expense.notes ?? "—"}
                  </p>
                </td>
                <td className="px-3 py-4">{renderActions(expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const renderMobileCards = () => (
    <div className="space-y-3 lg:hidden">
      {filteredExpenses.map(expense => (
        <Card key={expense.id} className="border border-gray-100 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#2C3E50]">
                {expense.description}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {translateExpenseCategory(expense.category)} ·{" "}
                {scopeLabel(expense)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(expense.status)}`}
            >
              {translateExpenseStatus(expense.status)}
            </span>
          </div>
          <p className="mt-4 text-xl font-bold text-rose-700">
            {formatDzd(Number(expense.amount))}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-gray-400">التاريخ</dt>
              <dd className="mt-1 text-gray-700">{expense.expense_date}</dd>
            </div>
            <div>
              <dt className="text-gray-400">طريقة الدفع</dt>
              <dd className="mt-1 text-gray-700">
                {translateExpenseMethod(expense.payment_method)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">المرجع</dt>
              <dd className="mt-1 font-mono text-gray-700">
                {expense.reference_number ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">الملاحظات</dt>
              <dd className="mt-1 text-gray-700">{expense.notes ?? "—"}</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-gray-100 pt-4">
            {renderActions(expense)}
          </div>
        </Card>
      ))}
    </div>
  );

  const renderContent = () => {
    if (loadState === "loading") {
      return (
        <Card
          role="status"
          className="border border-gray-100 bg-white p-10 text-center text-gray-500"
        >
          <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
          جارٍ تحميل المصروفات...
        </Card>
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
            لا تملك صلاحية المصروفات
          </h2>
          <p className="mt-2 text-sm leading-7 text-gray-600">
            يلزم منح finance.expenses على المدرسة أو أحد الفروع. لا تُستخدم
            finance.view أو finance.manage لهذا القسم.
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
          <p className="mb-4 text-red-700">
            تعذر تحميل المصروفات الحقيقية حاليًا.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadExpenses()}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border border-gray-100 bg-white p-5">
            <p className="text-sm text-gray-500">المصروفات الظاهرة</p>
            <p className="mt-2 text-2xl font-bold text-[#2C3E50]">
              {filteredExpenses.length}
            </p>
          </Card>
          <Card className="border border-gray-100 bg-white p-5">
            <p className="text-sm text-gray-500">إجمالي المسجل</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">
              {formatDzd(totalRecorded)}
            </p>
          </Card>
          <Card className="border border-gray-100 bg-white p-5">
            <p className="text-sm text-gray-500">نطاق الصلاحية</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#0B4738]">
              {pageData.access.canManageSchoolWide
                ? "المدرسة وجميع الفروع المتاحة"
                : `${pageData.access.manageableBranchIds.length} فرع`}
            </p>
          </Card>
        </div>
        <div className="mt-4">{renderFilters()}</div>

        {filteredExpenses.length === 0 ? (
          <Card className="mt-4 border border-dashed border-gray-200 bg-white p-12 text-center">
            <ReceiptText className="mx-auto text-gray-300" size={34} />
            <h2 className="mt-4 text-lg font-bold text-[#2C3E50]">
              لا توجد مصروفات
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              لا توجد قيود مطابقة للفلاتر الحالية، أو لم تُسجّل مصروفات بعد.
            </p>
          </Card>
        ) : (
          <div className="mt-4">
            {renderDesktopTable()}
            {renderMobileCards()}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]" dir="rtl">
      <aside
        className={`hidden flex-col shadow-xl transition-all duration-300 md:flex ${
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
        <header className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-[#2C3E50]">
                  إدارة المصروفات
                </h1>
                <p className="mt-0.5 text-xs text-gray-500">
                  قيود حقيقية من Supabase ضمن نطاق finance.expenses
                </p>
              </div>
            </div>
            {loadState === "ready" && pageData && (
              <Button
                type="button"
                onClick={openAddDialog}
                className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                <Plus size={17} />
                إضافة مصروف
              </Button>
            )}
          </div>
        </header>

        <FinanceNavigation currentPath="/finance/expenses" />
        <main className="flex-1 p-4 md:p-6">{renderContent()}</main>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>
              {editingExpense ? "تعديل المصروف المسجل" : "إضافة مصروف جديد"}
            </DialogTitle>
            <DialogDescription>
              المصروف الملغى لا يمكن تعديله أو إعادته إلى مسجل من الواجهة.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">الفرع أو مستوى المدرسة</span>
              <select
                value={formValues.branchId}
                onChange={event => updateField("branchId", event.target.value)}
                className={`${inputClass} w-full`}
              >
                {pageData?.access.canManageSchoolWide && (
                  <option value="">مستوى المدرسة</option>
                )}
                {pageData?.branches
                  .filter(branch =>
                    pageData.access.manageableBranchIds.includes(branch.id)
                  )
                  .map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">التصنيف</span>
              <select
                value={formValues.category}
                onChange={event =>
                  updateField(
                    "category",
                    event.target.value as ExpenseFormValues["category"]
                  )
                }
                className={`${inputClass} w-full`}
              >
                {expenseCategories.map(category => (
                  <option key={category} value={category}>
                    {translateExpenseCategory(category)}
                  </option>
                ))}
              </select>
              {formErrors.category && (
                <p className="text-xs text-red-600">{formErrors.category}</p>
              )}
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">الوصف</span>
              <Input
                value={formValues.description}
                onChange={event =>
                  updateField("description", event.target.value)
                }
                maxLength={250}
              />
              {formErrors.description && (
                <p className="text-xs text-red-600">
                  {formErrors.description}
                </p>
              )}
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">المبلغ بالعملة المحددة</span>
              <Input
                inputMode="decimal"
                value={formValues.amount}
                onChange={event => updateField("amount", event.target.value)}
                placeholder="0.00"
              />
              {formErrors.amount && (
                <p className="text-xs text-red-600">{formErrors.amount}</p>
              )}
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">تاريخ المصروف</span>
              <Input
                type="date"
                value={formValues.expenseDate}
                onChange={event =>
                  updateField("expenseDate", event.target.value)
                }
              />
              {formErrors.expenseDate && (
                <p className="text-xs text-red-600">
                  {formErrors.expenseDate}
                </p>
              )}
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">طريقة الدفع</span>
              <select
                value={formValues.paymentMethod}
                onChange={event =>
                  updateField(
                    "paymentMethod",
                    event.target.value as ExpenseFormValues["paymentMethod"]
                  )
                }
                className={`${inputClass} w-full`}
              >
                {expensePaymentMethods.map(method => (
                  <option key={method} value={method}>
                    {translateExpenseMethod(method)}
                  </option>
                ))}
              </select>
              {formErrors.paymentMethod && (
                <p className="text-xs text-red-600">
                  {formErrors.paymentMethod}
                </p>
              )}
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">الرقم المرجعي</span>
              <Input
                value={formValues.referenceNumber}
                onChange={event =>
                  updateField("referenceNumber", event.target.value)
                }
              />
              {formErrors.referenceNumber && (
                <p className="text-xs text-red-600">
                  {formErrors.referenceNumber}
                </p>
              )}
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">الملاحظات</span>
              <Textarea
                value={formValues.notes}
                onChange={event => updateField("notes", event.target.value)}
                rows={3}
              />
              {formErrors.notes && (
                <p className="text-xs text-red-600">{formErrors.notes}</p>
              )}
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
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
                {editingExpense ? "حفظ التعديل" : "تسجيل المصروف"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
