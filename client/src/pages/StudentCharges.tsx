import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpen,
  CircleDollarSign,
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
import { formatDzd } from "@/lib/finance";
import {
  addStudentCharge,
  calculateNetAmount,
  canManageStudentCharge,
  cancelStudentCharge,
  discountValueTypes,
  fetchStudentChargePageData,
  getStudentChargeSaveErrorMessage,
  isFeePlanAllowedForStudent,
  studentChargeStatuses,
  studentChargeTypes,
  StudentChargePermissionError,
  translateStudentChargeStatus,
  translateStudentChargeType,
  updateStudentCharge,
  validateStudentChargeForm,
  type FinanceStudent,
  type StudentChargeFormErrors,
  type StudentChargeFormValues,
  type StudentChargePageData,
  type StudentChargeRow,
} from "@/lib/student-charges";

type LoadState = "loading" | "ready" | "error" | "forbidden";

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): StudentChargeFormValues => ({
  studentId: "",
  feePlanId: "",
  chargeType: "fee",
  periodStart: "",
  periodEnd: "",
  description: "",
  originalAmount: "",
  discountType: "none",
  discountValue: "",
  discountReason: "",
  dueDate: today(),
});

export default function StudentCharges() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pageData, setPageData] = useState<StudentChargePageData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<StudentChargeRow | null>(
    null
  );
  const [formValues, setFormValues] = useState<StudentChargeFormValues>(
    emptyForm()
  );
  const [formErrors, setFormErrors] = useState<StudentChargeFormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { school, isSchoolAdmin, signOut } = useAuth();

  const loadCharges = useCallback(async () => {
    if (!school?.id) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");
    try {
      const data = await fetchStudentChargePageData(school.id);
      setPageData(data);
      setLoadState("ready");
    } catch (error) {
      setPageData(null);
      setLoadState(
        error instanceof StudentChargePermissionError ? "forbidden" : "error"
      );
    }
  }, [school?.id]);

  useEffect(() => {
    void loadCharges();
  }, [loadCharges]);

  const studentsById = useMemo(
    () =>
      new Map((pageData?.students ?? []).map(student => [student.id, student])),
    [pageData?.students]
  );
  const branchesById = useMemo(
    () =>
      new Map((pageData?.branches ?? []).map(branch => [branch.id, branch.name])),
    [pageData?.branches]
  );
  const plansById = useMemo(
    () => new Map((pageData?.feePlans ?? []).map(plan => [plan.id, plan])),
    [pageData?.feePlans]
  );
  const manageableStudents = useMemo(() => {
    if (!pageData) return [];
    const manageable = new Set(pageData.access.manageableBranchIds);
    return pageData.students.filter(
      student => manageable.has(student.branch_id) && student.status === "active"
    );
  }, [pageData]);
  const selectedStudent = formValues.studentId
    ? studentsById.get(formValues.studentId)
    : undefined;
  const eligiblePlans = useMemo(() => {
    if (!selectedStudent || !pageData) return [];
    return pageData.feePlans.filter(plan =>
      isFeePlanAllowedForStudent(
        plan,
        selectedStudent,
        editingCharge?.fee_plan_id === plan.id
      )
    );
  }, [editingCharge?.fee_plan_id, pageData, selectedStudent]);

  const filteredCharges = useMemo(() => {
    if (!pageData) return [];
    const query = searchQuery.trim().toLocaleLowerCase();

    return pageData.charges.filter(charge => {
      const student = studentsById.get(charge.student_id);
      const plan = charge.fee_plan_id
        ? plansById.get(charge.fee_plan_id)
        : undefined;
      const branchName = branchesById.get(charge.branch_id) ?? "";
      const studentName = student
        ? `${student.first_name} ${student.last_name}`
        : "";
      const searchable =
        `${studentName} ${plan?.name ?? ""} ${plan?.code ?? ""} ${branchName} ${charge.description} ${charge.discount_reason ?? ""}`.toLocaleLowerCase();

      return (
        (query === "" || searchable.includes(query)) &&
        (branchFilter === "all" || charge.branch_id === branchFilter) &&
        (statusFilter === "all" || charge.status === statusFilter) &&
        (planFilter === "all" ||
          (planFilter === "none"
            ? charge.fee_plan_id === null
            : charge.fee_plan_id === planFilter)) &&
        (dueFrom === "" || charge.due_date >= dueFrom) &&
        (dueTo === "" || charge.due_date <= dueTo)
      );
    });
  }, [
    branchFilter,
    branchesById,
    dueFrom,
    dueTo,
    pageData,
    planFilter,
    plansById,
    searchQuery,
    statusFilter,
    studentsById,
  ]);

  const updateField = <K extends keyof StudentChargeFormValues>(
    field: K,
    value: StudentChargeFormValues[K]
  ) => {
    setFormValues(current => ({ ...current, [field]: value }));
    setFormErrors(current => ({ ...current, [field]: undefined }));
  };

  const handleStudentChange = (studentId: string) => {
    const student = studentsById.get(studentId);
    setFormValues(current => {
      const currentPlan = current.feePlanId
        ? plansById.get(current.feePlanId)
        : undefined;
      const keepPlan =
        student &&
        currentPlan &&
        isFeePlanAllowedForStudent(currentPlan, student);
      return {
        ...current,
        studentId,
        feePlanId: keepPlan ? current.feePlanId : "",
      };
    });
    setFormErrors(current => ({
      ...current,
      studentId: undefined,
      feePlanId: undefined,
    }));
  };

  const handlePlanChange = (planId: string) => {
    const plan = plansById.get(planId);
    setFormValues(current => ({
      ...current,
      feePlanId: planId,
      originalAmount: plan ? String(plan.amount) : current.originalAmount,
    }));
    setFormErrors(current => ({
      ...current,
      feePlanId: undefined,
      originalAmount: undefined,
    }));
  };

  const openAddDialog = () => {
    if (!pageData?.access.canManage || manageableStudents.length === 0) return;
    setEditingCharge(null);
    setFormValues({
      ...emptyForm(),
      studentId: manageableStudents[0]?.id ?? "",
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (charge: StudentChargeRow) => {
    if (
      !pageData ||
      !canManageStudentCharge(charge, pageData.access) ||
      ["waived", "cancelled"].includes(charge.status)
    ) {
      return;
    }

    setEditingCharge(charge);
    setFormValues({
      studentId: charge.student_id,
      feePlanId: charge.fee_plan_id ?? "",
      chargeType: charge.charge_type,
      periodStart: charge.period_start ?? "",
      periodEnd: charge.period_end ?? "",
      description: charge.description,
      originalAmount: String(charge.original_amount),
      discountType: charge.discount_value_type ?? "none",
      discountValue:
        charge.discount_value === null ? "" : String(charge.discount_value),
      discountReason: charge.discount_reason ?? "",
      dueDate: charge.due_date,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const validateScope = (
    values: StudentChargeFormValues
  ): StudentChargeFormErrors => {
    const errors = validateStudentChargeForm(values);
    const student = studentsById.get(values.studentId);

    if (
      !student ||
      !pageData?.access.manageableBranchIds.includes(student.branch_id)
    ) {
      errors.studentId = "لا تملك صلاحية الإدارة في فرع هذا الطالب.";
    }

    if (values.feePlanId) {
      const plan = plansById.get(values.feePlanId);
      if (
        !student ||
        !plan ||
        !isFeePlanAllowedForStudent(
          plan,
          student,
          editingCharge?.fee_plan_id === plan.id
        )
      ) {
        errors.feePlanId = "خطة الرسوم غير متاحة لفرع الطالب.";
      }
    }

    return errors;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!school?.id || !pageData) return;

    const errors = validateScope(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const student = studentsById.get(formValues.studentId);
    if (!student) return;

    setIsSaving(true);
    try {
      if (editingCharge) {
        await updateStudentCharge(school.id, editingCharge.id, formValues);
        toast.success("تم تحديث الاستحقاق.");
      } else {
        await addStudentCharge(school.id, student, formValues);
        toast.success("تم إنشاء الاستحقاق.");
      }
      setDialogOpen(false);
      await loadCharges();
    } catch (error) {
      toast.error(getStudentChargeSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async (charge: StudentChargeRow) => {
    if (
      !pageData ||
      charge.status !== "pending" ||
      !canManageStudentCharge(charge, pageData.access)
    ) {
      return;
    }
    const student = studentsById.get(charge.student_id);
    const confirmed = window.confirm(
      `هل تريد إلغاء استحقاق ${student ? `${student.first_name} ${student.last_name}` : "الطالب"}؟ سيبقى محفوظًا في السجل.`
    );
    if (!confirmed) return;

    setCancellingId(charge.id);
    try {
      await cancelStudentCharge(charge.id);
      toast.success("تم إلغاء الاستحقاق دون حذفه.");
      await loadCharges();
    } catch (error) {
      toast.error(getStudentChargeSaveErrorMessage(error));
    } finally {
      setCancellingId(null);
    }
  };

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
      { label: "خطط الرسوم", icon: Tags, path: "/finance/fee-plans" },
      {
        label: "الاستحقاقات",
        icon: CircleDollarSign,
        path: "/finance/charges",
      },
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
                item.path === "/finance/charges"
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

  const statusClass = (status: StudentChargeRow["status"]) =>
    ({
      pending: "border-amber-200 bg-amber-50 text-amber-700",
      partially_paid: "border-sky-200 bg-sky-50 text-sky-700",
      paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
      waived: "border-violet-200 bg-violet-50 text-violet-700",
      cancelled: "border-gray-200 bg-gray-100 text-gray-600",
    })[status];

  const renderActions = (charge: StudentChargeRow) => {
    const canManage = pageData
      ? canManageStudentCharge(charge, pageData.access)
      : false;
    if (!canManage) return <span className="text-xs text-gray-400">عرض فقط</span>;

    return (
      <div className="flex flex-wrap gap-2">
        {!["waived", "cancelled"].includes(charge.status) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => openEditDialog(charge)}
          >
            <Pencil size={14} />
            تعديل
          </Button>
        )}
        {charge.status === "pending" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cancellingId === charge.id}
            className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => void handleCancel(charge)}
          >
            {cancellingId === charge.id ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Ban size={14} />
            )}
            إلغاء
          </Button>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (loadState === "loading") {
      return (
        <div role="status" className="space-y-4">
          <div className="h-28 animate-pulse rounded-xl bg-white" />
          <div className="h-72 animate-pulse rounded-xl bg-white" />
          <span className="sr-only">جارٍ تحميل الاستحقاقات</span>
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
            لا تملك صلاحية عرض الاستحقاقات
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            يلزم finance.view أو finance.manage ضمن فرع مصرح به.
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
            تعذر تحميل الاستحقاقات حاليًا.
          </p>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void loadCharges()}
          >
            <RefreshCw size={16} />
            إعادة المحاولة
          </Button>
        </Card>
      );
    }
    if (pageData.charges.length === 0) {
      return (
        <Card className="border border-dashed border-[#C8A26A]/60 bg-white p-10 text-center">
          <CircleDollarSign className="mx-auto text-[#9A7137]" size={36} />
          <h2 className="mt-4 text-lg font-bold text-[#2C3E50]">
            لا توجد استحقاقات بعد
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-gray-600">
            أنشئ أول استحقاق لطالب في أحد الفروع التي تملك صلاحية إدارتها.
          </p>
          {pageData.access.canManage && manageableStudents.length > 0 && (
            <Button
              type="button"
              onClick={openAddDialog}
              className="mt-5 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
            >
              <Plus size={17} />
              إنشاء استحقاق
            </Button>
          )}
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card className="border border-gray-100 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative xl:col-span-2">
              <Search
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="البحث بالطالب أو الخطة أو الملاحظات..."
                className="h-10 pr-10"
              />
            </div>
            <select
              aria-label="تصفية حسب الفرع"
              value={branchFilter}
              onChange={event => setBranchFilter(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="all">جميع الفروع</option>
              {pageData.branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
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
              {studentChargeStatuses.map(status => (
                <option key={status} value={status}>
                  {translateStudentChargeStatus(status)}
                </option>
              ))}
            </select>
            <select
              aria-label="تصفية حسب خطة الرسوم"
              value={planFilter}
              onChange={event => setPlanFilter(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm sm:col-span-2"
            >
              <option value="all">جميع خطط الرسوم</option>
              <option value="none">بدون خطة</option>
              {pageData.feePlans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.code})
                </option>
              ))}
            </select>
            <label className="space-y-1 text-xs text-gray-500">
              <span>الاستحقاق من</span>
              <Input
                type="date"
                value={dueFrom}
                onChange={event => setDueFrom(event.target.value)}
                className="h-10"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-500">
              <span>الاستحقاق إلى</span>
              <Input
                type="date"
                value={dueTo}
                min={dueFrom || undefined}
                onChange={event => setDueTo(event.target.value)}
                className="h-10"
              />
            </label>
          </div>
        </Card>

        {filteredCharges.length === 0 ? (
          <Card className="border border-gray-100 bg-white p-10 text-center text-gray-500">
            لا توجد استحقاقات مطابقة للبحث والتصفية.
          </Card>
        ) : (
          <>
            <Card className="hidden overflow-hidden border border-gray-100 bg-white lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-right text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">الطالب</th>
                      <th className="px-4 py-3 font-medium">الخطة</th>
                      <th className="px-4 py-3 font-medium">المبالغ</th>
                      <th className="px-4 py-3 font-medium">الاستحقاق</th>
                      <th className="px-4 py-3 font-medium">الحالة</th>
                      <th className="px-4 py-3 font-medium">الفرع والملاحظات</th>
                      <th className="px-4 py-3 font-medium">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCharges.map(charge => {
                      const student = studentsById.get(charge.student_id);
                      const plan = charge.fee_plan_id
                        ? plansById.get(charge.fee_plan_id)
                        : undefined;
                      return (
                        <tr key={charge.id} className="align-top hover:bg-gray-50/70">
                          <td className="px-4 py-4 font-semibold text-[#2C3E50]">
                            {student
                              ? `${student.first_name} ${student.last_name}`
                              : "طالب غير متاح"}
                          </td>
                          <td className="px-4 py-4">
                            <p>{plan?.name ?? "بدون خطة"}</p>
                            <p className="mt-1 text-xs text-gray-400">
                              {translateStudentChargeType(charge.charge_type)}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <p>الأصلي: {formatDzd(Number(charge.original_amount))}</p>
                            <p className="mt-1 text-xs text-rose-600">
                              الخصم: {formatDzd(Number(charge.discount_amount))}
                            </p>
                            <p className="mt-1 font-semibold text-[#0B4738]">
                              الصافي: {formatDzd(Number(charge.net_amount))}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-gray-600">
                            {charge.due_date}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(charge.status)}`}
                            >
                              {translateStudentChargeStatus(charge.status)}
                            </span>
                          </td>
                          <td className="max-w-xs px-4 py-4">
                            <p>
                              {branchesById.get(charge.branch_id) ??
                                "فرع غير متاح"}
                            </p>
                            <p className="mt-2 text-xs leading-6 text-gray-500">
                              {charge.description}
                            </p>
                            {charge.discount_reason && (
                              <p className="mt-1 text-xs leading-6 text-rose-600">
                                سبب الخصم: {charge.discount_reason}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4">{renderActions(charge)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="space-y-3 lg:hidden">
              {filteredCharges.map(charge => {
                const student = studentsById.get(charge.student_id);
                const plan = charge.fee_plan_id
                  ? plansById.get(charge.fee_plan_id)
                  : undefined;
                return (
                  <Card key={charge.id} className="border border-gray-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-bold text-[#2C3E50]">
                          {student
                            ? `${student.first_name} ${student.last_name}`
                            : "طالب غير متاح"}
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                          {plan?.name ?? "بدون خطة"} ·{" "}
                          {branchesById.get(charge.branch_id) ?? "فرع غير متاح"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(charge.status)}`}
                      >
                        {translateStudentChargeStatus(charge.status)}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-gray-400">المبلغ الأصلي</dt>
                        <dd className="mt-1">
                          {formatDzd(Number(charge.original_amount))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-400">الخصم</dt>
                        <dd className="mt-1 text-rose-600">
                          {formatDzd(Number(charge.discount_amount))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-400">الصافي</dt>
                        <dd className="mt-1 font-semibold text-[#0B4738]">
                          {formatDzd(Number(charge.net_amount))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-400">تاريخ الاستحقاق</dt>
                        <dd className="mt-1">{charge.due_date}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-sm leading-7 text-gray-500">
                      {charge.description}
                    </p>
                    {charge.discount_reason && (
                      <p className="mt-1 text-xs leading-6 text-rose-600">
                        سبب الخصم: {charge.discount_reason}
                      </p>
                    )}
                    <div className="mt-4 border-t border-gray-100 pt-3">
                      {renderActions(charge)}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const netPreview = (() => {
    const net = calculateNetAmount(formValues);
    return Number.isFinite(net) && net >= 0 ? net : 0;
  })();

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
                المالية / الاستحقاقات
              </button>
              <h1 className="mt-1 text-xl font-bold text-[#2C3E50]">
                استحقاقات الطلاب
              </h1>
              <p className="mt-0.5 text-xs text-gray-500">
                الرسوم والخصومات ضمن الفروع المصرح بها
              </p>
            </div>
          </div>
          {pageData?.access.canManage &&
            manageableStudents.length > 0 &&
            loadState === "ready" && (
              <Button
                type="button"
                onClick={openAddDialog}
                className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                <Plus size={17} />
                إنشاء استحقاق
              </Button>
            )}
        </header>
        <FinanceNavigation currentPath="/finance/charges" />
        <main className="flex-1 p-4 md:p-6">{renderContent()}</main>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={open => {
          if (!isSaving) setDialogOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[92vh] max-w-3xl overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader className="text-right">
            <DialogTitle>
              {editingCharge ? "تعديل الاستحقاق" : "إنشاء استحقاق جديد"}
            </DialogTitle>
            <DialogDescription>
              تُحسب القيمة الصافية تلقائيًا، وتبقى هوية الطالب والفرع ثابتة
              بعد الإنشاء.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">الطالب</span>
                <select
                  value={formValues.studentId}
                  disabled={Boolean(editingCharge)}
                  onChange={event => handleStudentChange(event.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 disabled:bg-gray-100"
                >
                  <option value="">اختر الطالب</option>
                  {(editingCharge ? pageData?.students ?? [] : manageableStudents).map(
                    student => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name} —{" "}
                        {branchesById.get(student.branch_id) ?? "فرع غير متاح"}
                      </option>
                    )
                  )}
                </select>
                {formErrors.studentId && (
                  <p className="text-xs text-red-600">{formErrors.studentId}</p>
                )}
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">خطة الرسوم</span>
                <select
                  value={formValues.feePlanId}
                  onChange={event => handlePlanChange(event.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3"
                >
                  <option value="">بدون خطة</option>
                  {eligiblePlans.map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.code}) — {formatDzd(Number(plan.amount))}
                    </option>
                  ))}
                </select>
                {formErrors.feePlanId && (
                  <p className="text-xs text-red-600">{formErrors.feePlanId}</p>
                )}
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">نوع الاستحقاق</span>
                <select
                  value={formValues.chargeType}
                  onChange={event =>
                    updateField(
                      "chargeType",
                      event.target.value as StudentChargeFormValues["chargeType"]
                    )
                  }
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3"
                >
                  {studentChargeTypes.map(type => (
                    <option key={type} value={type}>
                      {translateStudentChargeType(type)}
                    </option>
                  ))}
                </select>
                {formErrors.chargeType && (
                  <p className="text-xs text-red-600">{formErrors.chargeType}</p>
                )}
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">المبلغ الأصلي (دج)</span>
                <Input
                  inputMode="decimal"
                  value={formValues.originalAmount}
                  onChange={event =>
                    updateField("originalAmount", event.target.value)
                  }
                  placeholder="1500"
                />
                {formErrors.originalAmount && (
                  <p className="text-xs text-red-600">
                    {formErrors.originalAmount}
                  </p>
                )}
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">نوع الخصم</span>
                <select
                  value={formValues.discountType}
                  onChange={event => {
                    const discountType = event.target
                      .value as StudentChargeFormValues["discountType"];
                    setFormValues(current => ({
                      ...current,
                      discountType,
                      discountValue:
                        discountType === "none" ? "" : current.discountValue,
                      discountReason:
                        discountType === "none" ? "" : current.discountReason,
                    }));
                    setFormErrors(current => ({
                      ...current,
                      discountType: undefined,
                      discountValue: undefined,
                      discountReason: undefined,
                    }));
                  }}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3"
                >
                  {discountValueTypes.map(type => (
                    <option key={type} value={type}>
                      {type === "none"
                        ? "بدون خصم"
                        : type === "fixed"
                          ? "مبلغ ثابت"
                          : "نسبة مئوية"}
                    </option>
                  ))}
                </select>
              </label>

              {formValues.discountType !== "none" && (
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">
                    {formValues.discountType === "fixed"
                      ? "قيمة الخصم (دج)"
                      : "نسبة الخصم (%)"}
                  </span>
                  <Input
                    inputMode="decimal"
                    value={formValues.discountValue}
                    onChange={event =>
                      updateField("discountValue", event.target.value)
                    }
                    placeholder={
                      formValues.discountType === "fixed" ? "200" : "10"
                    }
                  />
                  {formErrors.discountValue && (
                    <p className="text-xs text-red-600">
                      {formErrors.discountValue}
                    </p>
                  )}
                </label>
              )}

              {formValues.discountType !== "none" && (
                <label className="space-y-1.5 text-sm sm:col-span-2">
                  <span className="font-medium">سبب الخصم</span>
                  <Input
                    value={formValues.discountReason}
                    onChange={event =>
                      updateField("discountReason", event.target.value)
                    }
                    maxLength={250}
                    placeholder="مثال: خصم الإخوة"
                  />
                  {formErrors.discountReason && (
                    <p className="text-xs text-red-600">
                      {formErrors.discountReason}
                    </p>
                  )}
                </label>
              )}

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">بداية الفترة (اختياري)</span>
                <Input
                  type="date"
                  value={formValues.periodStart}
                  onChange={event => updateField("periodStart", event.target.value)}
                />
                {formErrors.periodStart && (
                  <p className="text-xs text-red-600">{formErrors.periodStart}</p>
                )}
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">نهاية الفترة (اختياري)</span>
                <Input
                  type="date"
                  min={formValues.periodStart || undefined}
                  value={formValues.periodEnd}
                  onChange={event => updateField("periodEnd", event.target.value)}
                />
                {formErrors.periodEnd && (
                  <p className="text-xs text-red-600">{formErrors.periodEnd}</p>
                )}
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">تاريخ الاستحقاق</span>
                <Input
                  type="date"
                  value={formValues.dueDate}
                  onChange={event => updateField("dueDate", event.target.value)}
                />
                {formErrors.dueDate && (
                  <p className="text-xs text-red-600">{formErrors.dueDate}</p>
                )}
              </label>
              <div className="rounded-xl border border-[#0B4738]/10 bg-[#0B4738]/5 p-3">
                <p className="text-xs text-gray-500">المبلغ الصافي المتوقع</p>
                <p className="mt-1 text-lg font-bold text-[#0B4738]">
                  {formatDzd(netPreview)}
                </p>
              </div>
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium">الملاحظات</span>
                <Textarea
                  value={formValues.description}
                  onChange={event =>
                    updateField("description", event.target.value)
                  }
                  maxLength={200}
                  rows={3}
                  placeholder="وصف مختصر للاستحقاق"
                />
                {formErrors.description && (
                  <p className="text-xs text-red-600">
                    {formErrors.description}
                  </p>
                )}
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
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
                className="bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                {isSaving
                  ? "جارٍ الحفظ..."
                  : editingCharge
                    ? "حفظ التعديلات"
                    : "إنشاء الاستحقاق"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
