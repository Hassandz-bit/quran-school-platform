import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { assignClassToDuwam, createBranchDuwam, fetchBranchDuwams, updateBranchDuwam, DUWAM_STUDY_DAYS, type Duwam, type DuwamStudyDay } from "@/lib/duwams";
import { addSchoolBranch, type ClassBranch, type ClassRow } from "@/lib/classes";

const DAY_LABELS: Record<DuwamStudyDay, string> = {
  sunday: "الأحد", monday: "الإثنين", tuesday: "الثلاثاء", wednesday: "الأربعاء",
  thursday: "الخميس", friday: "الجمعة", saturday: "السبت",
};
const emptyForm = { name: "", studyDays: ["sunday", "tuesday", "thursday"] as DuwamStudyDay[], startTime: "16:00", endTime: "18:00" };

export default function ManagedDuwams({ schoolId, branches, classes, onBranchesChanged }: { schoolId: string; branches: ClassBranch[]; classes: ClassRow[]; onBranchesChanged?: () => void }) {
  const { locale } = useLocale();
  const [branchId, setBranchId] = useState("");
  const [items, setItems] = useState<Duwam[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canManageBranches, setCanManageBranches] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchBusy, setBranchBusy] = useState(false);
  const ar = locale === "ar";
  const branchClasses = useMemo(() => classes.filter(item => item.branch_id === branchId), [classes, branchId]);

  const load = useCallback(async () => {
    if (!schoolId || !branchId) { setItems([]); setCanManage(false); return; }
    try {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { data, error } = await getSupabaseClient().rpc("has_branch_permission", {
        target_school_id: schoolId, target_branch_id: branchId, target_permission_code: "classes.manage",
      });
      if (error) throw error;
      setCanManage(data === true);
      setItems(await fetchBranchDuwams(schoolId, branchId));
    } catch (error) {
      toast.error(ar ? "تعذر تحميل الدوامات أو التحقق من الصلاحية." : "Could not load duwams or verify permissions.");
      setItems([]);
      setCanManage(false);
    }
  }, [schoolId, branchId, ar]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { getSupabaseClient } = await import("@/lib/supabase");
        const { data, error } = await getSupabaseClient().rpc("has_school_permission", {
          target_school_id: schoolId, target_permission_code: "branches.manage",
        });
        if (error) throw error;
        if (active) setCanManageBranches(data === true);
      } catch { if (active) setCanManageBranches(false); }
    })();
    return () => { active = false; };
  }, [schoolId]);

  const saveBranch = async () => {
    setBranchBusy(true);
    try {
      const created = await addSchoolBranch(schoolId, { name: branchName, code: branchCode });
      setBranchName(""); setBranchCode(""); setBranchId(created.id);
      toast.success(ar ? "تمت إضافة الفرع بنجاح." : "Branch added successfully.");
      onBranchesChanged?.();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message = code === "branch_permission_required" ? (ar ? "ليست لديك صلاحية إضافة الفروع." : "You cannot add branches.")
        : code === "branch_name_invalid" ? (ar ? "اسم الفرع يجب أن يتكون من حرفين إلى 150 حرفًا." : "Branch name must be 2–150 characters.")
        : code === "branch_code_invalid" ? (ar ? "رمز الفرع يقبل الحروف الإنجليزية والأرقام والشرطة فقط." : "Branch code may contain uppercase letters, numbers, _ and - only.")
        : (ar ? "تعذرت إضافة الفرع. قد يكون رمز الفرع مستخدمًا من قبل." : "Could not add branch. The code may already be in use.");
      toast.error(message);
    } finally { setBranchBusy(false); }
  };

  const reset = () => { setForm(emptyForm); setEditing(null); };
  const save = async () => {
    if (!branchId) return;
    setBusy(true);
    try {
      if (editing) await updateBranchDuwam(schoolId, branchId, editing, form);
      else await createBranchDuwam(schoolId, branchId, form);
      toast.success(ar ? "تم حفظ الدوام." : "Duwam saved.");
      reset(); await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(message === "duwam_permission_required" ? (ar ? "ليست لديك صلاحية إدارة هذا الفرع." : "You cannot manage this branch.") : ar ? "تعذر حفظ الدوام. تحقق من الاسم والأيام والتوقيت." : "Could not save duwam. Check name, days and times.");
    } finally { setBusy(false); }
  };
  const toggleDay = (day: DuwamStudyDay) => setForm(current => ({
    ...current, studyDays: current.studyDays.includes(day) ? current.studyDays.filter(value => value !== day) : [...current.studyDays, day],
  }));
  const assign = async (classId: string, duwamId: string) => {
    setBusy(true);
    try {
      await assignClassToDuwam(schoolId, branchId, classId, duwamId || null);
      toast.success(ar ? "تم تحديث ربط الحلقة." : "Class assignment updated.");
      await load();
    } catch { toast.error(ar ? "تعذر ربط الحلقة بهذا الدوام." : "Could not assign class."); }
    finally { setBusy(false); }
  };
  const edit = (item: Duwam) => {
    setEditing(item.id);
    setForm({ name: item.name, studyDays: item.studyDays, startTime: item.startTime, endTime: item.endTime });
  };
  const disable = async (item: Duwam) => {
    setBusy(true);
    try {
      await updateBranchDuwam(schoolId, branchId, item.id, { name: item.name, studyDays: item.studyDays, startTime: item.startTime, endTime: item.endTime, status: "inactive" });
      toast.success(ar ? "تم تعطيل الدوام." : "Duwam disabled.");
      await load();
    } catch { toast.error(ar ? "تعذر تعطيل الدوام." : "Could not disable duwam."); }
    finally { setBusy(false); }
  };

  return <section className="space-y-4">
    <div><h2 className="text-lg font-bold text-[#173B2D]">{ar ? "إدارة الفروع والدوامات والحلقات" : "Manage branches, duwams and classes"}</h2><p className="text-sm text-gray-500">{ar ? "أضف الفروع، ثم أنشئ الدوامات داخل كل فرع واربط بها الحلقات التابعة له." : "Add branches, create duwams within each branch, and assign their classes."}</p></div>
    {canManageBranches && <Card className="space-y-3 border border-[#DCE8E0] p-4">
      <div><h3 className="font-semibold text-[#173B2D]">{ar ? "إضافة فرع" : "Add branch"}</h3><p className="text-xs text-gray-500">{ar ? "أدخل اسمًا ورمزًا فريدًا للفرع داخل المدرسة." : "Enter a name and a unique code for this school branch."}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{ar ? "اسم الفرع" : "Branch name"}<Input value={branchName} onChange={event => setBranchName(event.target.value)} maxLength={150} placeholder={ar ? "مثال: فرع حي النصر" : "e.g. Al Nasr branch"} /></label>
        <label className="text-sm">{ar ? "رمز الفرع" : "Branch code"}<Input value={branchCode} onChange={event => setBranchCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} maxLength={40} dir="ltr" placeholder="BRANCH-02" /></label>
      </div>
      <div><Button type="button" disabled={branchBusy || branchName.trim().length < 2 || !/^[A-Z0-9_-]{1,40}$/.test(branchCode)} onClick={() => void saveBranch()}>{branchBusy ? (ar ? "جارٍ الإضافة..." : "Adding...") : (ar ? "إضافة الفرع" : "Add branch")}</Button></div>
    </Card>}
    <Card className="space-y-3 border border-gray-100 p-4">
      <label className="block text-sm font-medium">{ar ? "الفرع" : "Branch"}
        <select className="mt-1 h-10 w-full rounded-md border border-gray-200 bg-white px-3" value={branchId} onChange={event => setBranchId(event.target.value)}>
          <option value="">{ar ? "اختر الفرع" : "Choose branch"}</option>
          {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      {branchId && !canManage && <p className="text-sm text-amber-700">{ar ? "العرض أو الإدارة غير متاحين دون صلاحية classes.manage." : "Management requires classes.manage permission."}</p>}
      {branchId && canManage && <>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">{ar ? "اسم الدوام" : "Duwam name"}<Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} maxLength={120} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">{ar ? "من" : "Start"}<Input type="time" value={form.startTime} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))} /></label>
            <label className="text-sm">{ar ? "إلى" : "End"}<Input type="time" value={form.endTime} onChange={event => setForm(current => ({ ...current, endTime: event.target.value }))} /></label>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">{DUWAM_STUDY_DAYS.map(day => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.studyDays.includes(day)} onChange={() => toggleDay(day)} />{ar ? DAY_LABELS[day] : day}</label>)}</div>
        <div className="flex gap-2"><Button disabled={busy || !form.name.trim() || !form.studyDays.length || form.startTime >= form.endTime} onClick={() => void save()}>{editing ? (ar ? "حفظ التعديل" : "Save changes") : (ar ? "إنشاء دوام" : "Create duwam")}</Button>{editing && <Button variant="outline" onClick={reset}>{ar ? "إلغاء" : "Cancel"}</Button>}</div>
      </>}
    </Card>
    {branchId && items.map(item => <Card key={item.id} className="space-y-3 border border-[#DCE8E0] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-[#173B2D]">{item.name} {item.status === "inactive" && <span className="text-xs text-amber-700">({ar ? "معطل" : "Inactive"})</span>}</h3><p className="text-sm text-gray-500">{item.studyDays.map(day => ar ? DAY_LABELS[day] : day).join("، ")} · {item.startTime}–{item.endTime}</p><p className="text-xs text-gray-500">{item.classes.length} {ar ? "حلقة مرتبطة" : "assigned classes"}</p></div>{canManage && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => edit(item)}>{ar ? "تعديل" : "Edit"}</Button>{item.status === "active" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void disable(item)}>{ar ? "تعطيل" : "Disable"}</Button>}</div>}</div>
      {canManage && <div className="grid gap-2 sm:grid-cols-2">{branchClasses.map(classItem => <label key={classItem.id} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 p-2 text-sm"><span>{classItem.name}</span><select disabled={busy || item.status !== "active"} className="max-w-40 rounded border border-gray-200 bg-white p-1" value={items.find(group => group.classes.some(c => c.id === classItem.id))?.id ?? ""} onChange={event => void assign(classItem.id, event.target.value)}><option value="">{ar ? "دون دوام" : "No duwam"}</option>{items.filter(group => group.status === "active").map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>)}</div>}
    </Card>)}
    {branchId && items.length === 0 && <p className="text-sm text-gray-500">{ar ? "لا توجد دوامات في هذا الفرع بعد." : "No duwams in this branch yet."}</p>}
  </section>;
}
