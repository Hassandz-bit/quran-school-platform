import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import StaffPayrollNavigation from "@/components/StaffPayrollNavigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import {
  PAYROLL_ENTRY_STATUS_LABELS,
  PAYROLL_PAYMENT_METHOD_LABELS,
  PAYROLL_PERIOD_STATUS_LABELS,
  adjustPayrollEntry,
  approvePayrollPeriod,
  cancelPayrollEntry,
  cancelPayrollPeriod,
  closePayrollPeriod,
  createPayrollCompensation,
  fetchPayrollScopes,
  fetchPayrollWorkspace,
  generatePayrollPeriod,
  recordPayrollPayment,
  reversePayrollPayment,
  setPayrollCompensationStatus,
  type PayrollCandidate,
  type PayrollEntry,
  type PayrollPaymentMethod,
  type PayrollScope,
  type PayrollWorkspace,
} from "@/lib/payroll";

type LoadState = "loading" | "ready" | "forbidden" | "error";
type AdjustmentDraft = {
  additions: string;
  deductions: string;
  advances: string;
};

type RunAction = (
  action: () => Promise<unknown>,
  success: string
) => Promise<void>;

const monthStart = () => new Date().toISOString().slice(0, 7) + "-01";
const today = () => new Date().toISOString().slice(0, 10);
const toNumber = (value: string) => Number(value || 0);

