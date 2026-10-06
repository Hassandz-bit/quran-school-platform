import { useCallback, useEffect, useState } from "react";
import { Database, Eraser, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearDemoData,
  createDemoData,
  fetchDemoStatus,
  getDemoErrorMessage,
  type DemoStatus,
} from "@/lib/demo-mode";
import { toast } from "sonner";

type DemoModeCardProps = {
  schoolId: string;
  onChanged?: () => void | Promise<void>;
};

const EMPTY_STATUS: DemoStatus = {
  active: false,
  batchId: null,
  createdAt: null,
  studentCount: 0,
  teacherCount: 0,
  classCount: 0,
};

export default function DemoModeCard({ schoolId, onChanged }: DemoModeCardProps) {
  const [status, setStatus] = useState<DemoStatus>(EMPTY_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<"create" | "clear" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      setStatus(await fetchDemoStatus(schoolId));
    } catch {
      // Migration may not have been applied yet during a short deploy window.
      setStatus(EMPTY_STATUS);
    } finally {
      setIsLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshParent = async () => {
    await load();
    await onChanged?.();
  };

  const handleCreate = async () => {
    if (action) return;
    setAction("create");
    try {
      await createDemoData(schoolId);
      toast.success("تم إنشاء بيئة العرض التجريبية بنجاح.");
      await refreshParent();
    } catch (error) {
      toast.error(getDemoErrorMessage(error));
    } finally {
      setAction(null);
    }
  };

  const handleClear = async () => {
    if (action) return;
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }

    setAction("clear");
    try {
      const count = await clearDemoData(schoolId);
      toast.success(`تم مسح بيانات العرض التجريبية (${count} طالب).`);
      setConfirmClear(false);
      await refreshParent();
    } catch (error) {
      toast.error(getDemoErrorMessage(error));
    } finally {
      setAction(null);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-[#DDE9E0] bg-white p-5" role="status">
        <div className="flex items-center gap-3 text-sm font-semibold text-[#607368]">
          <Loader2 className="size-5 animate-spin text-[#2F855A]" />
          جارٍ التحقق من وضع العرض التجريبي...
        </div>
      </section>
    );
  }

  if (!status.active) {
    return (
      <section className="rounded-3xl border border-[#D8E9DD] bg-[linear-gradient(135deg,#F5FBF6,#FFFDF7)] p-5 shadow-[0_1px_2px_rgba(23,59,45,0.04)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[#17663B]">
              <span className="grid size-10 place-items-center rounded-2xl bg-[#E5F2E8]">
                <Sparkles className="size-5" />
              </span>
              <p className="text-xs font-extrabold tracking-wide">وضع العرض التجريبي</p>
            </div>
            <h2 className="mt-3 text-lg font-extrabold text-[#173B2D]">
              اعرض للزبون منصة ممتلئة وجاهزة خلال ثوانٍ
            </h2>
            <p className="mt-2 text-sm leading-7 text-[#607368]">
              ينشئ النظام 20 طالبًا، معلمين، حلقتين، حضورًا، حفظًا وبيانات مالية مترابطة. كل ما ينشئه العرض يُتتبع منفصلًا عن بيانات المدرسة الحقيقية ويمكن مسحه لاحقًا بأمان.
            </p>
          </div>
          <Button
            type="button"
            className="min-h-11 shrink-0 bg-[#17663B] text-white hover:bg-[#125331]"
            onClick={() => void handleCreate()}
            disabled={action !== null}
          >
            {action === "create" ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            إنشاء بيانات العرض
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#F1D7A4] bg-[#FFF9EC] p-5 shadow-[0_1px_2px_rgba(23,59,45,0.04)] sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#8A5A0B]">
            <span className="grid size-10 place-items-center rounded-2xl bg-[#FBE9BF]">
              <Sparkles className="size-5" />
            </span>
            <p className="text-xs font-extrabold">البيانات التجريبية مفعلة</p>
          </div>
          <h2 className="mt-3 text-lg font-extrabold text-[#5E4315]">
            أنت الآن تستعرض نموذجًا جاهزًا للعمل
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#76531A]">
            <span className="rounded-full bg-white/80 px-3 py-1.5">{status.studentCount} طالب</span>
            <span className="rounded-full bg-white/80 px-3 py-1.5">{status.teacherCount} معلم</span>
            <span className="rounded-full bg-white/80 px-3 py-1.5">{status.classCount} حلقة</span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#80652F]">
            استخدم البيانات التجريبية للاستكشاف فقط. عند إنهاء العرض تُحذف سجلاته المرتبطة، بما فيها الحضور والحفظ وملاحظات المتابعة ونتائج المسار المدرسي والإشعارات والعمليات المالية. لا تربطها بطلاب حقيقيين أو حسابات ودعوات حقيقية؛ وتتوقف العملية إذا وجدت صورًا أو وثائق أو سجلات استيراد أو رواتب يجب حفظها.
          </p>
          {confirmClear && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#EABF68] bg-white/70 p-3 text-sm text-[#704D0E]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                للتأكيد اضغط الزر مرة ثانية. سيحذف النظام كيانات العرض والسجلات التابعة لها، ويوقف العملية إذا اكتشف طالبًا أو ولي أمر أو دعوة حقيقية مرتبطة، أو مرفقات أو رواتب أو سجل استيراد يجب حفظه.
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-[#D7AA54] bg-white text-[#76531A] hover:bg-[#FFF7E5]"
            onClick={() => void handleClear()}
            disabled={action !== null}
          >
            {action === "clear" ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />}
            {confirmClear ? "تأكيد بدء الاستخدام الفعلي" : "ابدأ الاستخدام الفعلي"}
          </Button>
          {confirmClear && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-10 text-[#80652F]"
              onClick={() => setConfirmClear(false)}
              disabled={action !== null}
            >
              إلغاء
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
