import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  DollarSign,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Tags,
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
  addFeePlan,
  archiveFeePlan,
  canManageFeePlan,
  feePlanBillingCycles,
  feePlanStatuses,
  fetchFeePlanPageData,
  FeePlanPermissionError,
  getFeePlanSaveErrorMessage,
  translateBillingCycle,
  translateFeePlanStatus,
  updateFeePlan,
  validateFeePlanForm,
  type FeePlanFormErrors,
  type FeePlanFormValues,
  type FeePlanPageData,
  type FeePlanRow,
} from "@/lib/fee-plans";
import { formatDzd } from "@/lib/finance";

type LoadState = "loading" | "ready" | "error" | "forbidden";

const emptyForm: FeePlanFormValues = {
  branchId: "",
  name: "",
  code: "",
  billingCycle: "monthly",
  amount: "",
  dueDay: "",
  status: "active",
  description: "",
};

export default function FeePlans() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pageData, setPageData] = useState<FeePlanPageData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<FeePlanRow | null>(null);
  const [formValues, setFormValues] =
    useState<FeePlanFormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<FeePlanFormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { school, isSchoolAdmin, signOut } = useAuth();

  const loadPlans = useCallback(async () => {
    if (!school?.id) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");

    try {
      const data = await fetchFeePlanPageData(school.id);
      setPageData(data);
      setLoadState("ready");
    } catch (error) {
      setPageData(null);
      setLoadState(
        error instanceof FeePlanPermissionError ? "forbidden" : "error"
      );
    }
  }, [school?.id]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const branchNames = useMemo(
    () =>
      new Map(
        (pageData?.branches ?? []).map(branch => [branch.id, branch.name])
      ),
    [pageData?.branches]
  );

  const manageableBranches = useMemo(() => {
    if (!pageData) return [];
    const manageableIds = new Set(pageData.access.manageableBranchIds);
    return pageData.branches.filter(branch => manageableIds.has(branch.id));
  }, [pageData]);

  const filteredPlans = useMemo(() => {
    if (!pageData) return [];
    const query = searchQuery.trim().toLocaleLowerCase();

    return pageData.plans.filter(plan => {
      const branchName = plan.branch_id
        ? (branchNames.get(plan.branch_id) ?? "")
        : "عامة";
      const searchable =
        `${plan.name} ${plan.code} ${plan.description ?? ""} ${branchName}`.toLocaleLowerCase();
      const matchesSearch = query === "" || searchable.includes(query);
      const matchesStatus =
        statusFilter === "all" || plan.status === statusFilter;
      const matchesCycle =
        cycleFilter === "all" || plan.billing_cycle === cycleFilter;
      const matchesBranch =
        branchFilter === "all" ||
        (branchFilter === "school"
          ? plan.branch_id === null
          : plan.branch_id === branchFilter);

      return (
        matchesSearch && matchesStatus && matchesCycle && matchesBranch
      );
    });
  }, [
    branchFilter,
    branchNames,
    cycleFilter,
    pageData,
    searchQuery,
    statusFilter,
  ]);

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
        return;
      }
      setLocation("/login");
    } catch {
      toast.error("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
    }
  };

  const openAddDialog = () => {
    if (!pageData?.access.canManage) return;
    setEditingPlan(null);
    setFormValues({
      ...emptyForm,
      branchId: pageData.access.canManageSchoolWide
        ? ""
        : (manageableBranches[0]?.id ?? ""),
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (plan: FeePlanRow) => {
    if (!pageData || !canManageFeePlan(plan, pageData.access)) return;
    setEditingPlan(plan);
    setFormValues({
      branchId: plan.branch_id ?? "",
      name: plan.name,
      code: plan.code,
      billingCycle: plan.billing_cycle,
      amount: String(plan.amount),
      dueDay: plan.due_day === null ? "" : String(plan.due_day),
      status: plan.status,
      description: plan.description ?? "",
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const updateField = <K extends keyof FeePlanFormValues>(
    field: K,
    value: FeePlanFormValues[K]
  ) => {
    setFormValues(current => ({ ...current, [field]: value }));
    setFormErrors(current => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!school?.id || !pageData) return;

    const errors = validateFeePlanForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const scopeIsAllowed = editingPlan
      ? canManageFeePlan(editingPlan, pageData.access)
      : formValues.branchId === ""
        ? pageData.access.canManageSchoolWide
        : pageData.access.manageableBranchIds.includes(formValues.branchId);

    if (!scopeIsAllowed) {
      toast.error("لا تملك صلاحية إدارة الخطط في هذا النطاق.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingPlan) {
        await updateFeePlan(school.id, editingPlan.id, formValues);
        toast.success("تم تحديث خطة الرسوم.");
      } else {
        await addFeePlan(school.id, formValues);
        toast.success("تمت إضافة خطة الرسوم.");
      }
      setDialogOpen(false);
      await loadPlans();
    } catch (error) {
      toast.error(getFeePlanSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (plan: FeePlanRow) => {
    if (
      !school?.id ||
      !pageData ||
      plan.status === "archived" ||
      !canManageFeePlan(plan, pageData.access)
    ) {
      return;
    }

    const confirmed = window.confirm(
      `هل تريد أرشفة خطة «${plan.name}»؟ لن تُحذف الخطة ويمكن الرجوع إليها في السجل.`
    );
    if (!confirmed) return;

    setArchivingId(plan.id);
    try {
      await archiveFeePlan(school.id, plan.id);
      toast.success("تمت أرشفة خطة الرسوم.");
      await loadPlans();
    } catch (error) {
      toast.error(getFeePlanSaveErrorMessage(error));
    } finally {
      setArchivingId(null);
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
              {showLabels && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
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
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-white/70 transition-all hover:bg-red-500/20 hover:text-white"
        >
          <LogOut size={20} className="shrink-0" />
          {showLabels && <span className="text-sm">تسجيل الخروج</span>}
        </button>
      </div>
    </>
  );

  const statusBadge = (status: FeePlanRow["status"]) => {
    const styles = {
      active: "border-emerald-200 bg-emerald-50 text-emerald-700",
      inactive: "border-amber-200 bg-amber-50 text-amber-700",
      archived: "border-gray-200 bg-gray-100 text-gray-600",
    };
    return styles[status];
  };

  const renderPlanActions = (plan: FeePlanRow) => {
    const canManage = pageData
      ? canManageFeePlan(plan, pageData.access)
      : false;

    if (!canManage) {
      return <span className="text-xs text-gray-400">عرض فقط</span>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => openEditDialog(plan)}
        >
          <Pencil size={14} />
          تعديل
        </Button>
        {plan.status !== "archived" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={archivingId === plan.id}
            className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
            onClick={() => void handleArchive(plan)}
          >
            {archivingId === plan.id ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Archive size={14} />
            )}
            أرشفة
          </Button>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (loadState === "loading") {
      return (
        <div role="status" className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-white" />
          <div className="h-72 animate-pulse rounded-xl bg-white" />
          <span className="sr-only">جارٍ تحميل خطط الرسوم</span>
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
            لا تملك صلاحية عرض خطط الرسوم
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            يلزم finance.view أو finance.manage على المدرسة أو أحد فروعها.
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
            تعذر تحميل خطط الرسوم حاليًا.
          </p>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void loadPlans()}
          >
            <RefreshCw size={16} />
            إعادة المحاولة
          </Button>
        </Card>
      );
    }

    if (pageData.plans.length === 0) {
      return (
        <Card className="border border-dashed border-[#C8A26A]/60 bg-white p-10 text-center">
          <Tags className="mx-auto text-[#9A7137]" size={34} />
          <h2 className="mt-4 text-lg font-bold text-[#2C3E50]">
            لا توجد خطط رسوم بعد
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-gray-600">
            أضف أول خطة رسوم عامة للمدرسة أو خاصة بفرع عند توفر صلاحية
            الإدارة.
          </p>
          {pageData.access.canManage && (
            <Button
              type="button"
              onClick={openAddDialog}
              className="mt-5 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
            >
              <Plus size={17} />
              إضافة خطة
            </Button>
          )}
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card className="border border-gray-100 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative">
              <Search
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="البحث بالاسم أو الرمز أو الوصف..."
                className="h-10 pr-10"
              />
            </div>
            <select
              aria-label="تصفية حسب الحالة"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="all">جميع الحالات</option>
              {feePlanStatuses.map(status => (
                <option key={status} value={status}>
                  {translateFeePlanStatus(status)}
                </option>
              ))}
            </select>
            <select
              aria-label="تصفية حسب دورة الفوترة"
              value={cycleFilter}
              onChange={event => setCycleFilter(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="all">جميع دورات الفوترة</option>
              {feePlanBillingCycles.map(cycle => (
                <option key={cycle} value={cycle}>
                  {translateBillingCycle(cycle)}
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
              <option value="school">عامة للمدرسة</option>
              {pageData.branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {filteredPlans.length === 0 ? (
          <Card className="border border-gray-100 bg-white p-10 text-center text-gray-500">
            لا توجد خطط مطابقة للبحث والتصفية.
          </Card>
        ) : (
          <>
            <Card className="hidden overflow-hidden border border-gray-100 bg-white md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">الخطة</th>
                      <th className="px-4 py-3 font-medium">المبلغ</th>
                      <th className="px-4 py-3 font-medium">الفوترة</th>
                      <th className="px-4 py-3 font-medium">النطاق</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                      <th className="px-4 py-3 font-medium">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPlans.map(plan => (
                      <tr key={plan.id} className="align-top hover:bg-gray-50/70">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[#2C3E50]">
                            {plan.name}
                          </p>
                          <p className="mt-1 font-mono text-xs text-gray-500">
                            {plan.code}
                          </p>
                          <p className="mt-2 max-w-xs text-xs leading-6 text-gray-500">
                            {plan.description ?? "لا يوجد وصف"}
                          </p>
                        </td>
                        <td className="px-4 py-4 font-semibold text-[#2C3E50]">
                          {formatDzd(Number(plan.amount))}
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {translateBillingCycle(plan.billing_cycle)}
                          {plan.due_day && (
                            <p className="mt-1 text-xs text-gray-400">
                              الاستحقاق يوم {plan.due_day}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {plan.branch_id
                            ? (branchNames.get(plan.branch_id) ?? "فرع غير متاح")
                            : "عامة للمدرسة"}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(plan.status)}`}
                          >
                            {translateFeePlanStatus(plan.status)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {renderPlanActions(plan)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="space-y-3 md:hidden">
              {filteredPlans.map(plan => (
                <Card key={plan.id} className="border border-gray-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-[#2C3E50]">{plan.name}</h2>
                      <p className="mt-1 font-mono text-xs text-gray-500">
                        {plan.code}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(plan.status)}`}
                    >
                      {translateFeePlanStatus(plan.status)}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-gray-400">المبلغ</dt>
                      <dd className="mt-1 font-semibold">
                        {formatDzd(Number(plan.amount))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-400">دورة الفوترة</dt>
                      <dd className="mt-1">
                        {translateBillingCycle(plan.billing_cycle)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-gray-400">النطاق</dt>
                      <dd className="mt-1">
                        {plan.branch_id
                          ? (branchNames.get(plan.branch_id) ?? "فرع غير متاح")
                          : "عامة للمدرسة"}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-sm leading-7 text-gray-500">
                    {plan.description ?? "لا يوجد وصف"}
                  </p>
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    {renderPlanActions(plan)}
                  </div>
                </Card>
              ))}
            </div>
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
                المالية / خطط الرسوم
              </button>
              <h1 className="mt-1 text-xl font-bold text-[#2C3E50]">
                خطط الرسوم
              </h1>
              <p className="mt-0.5 text-xs text-gray-500">
                خطط عامة للمدرسة أو مخصصة لأحد الفروع
              </p>
            </div>
          </div>

          {pageData?.access.canManage && loadState === "ready" && (
            <Button
              type="button"
              onClick={openAddDialog}
              className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
            >
              <Plus size={17} />
              إضافة خطة
            </Button>
          )}
        </header>

        <FinanceNavigation currentPath="/finance/fee-plans" />
        <main className="flex-1 p-4 md:p-6">{renderContent()}</main>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={open => {
          if (!isSaving) setDialogOpen(open);
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader className="text-right">
            <DialogTitle>
              {editingPlan ? "تعديل خطة الرسوم" : "إضافة خطة رسوم"}
            </DialogTitle>
            <DialogDescription>
              جميع المبالغ بالدينار الجزائري. نطاق الخطة لا يمكن تغييره بعد
              الإنشاء.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="feePlanBranch"
                className="mb-2 block text-sm font-medium text-[#2C3E50]"
              >
                نطاق الخطة
              </label>
              <select
                id="feePlanBranch"
                value={formValues.branchId}
                disabled={Boolean(editingPlan)}
                onChange={event => updateField("branchId", event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-50"
              >
                {pageData?.access.canManageSchoolWide && (
                  <option value="">عامة للمدرسة</option>
                )}
                {manageableBranches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    فرع: {branch.name}
                  </option>
                ))}
              </select>
              {editingPlan && (
                <p className="mt-1 text-xs text-gray-500">
                  النطاق ثابت لحماية ارتباطات الخطة المالية.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="feePlanName"
                  className="mb-2 block text-sm font-medium text-[#2C3E50]"
                >
                  اسم الخطة <span className="text-red-500">*</span>
                </label>
                <Input
                  id="feePlanName"
                  value={formValues.name}
                  maxLength={150}
                  onChange={event => updateField("name", event.target.value)}
                  placeholder="مثال: الرسوم الشهرية"
                  className="h-11"
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="feePlanCode"
                  className="mb-2 block text-sm font-medium text-[#2C3E50]"
                >
                  الرمز <span className="text-red-500">*</span>
                </label>
                <Input
                  id="feePlanCode"
                  dir="ltr"
                  value={formValues.code}
                  onChange={event =>
                    updateField("code", event.target.value.toUpperCase())
                  }
                  placeholder="MONTHLY_01"
                  className="h-11 text-left font-mono"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                {formErrors.code && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.code}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="feePlanAmount"
                  className="mb-2 block text-sm font-medium text-[#2C3E50]"
                >
                  المبلغ (د.ج) <span className="text-red-500">*</span>
                </label>
                <Input
                  id="feePlanAmount"
                  dir="ltr"
                  inputMode="decimal"
                  value={formValues.amount}
                  onChange={event => updateField("amount", event.target.value)}
                  placeholder="0.00"
                  className="h-11 text-left"
                />
                {formErrors.amount && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.amount}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="feePlanCycle"
                  className="mb-2 block text-sm font-medium text-[#2C3E50]"
                >
                  دورة الفوترة
                </label>
                <select
                  id="feePlanCycle"
                  value={formValues.billingCycle}
                  onChange={event =>
                    updateField(
                      "billingCycle",
                      event.target
                        .value as FeePlanFormValues["billingCycle"]
                    )
                  }
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                >
                  {feePlanBillingCycles.map(cycle => (
                    <option key={cycle} value={cycle}>
                      {translateBillingCycle(cycle)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="feePlanDueDay"
                  className="mb-2 block text-sm font-medium text-[#2C3E50]"
                >
                  يوم الاستحقاق
                </label>
                <Input
                  id="feePlanDueDay"
                  dir="ltr"
                  inputMode="numeric"
                  value={formValues.dueDay}
                  onChange={event => updateField("dueDay", event.target.value)}
                  placeholder="1–28"
                  className="h-11 text-left"
                />
                {formErrors.dueDay && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.dueDay}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="feePlanStatus"
                className="mb-2 block text-sm font-medium text-[#2C3E50]"
              >
                الحالة
              </label>
              <select
                id="feePlanStatus"
                value={formValues.status}
                onChange={event =>
                  updateField(
                    "status",
                    event.target.value as FeePlanFormValues["status"]
                  )
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
              >
                {feePlanStatuses.map(status => (
                  <option key={status} value={status}>
                    {translateFeePlanStatus(status)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="feePlanDescription"
                className="mb-2 block text-sm font-medium text-[#2C3E50]"
              >
                الوصف <span className="text-xs text-gray-400">(اختياري)</span>
              </label>
              <Textarea
                id="feePlanDescription"
                value={formValues.description}
                onChange={event =>
                  updateField("description", event.target.value)
                }
                placeholder="تفاصيل موجزة عن الخطة..."
                rows={3}
              />
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
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
                {isSaving && <RefreshCw size={16} className="animate-spin" />}
                {isSaving ? "جارٍ الحفظ..." : "حفظ الخطة"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
