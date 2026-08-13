import { useEffect, useMemo, useState } from "react";
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
import type { MemberBranchOption, SchoolMember } from "@/lib/members";
import {
  STAFF_JOB_CODES,
  STAFF_JOB_LABELS,
  deactivateStaffPosition,
  fetchSchoolStaff,
  getStaffJobLabel,
  saveStaffPosition,
  type StaffJobCode,
  type StaffPosition,
} from "@/lib/staff";

const selectClass = "h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm";

export default function StaffManagementDialog({
  schoolId,
  members,
  branches,
  canManage,
}: {
  schoolId: string;
  members: SchoolMember[];
  branches: MemberBranchOption[];
  canManage: boolean;
}) {
  const { locale, direction } = useLocale();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [positions, setPositions] = useState<StaffPosition[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [jobCode, setJobCode] = useState<StaffJobCode>("manager");
  const [customJobTitle, setCustomJobTitle] = useState("");
  const [branchId, setBranchId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setPositions(await fetchSchoolStaff(schoolId));
    } catch {
      toast.error(en ? "Could not load the staff directory." : "تعذر تحميل دليل الموظفين.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // load is intentionally triggered only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schoolId]);

  const membersById = useMemo(() => new Map(members.map(member => [member.membershipId, member])), [members]);

  const edit = (position: StaffPosition) => {
    setMembershipId(position.membershipId);
    setJobCode(position.jobCode);
    setCustomJobTitle(position.customJobTitle ?? "");
    setBranchId(position.branchId ?? "");
  };

  const reset = () => {
    setMembershipId("");
    setJobCode("manager");
    setCustomJobTitle("");
    setBranchId("");
  };

  const save = async () => {
    if (!membershipId || (jobCode === "other" && customJobTitle.trim().length < 2)) {
      toast.error(en ? "Choose a member and enter a valid job title." : "اختر العضو وأدخل مسمى وظيفيًا صحيحًا.");
      return;
    }
    setSaving(true);
    try {
      await saveStaffPosition({ schoolId, membershipId, jobCode, customJobTitle, branchId });
      toast.success(en ? "Job title saved without changing permissions." : "تم حفظ المسمى الوظيفي دون تغيير الصلاحيات.");
      reset();
      await load();
    } catch {
      toast.error(en ? "Could not save the job title." : "تعذر حفظ المسمى الوظيفي.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (position: StaffPosition) => {
    setSaving(true);
    try {
      await deactivateStaffPosition(schoolId, position.positionId);
      toast.success(en ? "The staff entry was deactivated." : "تم تعطيل سجل الموظف مع الاحتفاظ به.");
      if (membershipId === position.membershipId) reset();
      await load();
    } catch {
      toast.error(en ? "Could not deactivate the staff entry." : "تعذر تعطيل سجل الموظف.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          <BriefcaseBusiness size={16} /> {en ? "Staff" : "الموظفون"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" dir={direction}>
        <DialogHeader className={en ? "text-left" : "text-right"}>
          <DialogTitle>{en ? "Staff job directory" : "دليل وظائف الموظفين"}</DialogTitle>
          <DialogDescription>
            {en ? "A job title describes the employee and never grants system permissions."
              : "المسمى الوظيفي يصف عمل الموظف ولا يمنحه صلاحيات داخل النظام تلقائيًا."}
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm font-medium">{en ? "School member" : "عضو المدرسة"}</span>
              <select className={selectClass} value={membershipId} onChange={event => setMembershipId(event.target.value)}>
                <option value="">{en ? "Choose a member" : "اختر العضو"}</option>
                {members.filter(member => member.membershipStatus === "active").map(member => (
                  <option key={member.membershipId} value={member.membershipId}>{member.fullName}</option>
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
            <label>
              <span className="mb-1 block text-sm font-medium">{en ? "Branch (optional)" : "الفرع (اختياري)"}</span>
              <select className={selectClass} value={branchId} onChange={event => setBranchId(event.target.value)}>
                <option value="">{en ? "School-wide" : "المدرسة كاملة"}</option>
                {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <Button type="button" onClick={() => void save()} disabled={saving} className="bg-[#0B4738] hover:bg-[#08382D]">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {membershipId && positions.some(position => position.membershipId === membershipId)
                  ? (en ? "Update job" : "تحديث الوظيفة") : (en ? "Add staff member" : "إضافة موظف")}
              </Button>
              {membershipId && <Button type="button" variant="ghost" onClick={reset}>{en ? "Clear" : "مسح"}</Button>}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{en ? "Loading staff..." : "جارٍ تحميل الموظفين..."}</div>
          ) : positions.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{en ? "No staff jobs have been assigned yet." : "لم تُسند وظائف للموظفين بعد."}</p>
          ) : positions.map(position => (
            <div key={position.positionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <strong className="block text-sm">{membersById.get(position.membershipId)?.fullName ?? position.fullName}</strong>
                <span className="text-xs text-muted-foreground">{getStaffJobLabel(position, locale)}{position.branchName ? ` • ${position.branchName}` : ""}</span>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => edit(position)}><Pencil size={14} />{en ? "Edit" : "تعديل"}</Button>
                  <Button type="button" size="sm" variant="outline" className="text-red-700" disabled={saving} onClick={() => void deactivate(position)}><UserMinus size={14} />{en ? "Deactivate" : "تعطيل"}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{en ? "Close" : "إغلاق"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
