import { useEffect, useMemo, useState } from "react";
import { BadgePercent, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  createStudentDiscountPolicy,
  deactivateStudentDiscountPolicy,
  fetchStudentDiscountPolicySetup,
  studentDiscountErrorMessage,
  studentDiscountTypeLabel,
  studentDiscountValueLabel,
  type StudentDiscountPolicySetup,
  type StudentDiscountType,
  type StudentDiscountValueType,
} from "@/lib/student-discounts";

type Props = { schoolId: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function StudentDiscountPolicyLauncher({ schoolId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [setup, setSetup] = useState<StudentDiscountPolicySetup | null>(null);
  const [studentId, setStudentId] = useState("");
  const [discountType, setDiscountType] = useState<StudentDiscountType>("needy");
  const [valueType, setValueType] = useState<StudentDiscountValueType>("percentage");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");

  const studentsById = useMemo(
    () => new Map((setup?.students ?? []).map(student => [student.id, student])),
    [setup?.students]
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStudentDiscountPolicySetup(schoolId);
      setSetup(data);
      setStudentId(current =>
        current && data.students.some(student => student.id === current)
          ? current
          : (data.students[0]?.id ?? "")
      );
    } catch (error) {
      toast.error(studentDiscountErrorMessage(error));
      setSetup(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || setup || loading) return;
    void load();
  }, [loading, open, setup]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericValue = Number(value);
    if (!studentId) {
      toast.error("اختر الطالب أولًا.");
      return;
    }
    if (
      !Number.isFinite(numericValue) ||
      numericValue <= 0 ||
      (valueType === "percentage" && numericValue > 100)
    ) {
      toast.error("قيمة الخصم غير صالحة.");
      return;
    }
    if (reason.trim().length < 2) {
      toast.error("اكتب سببًا واضحًا للخصم.");
      return;
    }
    if (!startDate || (endDate && endDate < startDate)) {
      toast.error("تحقق من مدة الخصم.");
      return;
    }

    setSaving(true);
    try {
      await createStudentDiscountPolicy(schoolId, {
        studentId,
        discountType,
        valueType,
        value: numericValue,
        reason: reason.trim(),
        startDate,
        endDate: endDate || null,
      });
      toast.success("تم حفظ سياسة الخصم وستظهر في معاينة الاشتراك الدوري.");
      setValue("");
      setReason("");
      setSetup(null);
      await load();
    } catch (error) {
      toast.error(studentDiscountErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (policyId: string) => {
    setDeactivatingId(policyId);
    try {
      const changed = await deactivateStudentDiscountPolicy(schoolId, policyId);
      if (!changed) {
        toast.error("السياسة لم تعد نشطة أو غير متاحة.");
      } else {
        toast.success("تم إيقاف سياسة الخصم مع الاحتفاظ بتاريخها.");
        setSetup(null);
        await load();
      }
    } catch (error) {
      toast.error(studentDiscountErrorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <>
      <div className="border-b border-gray-100 bg-[#FFF9EE] px-4 py-3 print:hidden md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#173B2D]">خصومات الحالات الاجتماعية والإخوة</p>
            <p className="mt-0.5 text-xs text-[#7C715E]">
              خصم قابل للتحديد بالنسبة أو بمبلغ ثابت للتلميذ المحتاج أو للأسرة التي لديها أكثر من ابن.
            </p>
          </div>
          <Button type="button" variant="outline" className="gap-2 bg-white" onClick={() => setOpen(true)}>
            <BadgePercent size={16} />
            إدارة الخصومات
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>سياسات تخفيض الاشتراك</DialogTitle>
            <DialogDescription>
              تحدد المدرسة قيمة الخصم. سياسة واحدة نشطة من نوع اجتماعي أو إخوة تُطبّق تلقائيًا على الاشتراك الدوري بعد المعاينة والتأكيد، ولا تُجمع خصومات متعددة بصمت.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500">
              <RefreshCw size={18} className="animate-spin" />
              جارٍ تحميل الطلاب وسياسات الخصم...
            </div>
          ) : !setup ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-gray-500">تعذر تحميل سياسات الخصم.</p>
              <Button type="button" variant="outline" className="mt-3" onClick={() => void load()}>
                إعادة المحاولة
              </Button>
            </Card>
          ) : (
            <div className="space-y-5">
              <Card className="border border-amber-100 p-5">
                <div className="mb-4 flex items-start gap-3">
                  <UserRoundCheck className="mt-0.5 text-amber-700" size={22} />
                  <div>
                    <h3 className="font-bold text-[#173B2D]">إضافة خصم لطالب</h3>
                    <p className="mt-1 text-xs leading-6 text-gray-500">
                      النظام لا يقرر أن الطالب محتاج من تلقاء نفسه. المسؤول المخول يثبت الأهلية ويحدد القيمة والمدة والسبب.
                    </p>
                  </div>
                </div>

                {setup.students.length === 0 ? (
                  <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                    لا يوجد طلاب نشطون في الفروع التي تملك إدارتها المالية.
                  </p>
                ) : (
                  <form className="space-y-4" onSubmit={submit}>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <label className="text-xs font-bold text-gray-700">
                        الطالب
                        <select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={studentId} onChange={event => setStudentId(event.target.value)}>
                          {setup.students.map(student => (
                            <option key={student.id} value={student.id}>
                              {student.first_name} {student.last_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-gray-700">
                        سبب الاستحقاق
                        <select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={discountType} onChange={event => setDiscountType(event.target.value as StudentDiscountType)}>
                          <option value="needy">حالة اجتماعية / طالب محتاج</option>
                          <option value="sibling">أكثر من ابن / خصم إخوة</option>
                        </select>
                      </label>
                      <label className="text-xs font-bold text-gray-700">
                        طريقة الخصم
                        <select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={valueType} onChange={event => setValueType(event.target.value as StudentDiscountValueType)}>
                          <option value="percentage">نسبة مئوية</option>
                          <option value="fixed">مبلغ ثابت</option>
                        </select>
                      </label>
                      <label className="text-xs font-bold text-gray-700">
                        قيمة الخصم
                        <Input className="mt-1" type="number" min="0.01" max={valueType === "percentage" ? "100" : undefined} step="0.01" value={value} onChange={event => setValue(event.target.value)} placeholder={valueType === "percentage" ? "مثال: 20" : "مثال: 500"} />
                      </label>
                      <label className="text-xs font-bold text-gray-700">
                        يبدأ من
                        <Input className="mt-1" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
                      </label>
                      <label className="text-xs font-bold text-gray-700">
                        ينتهي في — اختياري
                        <Input className="mt-1" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
                      </label>
                    </div>
                    <label className="block text-xs font-bold text-gray-700">
                      سبب/ملاحظة موثقة
                      <Textarea className="mt-1" value={reason} onChange={event => setReason(event.target.value)} maxLength={250} placeholder="مثال: تخفيض اجتماعي معتمد للسنة الدراسية الحالية" />
                    </label>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
                      <span className="flex items-center gap-2"><ShieldCheck size={16} />لن يُجمع خصمان تلقائيًا لنفس الفترة.</span>
                      <Button type="submit" disabled={saving || !studentId}>
                        {saving && <RefreshCw size={15} className="animate-spin" />}
                        حفظ سياسة الخصم
                      </Button>
                    </div>
                  </form>
                )}
              </Card>

              <Card className="border border-gray-100 p-5">
                <h3 className="font-bold text-[#173B2D]">سجل سياسات الخصم</h3>
                <p className="mt-1 text-xs text-gray-500">الإيقاف لا يحذف السياسة؛ يبقى سببها وقيمتها وتاريخها محفوظًا.</p>
                <div className="mt-4 space-y-3">
                  {setup.policies.length === 0 ? (
                    <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">لا توجد سياسات خصم مسجلة في نطاقك.</p>
                  ) : setup.policies.map(policy => {
                    const student = studentsById.get(policy.studentId);
                    return (
                      <div key={policy.id} className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[#173B2D]">{student ? `${student.first_name} ${student.last_name}` : "طالب غير نشط/غير ظاهر"}</span>
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{studentDiscountTypeLabel(policy.discountType)}</span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold">{studentDiscountValueLabel(policy.valueType, policy.value)}</span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${policy.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{policy.status === "active" ? "نشط" : "متوقف"}</span>
                          </div>
                          <p className="mt-2 text-xs leading-6 text-gray-600">{policy.reason}</p>
                          <p className="mt-1 text-xs text-gray-400">{policy.startDate} ← {policy.endDate ?? "مستمر"}{policy.autoApplyRecurring ? " · يطبق على الدوري" : " · مراجعة يدوية"}</p>
                        </div>
                        {policy.status === "active" && (
                          <Button type="button" size="sm" variant="outline" disabled={deactivatingId === policy.id} onClick={() => void deactivate(policy.id)}>
                            {deactivatingId === policy.id && <RefreshCw size={14} className="animate-spin" />}
                            إيقاف الخصم
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