export default function Payroll() {
  const { school } = useAuth();
  const [scopes, setScopes] = useState<PayrollScope[]>([]);
  const [scopeKey, setScopeKey] = useState("");
  const [periodMonth, setPeriodMonth] = useState(monthStart);
  const [workspace, setWorkspace] = useState<PayrollWorkspace | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [candidateKey, setCandidateKey] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [adjustments, setAdjustments] = useState<
    Record<string, AdjustmentDraft>
  >({});
  const [paymentMethod, setPaymentMethod] =
    useState<PayrollPaymentMethod>("cash");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentReference, setPaymentReference] = useState("");
  const [reversalReason, setReversalReason] = useState("");

  const selectedScope = useMemo(
    () =>
      scopes.find(scope => (scope.branchId ?? "school") === scopeKey) ?? null,
    [scopeKey, scopes]
  );

  const selectedPeriod = useMemo(
    () =>
      workspace?.periods.find(period => period.periodMonth === periodMonth) ??
      null,
    [periodMonth, workspace?.periods]
  );

  const candidateMap = useMemo(() => {
    const map = new Map<string, PayrollCandidate>();
    workspace?.candidates.forEach(candidate => {
      const id = candidate.employeeId ?? candidate.teacherId ?? candidate.membershipId;
      map.set(`${candidate.kind}:${id}`, candidate);
    });
    return map;
  }, [workspace?.candidates]);

  const loadScopes = useCallback(async () => {
    if (!school?.id) return;
    try {
      const nextScopes = await fetchPayrollScopes(school.id);
      setScopes(nextScopes);
      if (nextScopes.length === 0) {
        setLoadState("forbidden");
        return;
      }
      setScopeKey(current => current || (nextScopes[0].branchId ?? "school"));
    } catch {
      setLoadState("error");
    }
  }, [school?.id]);

  const loadWorkspace = useCallback(async () => {
    if (!school?.id || !selectedScope) return;
    setLoadState("loading");
    try {
      const data = await fetchPayrollWorkspace(
        school.id,
        selectedScope.branchId,
        periodMonth
      );
      setWorkspace(data);
      setLoadState("ready");
      setAdjustments(
        Object.fromEntries(
          data.entries.map(entry => [
            entry.id,
            {
              additions: String(entry.additions),
              deductions: String(entry.deductions),
              advances: String(entry.advances),
            },
          ])
        )
      );
    } catch (error) {
      setWorkspace(null);
      setLoadState(
        String(error).includes("PAYROLL_VIEW_REQUIRED")
          ? "forbidden"
          : "error"
      );
    }
  }, [periodMonth, school?.id, selectedScope]);

  useEffect(() => {
    void loadScopes();
  }, [loadScopes]);

  useEffect(() => {
    if (selectedScope) void loadWorkspace();
  }, [loadWorkspace, selectedScope]);

  const run: RunAction = async (action, success) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await loadWorkspace();
    } catch (error) {
      console.error(error);
      toast.error(
        "تعذر تنفيذ العملية. تحقق من الحالة والصلاحيات والبيانات المدخلة."
      );
    } finally {
      setBusy(false);
    }
  };

  const createCompensation = async () => {
    if (!school?.id || !selectedScope) return;
    const candidate = candidateMap.get(candidateKey);
    if (!candidate || !baseAmount || toNumber(baseAmount) <= 0) {
      toast.error("اختر الموظف وأدخل راتبًا صحيحًا.");
      return;
    }
    await run(
      () =>
        createPayrollCompensation({
          schoolId: school.id,
          branchId: selectedScope.branchId,
          candidate,
          baseAmount: toNumber(baseAmount),
          effectiveFrom,
        }),
      "تم حفظ إعداد الراتب مع تاريخ سريانه."
    );
    setBaseAmount("");
    setCandidateKey("");
  };

  const saveAdjustment = async (entry: PayrollEntry) => {
    if (!school?.id) return;
    const draft = adjustments[entry.id];
    if (!draft) return;
    await run(
      () =>
        adjustPayrollEntry(school.id, entry.id, {
          additions: toNumber(draft.additions),
          deductions: toNumber(draft.deductions),
          advances: toNumber(draft.advances),
        }),
      "تم تحديث زيادات وخصومات الراتب."
    );
  };

  if (loadState === "forbidden") {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <h1 className="text-xl font-bold">الرواتب غير متاحة</h1>
        <p className="mt-2 text-sm text-gray-500">
          يلزم finance.view أو finance.manage في نطاق مالي مسموح.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <StaffPayrollNavigation currentPath="/staff/payroll" />

      <header className="flex flex-col gap-3 rounded-2xl border border-[#E2EAE4] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold text-[#17663B]">المالية · الأجور</p>
          <h1 className="mt-1 text-2xl font-bold text-[#173B2D]">
            رواتب المعلمين والإداريين
          </h1>
          <p className="mt-1 text-sm text-[#607368]">
            مسير شهري مدقّق: الراتب الأساسي + الزيادات − الخصومات − السلف.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadWorkspace()}
            disabled={busy || !selectedScope}
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            تحديث
          </Button>
        </div>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
          الشهر
          <Input
            type="month"
            value={periodMonth.slice(0, 7)}
            onChange={event => setPeriodMonth(event.target.value + "-01")}
            className="mt-1"
          />
        </label>

        <div className="self-end rounded-xl bg-[#F5F8F5] p-3 text-sm">
          <span className="text-[#718377]">حالة المسير</span>
          <b className="me-2">
            {selectedPeriod
              ? PAYROLL_PERIOD_STATUS_LABELS[selectedPeriod.status]
              : "لم يُنشأ"}
          </b>
        </div>

        <div className="self-end">
          {workspace?.canManage &&
            !selectedPeriod &&
            selectedScope &&
            school?.id && (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      generatePayrollPeriod(
                        school.id,
                        selectedScope.branchId,
                        periodMonth
                      ),
                    "تم إنشاء مسير الشهر دون تكرار البنود."
                  )
                }
              >
                إنشاء مسير الشهر
              </Button>
            )}
        </div>
      </Card>

      {loadState === "loading" && (
        <Card className="grid min-h-32 place-items-center p-6">
          <span className="flex items-center gap-2 text-sm">
            <RefreshCw className="size-4 animate-spin" />
            جارٍ تحميل الرواتب...
          </span>
        </Card>
      )}

      {loadState === "error" && (
        <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-700">
          تعذر تحميل بيانات الرواتب حاليًا.
        </Card>
      )}

      {loadState === "ready" && workspace && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="عدد البنود"
              value={String(
                selectedPeriod?.entryCount ?? workspace.entries.length
              )}
              icon={<Users className="size-5" />}
            />
            <Metric
              label="صافي المسير"
              value={formatDzd(selectedPeriod?.netTotal ?? 0)}
              icon={<BadgeDollarSign className="size-5" />}
            />
            <Metric
              label="المدفوع"
              value={formatDzd(selectedPeriod?.paidTotal ?? 0)}
              icon={<CheckCircle2 className="size-5" />}
            />
            <Metric
              label="المتبقي"
              value={formatDzd(
                Math.max(
                  0,
                  (selectedPeriod?.netTotal ?? 0) -
                    (selectedPeriod?.paidTotal ?? 0)
                )
              )}
              icon={<CalendarCheck className="size-5" />}
            />
          </section>

          {workspace.canManage && (
            <Card className="p-4">
              <h2 className="font-bold text-[#173B2D]">إعداد راتب جديد</h2>
              <p className="mt-1 text-xs text-[#718377]">
                عند تغيير الراتب، أنهِ سريان الإعداد القديم وأنشئ إعدادًا جديدًا
                بتاريخ سريان جديد. لا تُعدّل التاريخ الماضي.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-bold">
                  المعلم / الإداري
                  <select
                    value={candidateKey}
                    onChange={event => setCandidateKey(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
                  >
                    <option value="">اختر...</option>
                    {workspace.candidates.map(candidate => {
                      const key = `${candidate.kind}:${
                        candidate.employeeId ?? candidate.teacherId ?? candidate.membershipId
                      }`;
                      return (
                        <option key={key} value={key}>
                          {candidate.name} · {candidate.roleLabel}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="text-xs font-bold">
                  الراتب الأساسي
                  <Input
                    inputMode="decimal"
                    value={baseAmount}
                    onChange={event => setBaseAmount(event.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="text-xs font-bold">
                  تاريخ السريان
                  <Input
                    type="date"
                    value={effectiveFrom}
                    onChange={event => setEffectiveFrom(event.target.value)}
                    className="mt-1"
                  />
                </label>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void createCompensation()}
                  className="self-end"
                >
                  حفظ إعداد الراتب
                </Button>
              </div>
            </Card>
          )}

          <CompensationHistory
            workspace={workspace}
            schoolId={school?.id ?? ""}
            busy={busy}
            run={run}
          />

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="font-bold text-[#173B2D]">
                  بنود مسير {periodMonth.slice(0, 7)}
                </h2>
                <p className="text-xs text-[#718377]">
                  التعديل متاح في المسودة فقط، والدفع بعد الاعتماد فقط.
                </p>
              </div>
              {workspace.canManage && selectedPeriod && school?.id && (
                <PeriodActions
                  period={selectedPeriod}
                  schoolId={school.id}
                  busy={busy}
                  run={run}
                />
              )}
            </div>

            {workspace.entries.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">
                لا توجد بنود لهذا الشهر. تأكد من إعداد الرواتب ثم أنشئ أو أعد
                توليد المسير وهو مسودة.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-right text-sm">
                  <thead className="bg-[#F5F8F5] text-xs text-[#607368]">
                    <tr>
                      <th className="p-3">المستفيد</th>
                      <th className="p-3">الأساسي</th>
                      <th className="p-3">زيادات</th>
                      <th className="p-3">خصومات</th>
                      <th className="p-3">سلف</th>
                      <th className="p-3">الصافي</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {workspace.entries.map(entry => (
                      <PayrollEntryRow
                        key={entry.id}
                        entry={entry}
                        draft={adjustments[entry.id]}
                        setDraft={draft =>
                          setAdjustments(current => ({
                            ...current,
                            [entry.id]: draft,
                          }))
                        }
                        canManage={workspace.canManage}
                        busy={busy}
                        schoolId={school?.id ?? ""}
                        paymentDate={paymentDate}
                        paymentMethod={paymentMethod}
                        paymentReference={paymentReference}
                        reversalReason={reversalReason}
                        onSave={() => void saveAdjustment(entry)}
                        run={run}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {workspace.canManage && selectedPeriod?.status === "approved" && (
            <PaymentControls
              paymentDate={paymentDate}
              setPaymentDate={setPaymentDate}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              paymentReference={paymentReference}
              setPaymentReference={setPaymentReference}
              reversalReason={reversalReason}
              setReversalReason={setReversalReason}
            />
          )}
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
  icon: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[#17663B]">
        {icon}
        <span className="text-xs font-bold">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold text-[#173B2D]">{value}</p>
    </Card>
  );
}

function CompensationHistory({
  workspace,
  schoolId,
  busy,
  run,
}: {
  workspace: PayrollWorkspace;
  schoolId: string;
  busy: boolean;
  run: RunAction;
}) {
  return (
    <Card className="p-4">
      <div>
        <h2 className="font-bold text-[#173B2D]">إعدادات الرواتب</h2>
        <p className="text-xs text-[#718377]">
          السجل التاريخي محفوظ ولا يُحذف.
        </p>
      </div>
      {workspace.profiles.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          لا توجد إعدادات راتب في هذا النطاق.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspace.profiles.map(profile => (
            <article key={profile.id} className="rounded-xl border p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">{profile.payeeName}</h3>
                  <p className="text-xs text-[#718377]">
                    من {profile.effectiveFrom}
                    {profile.effectiveTo ? ` إلى ${profile.effectiveTo}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-[#F5F8F5] px-2 py-1 text-xs">
                  {profile.status === "active"
                    ? "نشط"
                    : profile.status === "inactive"
                      ? "متوقف"
                      : "مؤرشف"}
                </span>
              </div>
              <p className="mt-3 text-lg font-bold text-[#17663B]">
                {formatDzd(profile.baseAmount)}
              </p>
              {workspace.canManage &&
                profile.status === "active" &&
                schoolId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          setPayrollCompensationStatus(
                            schoolId,
                            profile.id,
                            "inactive",
                            today()
                          ),
                        "تم إنهاء سريان إعداد الراتب مع حفظ التاريخ."
                      )
                    }
                  >
                    إنهاء السريان
                  </Button>
                )}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function PeriodActions({
  period,
  schoolId,
  busy,
  run,
}: {
  period: NonNullable<PayrollWorkspace["periods"][number]>;
  schoolId: string;
  busy: boolean;
  run: RunAction;
}) {
  if (period.status === "draft") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() =>
            void run(
              () => approvePayrollPeriod(schoolId, period.id),
              "تم اعتماد المسير وأصبح جاهزًا للدفع."
            )
          }
        >
          اعتماد المسير
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(
              () => cancelPayrollPeriod(schoolId, period.id),
              "تم إلغاء المسير مع حفظ أثره."
            )
          }
        >
          إلغاء المسير
        </Button>
      </div>
    );
  }
  if (period.status === "approved") {
    return (
      <Button
        disabled={busy}
        onClick={() =>
          void run(
            () => closePayrollPeriod(schoolId, period.id),
            "تم إغلاق المسير بعد تسوية البنود."
          )
        }
      >
        إغلاق المسير
      </Button>
    );
  }
  return null;
}

function PaymentControls({
  paymentDate,
  setPaymentDate,
  paymentMethod,
  setPaymentMethod,
  paymentReference,
  setPaymentReference,
  reversalReason,
  setReversalReason,
}: {
  paymentDate: string;
  setPaymentDate: (value: string) => void;
  paymentMethod: PayrollPaymentMethod;
  setPaymentMethod: (value: PayrollPaymentMethod) => void;
  paymentReference: string;
  setPaymentReference: (value: string) => void;
  reversalReason: string;
  setReversalReason: (value: string) => void;
}) {
  return (
    <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-bold">
        تاريخ الدفع
        <Input
          type="date"
          value={paymentDate}
          onChange={event => setPaymentDate(event.target.value)}
          className="mt-1"
        />
      </label>
      <label className="text-xs font-bold">
        طريقة الدفع
        <select
          value={paymentMethod}
          onChange={event =>
            setPaymentMethod(event.target.value as PayrollPaymentMethod)
          }
          className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
        >
          {Object.entries(PAYROLL_PAYMENT_METHOD_LABELS).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            )
          )}
        </select>
      </label>
      <label className="text-xs font-bold">
        مرجع الدفع
        <Input
          value={paymentReference}
          onChange={event => setPaymentReference(event.target.value)}
          className="mt-1"
          placeholder="اختياري"
        />
      </label>
      <label className="text-xs font-bold">
        سبب عكس الدفع
        <Input
          value={reversalReason}
          onChange={event => setReversalReason(event.target.value)}
          className="mt-1"
          placeholder="يُستخدم فقط عند العكس"
        />
      </label>
    </Card>
  );
}

function PayrollEntryRow({
  entry,
  draft,
  setDraft,
  canManage,
  busy,
  schoolId,
  paymentDate,
  paymentMethod,
  paymentReference,
  reversalReason,
  onSave,
  run,
}: {
  entry: PayrollEntry;
  draft?: AdjustmentDraft;
  setDraft: (draft: AdjustmentDraft) => void;
  canManage: boolean;
  busy: boolean;
  schoolId: string;
  paymentDate: string;
  paymentMethod: PayrollPaymentMethod;
  paymentReference: string;
  reversalReason: string;
  onSave: () => void;
  run: RunAction;
}) {
  const current = draft ?? {
    additions: String(entry.additions),
    deductions: String(entry.deductions),
    advances: String(entry.advances),
  };
  const editable = canManage && entry.status === "draft";

  return (
    <tr>
      <td className="p-3">
        <b>{entry.payeeName}</b>
        <p className="text-xs text-[#718377]">
          {entry.roleLabel ??
            (entry.payeeKind === "teacher" ? "معلم" : "إداري/موظف")}
        </p>
      </td>
      <td className="p-3 font-semibold">{formatDzd(entry.baseAmount)}</td>
      {(["additions", "deductions", "advances"] as const).map(field => (
        <td key={field} className="p-2">
          {editable ? (
            <Input
              inputMode="decimal"
              value={current[field]}
              onChange={event =>
                setDraft({ ...current, [field]: event.target.value })
              }
              className="h-9 min-w-24"
            />
          ) : (
            formatDzd(entry[field])
          )}
        </td>
      ))}
      <td className="p-3 font-bold text-[#17663B]">
        {formatDzd(entry.netAmount)}
      </td>
      <td className="p-3">
        {PAYROLL_ENTRY_STATUS_LABELS[entry.status]}
        {entry.payment && (
          <p className="mt-1 text-xs text-[#718377]">
            {entry.payment.paymentDate} ·{" "}
            {PAYROLL_PAYMENT_METHOD_LABELS[entry.payment.paymentMethod]}
          </p>
        )}
      </td>
      <td className="p-3">
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onSave}
            >
              حفظ التعديل
            </Button>
          )}
          {canManage && entry.status === "approved" && (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      recordPayrollPayment(schoolId, entry.id, {
                        date: paymentDate,
                        method: paymentMethod,
                        reference: paymentReference,
                      }),
                    "تم تسجيل دفع الراتب."
                  )
                }
              >
                دفع
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => cancelPayrollEntry(schoolId, entry.id),
                    "تم إلغاء بند الراتب."
                  )
                }
              >
                إلغاء
              </Button>
            </>
          )}
          {canManage && entry.status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  () => cancelPayrollEntry(schoolId, entry.id),
                  "تم إلغاء بند الراتب."
                )
              }
            >
              إلغاء
            </Button>
          )}
          {canManage && entry.status === "paid" && entry.payment && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || reversalReason.trim().length < 3}
              onClick={() =>
                void run(
                  () =>
                    reversePayrollPayment(
                      schoolId,
                      entry.payment!.id,
                      reversalReason
                    ),
                  "تم عكس دفعة الراتب مع حفظ السجل."
                )
              }
              className="gap-1"
            >
              <RotateCcw className="size-3" />
              عكس الدفع
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
