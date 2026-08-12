import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarPlus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDzd } from "@/lib/finance";
import {
  fetchRecurringBillingSetup,
  generateRecurringCharges,
  previewFinanceReminders,
  previewRecurringGeneration,
  queueFinanceReminders,
  recurringBillingErrorMessage,
  type FinanceReminderPreview,
  type FinanceReminderResult,
  type RecurringBillingPlan,
  type RecurringBillingSetup,
  type RecurringGenerationPreview,
  type RecurringGenerationResult,
} from "@/lib/recurring-billing";

type Props = { schoolId: string };
type ActionState = "idle" | "preview" | "confirm";

const today = () => new Date().toISOString().slice(0, 10);
const scopeValue = (branchId: string | null) => branchId ?? "school";
const branchValue = (value: string) => (value === "school" ? null : value);

const cycleLabels: Record<RecurringBillingPlan["billingCycle"], string> = {
  monthly: "شهري",
  quarterly: "ربع سنوي",
  yearly: "سنوي",
};

export default function RecurringBillingLauncher({ schoolId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<RecurringBillingSetup | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [generationScope, setGenerationScope] = useState("");
  const [anchorDate, setAnchorDate] = useState(today());
  const [generationPreview, setGenerationPreview] = useState<RecurringGenerationPreview | null>(null);
  const [generationResult, setGenerationResult] = useState<RecurringGenerationResult | null>(null);
  const [generationState, setGenerationState] = useState<ActionState>("idle");
  const [reminderScope, setReminderScope] = useState("");
  const [reminderAsOf, setReminderAsOf] = useState(today());
  const [dueSoonDays, setDueSoonDays] = useState("3");
  const [reminderPreview, setReminderPreview] = useState<FinanceReminderPreview | null>(null);
  const [reminderResult, setReminderResult] = useState<FinanceReminderResult | null>(null);
  const [reminderState, setReminderState] = useState<ActionState>("idle");

  const selectedPlan = useMemo(
    () => setup?.plans.find(plan => plan.id === selectedPlanId) ?? null,
    [selectedPlanId, setup?.plans]
  );

  useEffect(() => {
    if (!open || setup || loading) return;
    setLoading(true);
    void fetchRecurringBillingSetup(schoolId)
      .then(data => {
        setSetup(data);
        const firstPlan = data.plans[0] ?? null;
        if (firstPlan) {
          setSelectedPlanId(firstPlan.id);
          setGenerationScope(
            scopeValue(
              firstPlan.branchId ??
                (data.schoolManage ? null : (data.branches[0]?.id ?? null))
            )
          );
        }
        setReminderScope(data.schoolManage ? "school" : (data.branches[0]?.id ?? ""));
      })
      .catch(error => toast.error(recurringBillingErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [loading, open, schoolId, setup]);

  const resetGenerationPreview = () => {
    setGenerationPreview(null);
    setGenerationResult(null);
  };
  const resetReminderPreview = () => {
    setReminderPreview(null);
    setReminderResult(null);
  };

  const selectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    resetGenerationPreview();
    const plan = setup?.plans.find(item => item.id === planId);
    if (!plan || !setup) return;
    if (plan.branchId) setGenerationScope(plan.branchId);
    else if (setup.schoolManage) setGenerationScope("school");
    else setGenerationScope(setup.branches[0]?.id ?? "");
  };

  const previewGeneration = async () => {
    if (!selectedPlan || !generationScope) return;
    setGenerationState("preview");
    resetGenerationPreview();
    try {
      setGenerationPreview(
        await previewRecurringGeneration(
          schoolId,
          selectedPlan.id,
          branchValue(generationScope),
          anchorDate
        )
      );
    } catch (error) {
      toast.error(recurringBillingErrorMessage(error));
    } finally {
      setGenerationState("idle");
    }
  };

  const confirmGeneration = async () => {
    if (!generationPreview || !selectedPlan || !generationScope) return;
    setGenerationState("confirm");
    try {
      const result = await generateRecurringCharges(
        schoolId,
        selectedPlan.id,
        branchValue(generationScope),
        anchorDate
      );
      setGenerationResult(result);
      setGenerationPreview(null);
      toast.success(`تم إنشاء ${result.createdCount} استحقاقًا دوريًا.`);
    } catch (error) {
      toast.error(recurringBillingErrorMessage(error));
    } finally {
      setGenerationState("idle");
    }
  };

  const previewReminders = async () => {
    if (!reminderScope) return;
    const days = Number(dueSoonDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      toast.error("عدد أيام التذكير يجب أن يكون بين 1 و30.");
      return;
    }
    setReminderState("preview");
    resetReminderPreview();
    try {
      setReminderPreview(
        await previewFinanceReminders(
          schoolId,
          branchValue(reminderScope),
          reminderAsOf,
          days
        )
      );
    } catch (error) {
      toast.error(recurringBillingErrorMessage(error));
    } finally {
      setReminderState("idle");
    }
  };

  const confirmReminders = async () => {
    if (!reminderPreview || !reminderScope) return;
    setReminderState("confirm");
    try {
      const result = await queueFinanceReminders(
        schoolId,
        branchValue(reminderScope),
        reminderAsOf,
        Number(dueSoonDays)
      );
      setReminderResult(result);
      setReminderPreview(null);
      toast.success(`تم إنشاء ${result.createdCount} تذكيرًا جديدًا.`);
    } catch (error) {
      toast.error(recurringBillingErrorMessage(error));
    } finally {
      setReminderState("idle");
    }
  };

  const scopeOptions = (allowSchool: boolean) => (
    <>
      {allowSchool && <option value="school">كل فروع المدرسة</option>}
      {setup?.branches.map(branch => (
        <option key={branch.id} value={branch.id}>
          {branch.name}{branch.isMain ? " — الرئيسي" : ""}
        </option>
      ))}
    </>
  );

  return (
    <>
      <div className="border-b border-gray-100 bg-[#F7FAF7] px-4 py-3 print:hidden md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#173B2D]">الاستحقاقات الدورية والتذكيرات</p>
            <p className="mt-0.5 text-xs text-[#718377]">معاينة أولًا، ثم تأكيد صريح قبل إنشاء أي رسوم أو تنبيه.</p>
          </div>
          <Button type="button" variant="outline" className="gap-2 bg-white" onClick={() => setOpen(true)}>
            <CalendarPlus size={16} />
            إدارة الدوري والتذكيرات
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>الاستحقاقات الدورية وتذكيرات الأولياء</DialogTitle>
            <DialogDescription>
              لا تُنشأ رسوم ولا إشعارات بمجرد فتح هذه النافذة. كل عملية تمر بمعاينة ثم تأكيد مستقل، والخصومات الاجتماعية/الإخوة المفعلة تظهر قبل الإنشاء.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <RefreshCw size={18} className="animate-spin" />
              جارٍ تحميل نطاقات المالية والخطط الدورية...
            </div>
          ) : !setup ? (
            <Card className="p-6 text-center text-sm text-gray-500">تعذر تحميل إعدادات المالية.</Card>
          ) : (
            <div className="space-y-6">
              <Card className="border border-emerald-100 p-5">
                <div className="flex items-start gap-3">
                  <CalendarPlus className="mt-0.5 text-emerald-700" size={22} />
                  <div>
                    <h3 className="font-bold text-[#173B2D]">1. توليد الاستحقاقات الدورية</h3>
                    <p className="mt-1 text-xs leading-6 text-gray-500">الخطط الشهرية والربع سنوية والسنوية فقط. الطالب النشط يُضاف مرة واحدة لكل خطة وفترة.</p>
                  </div>
                </div>

                {setup.plans.length === 0 ? (
                  <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">لا توجد خطة رسوم دورية نشطة في نطاقاتك. أنشئ أو فعّل خطة شهرية/ربع سنوية/سنوية أولًا.</p>
                ) : (
                  <>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <label className="text-xs font-bold text-gray-700">
                        خطة الرسوم
                        <select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={selectedPlanId} onChange={event => selectPlan(event.target.value)}>
                          {setup.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} — {cycleLabels[plan.billingCycle]}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-gray-700">
                        نطاق التوليد
                        <select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm disabled:bg-gray-100" value={generationScope} disabled={selectedPlan?.branchId !== null} onChange={event => { setGenerationScope(event.target.value); resetGenerationPreview(); }}>
                          {selectedPlan?.branchId ? (
                            <option value={selectedPlan.branchId}>{setup.branches.find(branch => branch.id === selectedPlan.branchId)?.name ?? "فرع الخطة"}</option>
                          ) : scopeOptions(setup.schoolManage)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-gray-700">
                        تاريخ داخل الفترة المطلوبة
                        <Input type="date" className="mt-1" value={anchorDate} onChange={event => { setAnchorDate(event.target.value); resetGenerationPreview(); }} />
                      </label>
                    </div>

                    {selectedPlan && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="rounded-full bg-gray-100 px-3 py-1">{formatDzd(selectedPlan.amount)}</span>
                        <span className="rounded-full bg-gray-100 px-3 py-1">{cycleLabels[selectedPlan.billingCycle]}</span>
                        <span className={`rounded-full px-3 py-1 ${selectedPlan.dueDay ? "bg-gray-100" : "bg-amber-100 text-amber-800"}`}>
                          {selectedPlan.dueDay ? `يوم الاستحقاق: ${selectedPlan.dueDay}` : "يجب تحديد يوم الاستحقاق في الخطة"}
                        </span>
                      </div>
                    )}

                    <div className="mt-4 flex justify-end">
                      <Button type="button" variant="outline" disabled={generationState !== "idle" || !selectedPlan || !generationScope || !anchorDate || selectedPlan.dueDay === null} onClick={() => void previewGeneration()}>
                        {generationState === "preview" && <RefreshCw size={15} className="animate-spin" />}
                        معاينة التوليد
                      </Button>
                    </div>

                    {generationPreview && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <Metric label="طلاب مؤهلون" value={generationPreview.eligibleCount} />
                          <Metric label="موجود مسبقًا" value={generationPreview.alreadyChargedCount} />
                          <Metric label="سيُنشأ" value={generationPreview.toCreateCount} strong />
                          <Metric label="قبل الخصم" value={formatDzd(generationPreview.grossTotalAmount)} />
                          <Metric label="توفير الخصومات" value={formatDzd(generationPreview.autoDiscountSavings)} />
                          <Metric label="الصافي" value={formatDzd(generationPreview.totalAmount)} strong />
                        </div>
                        <p className="mt-3 text-xs leading-6 text-gray-600">الفترة: {generationPreview.periodStart} ← {generationPreview.periodEnd} · الاستحقاق: {generationPreview.dueDate}</p>

                        {generationPreview.autoDiscountStudentCount > 0 && (
                          <p className="mt-3 rounded-lg bg-emerald-100 p-3 text-xs leading-6 text-emerald-900">
                            سيُطبّق تلقائيًا بعد التأكيد خصم اجتماعي/إخوة على {generationPreview.autoDiscountStudentCount} طالبًا، بإجمالي توفير {formatDzd(generationPreview.autoDiscountSavings)}.
                          </p>
                        )}
                        {generationPreview.studentsWithActiveDiscounts > 0 && (
                          <p className="mt-3 rounded-lg bg-amber-100 p-3 text-xs leading-6 text-amber-900">
                            يوجد {generationPreview.studentsWithActiveDiscounts} طالبًا لديهم سياسة خصم قديمة/يدوية غير مفعلة للدوري؛ لن يغيّرها النظام تلقائيًا.
                          </p>
                        )}
                        {generationPreview.autoDiscountConflictCount > 0 && (
                          <p className="mt-3 rounded-lg bg-rose-100 p-3 text-xs leading-6 text-rose-900">
                            يوجد {generationPreview.autoDiscountConflictCount} طالبًا لديهم تعارض في الخصم الدوري. أوقف إحدى السياسات أو صحح قيمة الخصم قبل التوليد.
                          </p>
                        )}

                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-emerald-200 pt-4">
                          <span className="flex items-center gap-2 text-xs text-emerald-800"><ShieldCheck size={16} />إعادة التأكيد لن تنشئ نسخة مكررة لنفس الطالب والخطة والفترة.</span>
                          <Button type="button" disabled={generationState !== "idle" || generationPreview.toCreateCount === 0 || generationPreview.autoDiscountConflictCount > 0} onClick={() => void confirmGeneration()}>
                            {generationState === "confirm" && <RefreshCw size={15} className="animate-spin" />}
                            تأكيد إنشاء {generationPreview.toCreateCount} استحقاقًا
                          </Button>
                        </div>
                      </div>
                    )}

                    {generationResult && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                        <p className="font-bold text-emerald-900">تم إنشاء {generationResult.createdCount} استحقاقًا بصافي {formatDzd(generationResult.createdTotal)}.</p>
                        <p className="mt-1 text-xs text-emerald-800">استفاد {generationResult.autoDiscountedCount} طالبًا من خصم دوري بقيمة {formatDzd(generationResult.discountSavings)}، وتم تخطي {generationResult.skippedCount} سجلًا موجودًا/غير قابل للتكرار.</p>
                        <Button type="button" size="sm" variant="outline" className="mt-3 bg-white" onClick={() => window.location.reload()}>تحديث قائمة الاستحقاقات</Button>
                      </div>
                    )}
                  </>
                )}
              </Card>

              <Card className="border border-sky-100 p-5">
                <div className="flex items-start gap-3">
                  <BellRing className="mt-0.5 text-sky-700" size={22} />
                  <div>
                    <h3 className="font-bold text-[#173B2D]">2. تذكيرات الاستحقاق والمتأخرات</h3>
                    <p className="mt-1 text-xs leading-6 text-gray-500">تُرسل داخل مركز إشعارات ولي الأمر الحالي فقط. المدفوع والمعفى والملغى لا يدخل في التذكيرات.</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <label className="text-xs font-bold text-gray-700">
                    النطاق
                    <select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={reminderScope} onChange={event => { setReminderScope(event.target.value); resetReminderPreview(); }}>{scopeOptions(setup.schoolManage)}</select>
                  </label>
                  <label className="text-xs font-bold text-gray-700">الاحتساب حتى تاريخ<Input type="date" className="mt-1" value={reminderAsOf} onChange={event => { setReminderAsOf(event.target.value); resetReminderPreview(); }} /></label>
                  <label className="text-xs font-bold text-gray-700">قريب الاستحقاق خلال (أيام)<Input type="number" min={1} max={30} className="mt-1" value={dueSoonDays} onChange={event => { setDueSoonDays(event.target.value); resetReminderPreview(); }} /></label>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button type="button" variant="outline" disabled={reminderState !== "idle" || !reminderScope || !reminderAsOf} onClick={() => void previewReminders()}>
                    {reminderState === "preview" && <RefreshCw size={15} className="animate-spin" />}
                    معاينة التذكيرات
                  </Button>
                </div>

                {reminderPreview && (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric label="استحقاقات قريبة" value={reminderPreview.dueSoonChargeCount} />
                      <Metric label="استحقاقات متأخرة" value={reminderPreview.overdueChargeCount} />
                      <Metric label="تذكيرات قريبة جديدة" value={reminderPreview.dueSoonNewNotifications} />
                      <Metric label="تذكيرات تأخير جديدة" value={reminderPreview.overdueNewNotifications} strong />
                    </div>
                    <p className="mt-3 text-xs leading-6 text-gray-600">إجمالي الإشعارات الجديدة: {reminderPreview.totalNewNotifications}. التذكيرات التي أُرسلت سابقًا لن تتكرر لنفس ولي الأمر والاستحقاق والمرحلة.</p>
                    <div className="mt-4 flex justify-end border-t border-sky-200 pt-4">
                      <Button type="button" disabled={reminderState !== "idle" || reminderPreview.totalNewNotifications === 0} onClick={() => void confirmReminders()}>
                        {reminderState === "confirm" && <RefreshCw size={15} className="animate-spin" />}
                        تأكيد إرسال {reminderPreview.totalNewNotifications} تذكيرًا
                      </Button>
                    </div>
                  </div>
                )}

                {reminderResult && (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                    <p className="font-bold">تم إنشاء {reminderResult.createdCount} إشعارًا جديدًا.</p>
                    <p className="mt-1 text-xs">تم تجاهل {reminderResult.dedupedCount} تذكيرًا مكررًا من أصل {reminderResult.candidateCount} مرشحًا.</p>
                  </div>
                )}
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg ${strong ? "font-extrabold text-[#17663B]" : "font-bold text-[#173B2D]"}`}>{value}</p>
    </div>
  );
}
