import { useState } from "react";
import { BriefcaseBusiness, Loader2, Pencil, Plus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import {
  STAFF_JOB_CODES,
  STAFF_JOB_LABELS,
  deactivatePayrollStaffPosition,
  getStaffJobLabel,
  savePayrollStaffPosition,
  type PayrollStaffCandidate,
  type StaffJobCode,
  type StaffPosition,
} from "@/lib/staff";

const selectClass = "h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm";

export default function PayrollStaffDialog({
  schoolId,
  branchId,
  scopeLabel,
  candidates,
  positions,
  onChanged,
}: {
  schoolId: string;
  branchId: string | null;
  scopeLabel: string;
  candidates: PayrollStaffCandidate[];
  positions: StaffPosition[];
  onChanged: () => Promise<void>;
}) {
  const { locale, direction } = useLocale();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [membershipId, setMembershipId] = useState("");
  const [jobCode, setJobCode] = useState<StaffJobCode>("manager");
  const [customJobTitle, setCustomJobTitle] = useState("");

  const reset = () => {
    setMembershipId("");
    setJobCode("manager");
    setCustomJobTitle("");
  };

  const edit = (position: StaffPosition) => {
    setMembershipId(position.membershipId);
    setJobCode(position.jobCode);
    setCustomJobTitle(position.customJobTitle ?? "");
  };

  const save = async () => {
    if (!membershipId || (jobCode === "other" && customJobTitle.trim().length < 2)) {
      toast.error(en ? "Choose an employee and enter a valid job title." : "اختر الموظف وأدخل مسمى وظيفيًا صحيحًا.");
      return;
    }
    setSaving(true);
    try {
      await savePayrollStaffPosition({
        schoolId,
        branchId,
        membershipId,
        jobCode,
        customJobTitle,
      });
      toast.success(en ? "The job was saved in payroll." : "تم حفظ الوظيفة ضمن الرواتب.");
      reset();
      await onChanged();
    } catch {
      toast.error(en ? "Could not save the job in this payroll scope." : "تعذر حفظ الوظيفة في نطاق الرواتب المحدد.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (position: StaffPosition) => {
    setSaving(true);
    try {
      await deactivatePayrollStaffPosition(schoolId, position.positionId);
      toast.success(en ? "The staff job was deactivated." : "تم تعطيل وظيفة الموظف مع الاحتفاظ بالسجل.");
      if (membershipId === position.membershipId) reset();
      await onChanged();
    } catch {
      toast.error(en ? "Could not deactivate the staff job." : "تعذر تعطيل وظيفة الموظف.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <BriefcaseBusiness size={16} /> {en ? "Staff jobs" : "وظائف الموظفين"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" dir={direction}>
        <DialogHeader className={en ? "text-left" : "text-right"}>
          <DialogTitle>{en ? "Payroll staff jobs" : "وظائف الموظفين في الرواتب"}</DialogTitle>
          <DialogDescription>
            {en
              ? `Add the employee's job in ${scopeLabel}, then configure salary. Jobs never grant system permissions.`
              : `أضف وظيفة الموظف ضمن ${scopeLabel} ثم اضبط راتبه. الوظيفة لا تمنح صلاحيات النظام تلقائيًا.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-sm font-medium">{en ? "Employee" : "الموظف"}</span>
            <select className={selectClass} value={membershipId} onChange={event => setMembershipId(event.target.value)}>
              <option value="">{en ? "Choose an employee" : "اختر الموظف"}</option>
              {candidates.map(candidate => (
                <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.fullName}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">{en ? "Job title" : "المسمى الوظيفي"}</span>
            <select className={selectClass} value={jobCode} onChange={event => { setJobCode(event.target.value as StaffJobCode); setCustomJobTitle(""); }}>
              {STAFF_JOB_CODES.map(code => <option key={code} value={code}>{STAFF_JOB_LABELS[code][locale]}</option>)}
            </select>
          </label>
          {jobCode === "other" && (
            <label>
              <span className="mb-1 block text-sm font-medium">{en ? "Other job" : "الوظيفة الأخرى"}</span>
              <Input value={customJobTitle} maxLength={100} onChange={event => setCustomJobTitle(event.target.value)} placeholder={en ? "Enter a custom job title" : "اكتب المسمى غير المدرج"} />
            </label>
          )}
          <div className="flex items-end gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving} className="bg-[#0B4738] hover:bg-[#08382D]">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {membershipId && positions.some(position => position.membershipId === membershipId)
                ? (en ? "Update job" : "تحديث الوظيفة") : (en ? "Add job" : "إضافة الوظيفة")}
            </Button>
            {membershipId ? <Button type="button" variant="ghost" onClick={reset}>{en ? "Clear" : "مسح"}</Button> : null}
          </div>
        </div>

        <div className="space-y-2">
          {positions.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{en ? "No staff jobs in this payroll scope yet." : "لا توجد وظائف مسجلة في نطاق الرواتب هذا بعد."}</p>
          ) : positions.map(position => (
            <div key={position.positionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <strong className="block text-sm">{position.fullName}</strong>
                <span className="text-xs text-muted-foreground">{getStaffJobLabel(position, locale)}</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => edit(position)}><Pencil size={14} />{en ? "Edit" : "تعديل"}</Button>
                <Button type="button" size="sm" variant="outline" className="text-red-700" disabled={saving} onClick={() => void deactivate(position)}><UserMinus size={14} />{en ? "Deactivate" : "تعطيل"}</Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{en ? "Close" : "إغلاق"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
