import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ClipboardList, Phone, Plus, RefreshCw, Search, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRegistrationLead,
  fetchRegistrationCrmAccess,
  listRegistrationCrmBranches,
  listRegistrationLeads,
  updateRegistrationLeadPipeline,
  type RegistrationCrmAccess,
  type RegistrationCrmBranch,
  type RegistrationLead,
  type RegistrationLeadSource,
  type RegistrationLeadStatus,
} from "@/lib/registration-crm";

const STATUS_VALUES: RegistrationLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "visit_scheduled",
  "awaiting_documents",
  "accepted",
  "lost",
];

const SOURCE_VALUES: RegistrationLeadSource[] = [
  "walk_in",
  "phone",
  "website",
  "social",
  "referral",
  "campaign",
  "other",
];

const EMPTY_ACCESS: RegistrationCrmAccess = { canView: false, canManage: false };

function toIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function Registrations() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const ar = locale === "ar";
  const [access, setAccess] = useState<RegistrationCrmAccess>(EMPTY_ACCESS);
  const [branches, setBranches] = useState<RegistrationCrmBranch[]>([]);
  const [leads, setLeads] = useState<RegistrationLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RegistrationLeadStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<RegistrationLead | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [branchId, setBranchId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "none">("none");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [source, setSource] = useState<RegistrationLeadSource>("walk_in");
  const [followUpAt, setFollowUpAt] = useState("");
  const [notes, setNotes] = useState("");

  const [editStatus, setEditStatus] = useState<RegistrationLeadStatus>("new");
  const [editFollowUpAt, setEditFollowUpAt] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const statusLabel = useCallback((value: RegistrationLeadStatus) => {
    const labels: Record<RegistrationLeadStatus, [string, string]> = {
      new: ["جديد", "New"],
      contacted: ["تم التواصل", "Contacted"],
      qualified: ["مؤهل", "Qualified"],
      visit_scheduled: ["زيارة مجدولة", "Visit scheduled"],
      awaiting_documents: ["بانتظار الوثائق", "Awaiting documents"],
      accepted: ["مقبول", "Accepted"],
      lost: ["غير متابع", "Lost"],
    };
    return labels[value][ar ? 0 : 1];
  }, [ar]);

  const sourceLabel = useCallback((value: RegistrationLeadSource) => {
    const labels: Record<RegistrationLeadSource, [string, string]> = {
      walk_in: ["زيارة مباشرة", "Walk-in"],
      phone: ["هاتف", "Phone"],
      website: ["الموقع", "Website"],
      social: ["شبكات اجتماعية", "Social"],
      referral: ["إحالة", "Referral"],
      campaign: ["حملة", "Campaign"],
      other: ["أخرى", "Other"],
    };
    return labels[value][ar ? 0 : 1];
  }, [ar]);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const nextAccess = await fetchRegistrationCrmAccess(school.id);
      setAccess(nextAccess);
      if (!nextAccess.canView) {
        setBranches([]);
        setLeads([]);
        return;
      }
      const [nextBranches, nextLeads] = await Promise.all([
        listRegistrationCrmBranches(school.id),
        listRegistrationLeads(school.id),
      ]);
      setBranches(nextBranches);
      setLeads(nextLeads);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = ar
    ? {
        title: "طلبات التسجيل",
        subtitle: "متابعة المهتمين بالتسجيل قبل إنشاء ملف الطالب النهائي.",
        refresh: "تحديث",
        add: "طلب جديد",
        total: "إجمالي الطلبات",
        new: "طلبات جديدة",
        due: "متابعات مستحقة",
        accepted: "مقبولة",
        search: "بحث باسم الطالب أو الولي أو الهاتف...",
        allStatuses: "كل الحالات",
        empty: "لا توجد طلبات تسجيل مطابقة.",
        branch: "الفرع",
        prospect: "الطالب المحتمل",
        guardian: "ولي الأمر",
        source: "المصدر",
        status: "الحالة",
        followUp: "المتابعة القادمة",
        noFollowUp: "غير محددة",
        edit: "تحديث المتابعة",
        createTitle: "إضافة طلب تسجيل",
        createDescription: "سجّل بيانات التواصل الأولية فقط. إنشاء الطالب يتم لاحقًا في مسار مستقل.",
        firstName: "الاسم",
        lastName: "اللقب",
        birthDate: "تاريخ الميلاد (اختياري)",
        gender: "الجنس (اختياري)",
        none: "غير محدد",
        male: "ذكر",
        female: "أنثى",
        guardianName: "اسم ولي الأمر",
        guardianPhone: "هاتف ولي الأمر",
        guardianEmail: "بريد ولي الأمر (اختياري)",
        notes: "ملاحظات",
        save: "حفظ الطلب",
        saving: "جارٍ الحفظ...",
        cancel: "إلغاء",
        editTitle: "تحديث مسار الطلب",
        update: "حفظ المتابعة",
        required: "أكمل الحقول المطلوبة.",
        saved: "تم تسجيل طلب المتابعة.",
        updated: "تم تحديث مسار الطلب.",
        saveError: "تعذر حفظ طلب التسجيل حاليًا.",
        loadError: "تعذر تحميل CRM التسجيل. أعد المحاولة.",
      }
    : {
        title: "Registration CRM",
        subtitle: "Track prospective registrations before a final student record is created.",
        refresh: "Refresh",
        add: "New lead",
        total: "Total leads",
        new: "New leads",
        due: "Follow-ups due",
        accepted: "Accepted",
        search: "Search student, guardian, or phone...",
        allStatuses: "All statuses",
        empty: "No matching registration leads.",
        branch: "Branch",
        prospect: "Prospective student",
        guardian: "Guardian",
        source: "Source",
        status: "Status",
        followUp: "Next follow-up",
        noFollowUp: "Not set",
        edit: "Update follow-up",
        createTitle: "Add registration lead",
        createDescription: "Capture initial contact only. Student creation remains a separate workflow.",
        firstName: "First name",
        lastName: "Last name",
        birthDate: "Birth date (optional)",
        gender: "Gender (optional)",
        none: "Not set",
        male: "Male",
        female: "Female",
        guardianName: "Guardian name",
        guardianPhone: "Guardian phone",
        guardianEmail: "Guardian email (optional)",
        notes: "Notes",
        save: "Save lead",
        saving: "Saving...",
        cancel: "Cancel",
        editTitle: "Update lead pipeline",
        update: "Save follow-up",
        required: "Complete the required fields.",
        saved: "Registration lead saved.",
        updated: "Lead pipeline updated.",
        saveError: "The registration lead could not be saved.",
        loadError: "Registration CRM could not be loaded. Try again.",
      };

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return leads.filter(lead => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        lead.prospectFirstName,
        lead.prospectLastName,
        lead.guardianName,
        lead.guardianPhone,
        lead.guardianEmail ?? "",
        lead.branchName,
      ].some(value => value.toLocaleLowerCase(locale).includes(needle));
    });
  }, [leads, locale, query, statusFilter]);

  const now = Date.now();
  const dueCount = leads.filter(lead => {
    if (!lead.nextFollowUpAt || lead.status === "accepted" || lead.status === "lost") return false;
    const due = new Date(lead.nextFollowUpAt).getTime();
    return Number.isFinite(due) && due <= now;
  }).length;
  const newCount = leads.filter(lead => lead.status === "new").length;
  const acceptedCount = leads.filter(lead => lead.status === "accepted").length;
  const manageableBranches = branches.filter(branch => branch.canManage);

  const resetCreate = () => {
    setBranchId(manageableBranches.length === 1 ? manageableBranches[0].branchId : "");
    setFirstName("");
    setLastName("");
    setBirthDate("");
    setGender("none");
    setGuardianName("");
    setGuardianPhone("");
    setGuardianEmail("");
    setSource("walk_in");
    setFollowUpAt("");
    setNotes("");
  };

  const openCreate = () => {
    resetCreate();
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!school?.id || !branchId || !firstName.trim() || !lastName.trim() || !guardianName.trim() || !guardianPhone.trim()) {
      toast.error(copy.required);
      return;
    }
    setSubmitting(true);
    try {
      await createRegistrationLead({
        schoolId: school.id,
        branchId,
        prospectFirstName: firstName,
        prospectLastName: lastName,
        birthDate: birthDate || null,
        gender: gender === "none" ? null : gender,
        guardianName,
        guardianPhone,
        guardianEmail: guardianEmail || null,
        source,
        nextFollowUpAt: toIso(followUpAt),
        notes: notes || null,
      });
      toast.success(copy.saved);
      setCreateOpen(false);
      resetCreate();
      await load();
    } catch {
      toast.error(copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (lead: RegistrationLead) => {
    setEditLead(lead);
    setEditStatus(lead.status);
    setEditFollowUpAt(toLocalDateTime(lead.nextFollowUpAt));
    setEditNotes(lead.notes ?? "");
  };

  const submitEdit = async () => {
    if (!editLead) return;
    setSubmitting(true);
    try {
      await updateRegistrationLeadPipeline({
        leadId: editLead.leadId,
        status: editStatus,
        nextFollowUpAt: toIso(editFollowUpAt),
        notes: editNotes || null,
      });
      toast.success(copy.updated);
      setEditLead(null);
      await load();
    } catch {
      toast.error(copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return copy.noFollowUp;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return copy.noFollowUp;
    return new Intl.DateTimeFormat(ar ? "ar-DZ" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  if (!school?.id) return <div className="p-6 text-sm text-muted-foreground">{copy.loadError}</div>;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3" dir={direction}>
        <RefreshCw className="size-5 animate-spin text-[#17663B]" />
        <span>{ar ? "جارٍ تحميل طلبات التسجيل..." : "Loading registration leads..."}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6" dir={direction}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#173B2D]">
            <ClipboardList className="size-6 text-[#17663B]" /> {copy.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" /> {copy.refresh}
          </Button>
          {access.canManage && manageableBranches.length > 0 && (
            <Button className="bg-[#0B4738] hover:bg-[#0B4738]/90" onClick={openCreate}>
              <Plus className="size-4" /> {copy.add}
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-800">{copy.loadError}</CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.total}</div><div className="mt-1 text-2xl font-bold">{leads.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.new}</div><div className="mt-1 text-2xl font-bold text-sky-700">{newCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.due}</div><div className="mt-1 text-2xl font-bold text-amber-700">{dueCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.accepted}</div><div className="mt-1 text-2xl font-bold text-[#17663B]">{acceptedCount}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">{copy.title}</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-2xl">
              <div className="relative flex-1">
                <Search className={`absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ${ar ? "right-3" : "left-3"}`} />
                <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} className={ar ? "pr-9" : "pl-9"} />
              </div>
              <Select value={statusFilter} onValueChange={value => setStatusFilter(value as RegistrationLeadStatus | "all")}>
                <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.allStatuses}</SelectItem>
                  {STATUS_VALUES.map(value => <SelectItem key={value} value={value}>{statusLabel(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{copy.empty}</div>
          ) : filtered.map(lead => (
            <div key={lead.leadId} className="rounded-xl border bg-white p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#173B2D]">{lead.prospectFirstName} {lead.prospectLastName}</span>
                    <Badge variant={lead.status === "accepted" ? "default" : lead.status === "lost" ? "secondary" : "outline"}>{statusLabel(lead.status)}</Badge>
                    <Badge variant="secondary">{lead.branchName}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><UserRoundCheck className="size-4" />{lead.guardianName}</span>
                    <span className="flex items-center gap-1" dir="ltr"><Phone className="size-4" />{lead.guardianPhone}</span>
                    <span>{copy.source}: {sourceLabel(lead.source)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <CalendarClock className="size-4" /> {copy.followUp}: {formatDateTime(lead.nextFollowUpAt)}
                  </div>
                  {lead.notes && <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{lead.notes}</p>}
                </div>
                {access.canManage && branches.some(branch => branch.branchId === lead.branchId && branch.canManage) && (
                  <Button variant="outline" onClick={() => openEdit(lead)}>{copy.edit}</Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) resetCreate(); }}>
        <DialogContent dir={direction} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className={ar ? "text-right" : "text-left"}>
            <DialogTitle>{copy.createTitle}</DialogTitle>
            <DialogDescription>{copy.createDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{copy.branch}</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder={copy.branch} /></SelectTrigger>
                <SelectContent>{manageableBranches.map(branch => <SelectItem key={branch.branchId} value={branch.branchId}>{branch.branchName} ({branch.branchCode})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label htmlFor="crm-first-name">{copy.firstName}</Label><Input id="crm-first-name" value={firstName} onChange={event => setFirstName(event.target.value)} maxLength={100} /></div>
            <div className="space-y-2"><Label htmlFor="crm-last-name">{copy.lastName}</Label><Input id="crm-last-name" value={lastName} onChange={event => setLastName(event.target.value)} maxLength={100} /></div>
            <div className="space-y-2"><Label htmlFor="crm-birth-date">{copy.birthDate}</Label><Input id="crm-birth-date" type="date" value={birthDate} onChange={event => setBirthDate(event.target.value)} /></div>
            <div className="space-y-2"><Label>{copy.gender}</Label><Select value={gender} onValueChange={value => setGender(value as "male" | "female" | "none")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{copy.none}</SelectItem><SelectItem value="male">{copy.male}</SelectItem><SelectItem value="female">{copy.female}</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="crm-guardian-name">{copy.guardianName}</Label><Input id="crm-guardian-name" value={guardianName} onChange={event => setGuardianName(event.target.value)} maxLength={150} /></div>
            <div className="space-y-2"><Label htmlFor="crm-guardian-phone">{copy.guardianPhone}</Label><Input id="crm-guardian-phone" dir="ltr" value={guardianPhone} onChange={event => setGuardianPhone(event.target.value)} maxLength={40} /></div>
            <div className="space-y-2"><Label htmlFor="crm-guardian-email">{copy.guardianEmail}</Label><Input id="crm-guardian-email" type="email" dir="ltr" value={guardianEmail} onChange={event => setGuardianEmail(event.target.value)} maxLength={254} /></div>
            <div className="space-y-2"><Label>{copy.source}</Label><Select value={source} onValueChange={value => setSource(value as RegistrationLeadSource)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SOURCE_VALUES.map(value => <SelectItem key={value} value={value}>{sourceLabel(value)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="crm-follow-up">{copy.followUp}</Label><Input id="crm-follow-up" type="datetime-local" value={followUpAt} onChange={event => setFollowUpAt(event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="crm-notes">{copy.notes}</Label><textarea id="crm-notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={4} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => void submitCreate()} disabled={submitting || !branchId || !firstName.trim() || !lastName.trim() || !guardianName.trim() || !guardianPhone.trim()} className="bg-[#0B4738] hover:bg-[#0B4738]/90">{submitting ? copy.saving : copy.save}</Button>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>{copy.cancel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editLead)} onOpenChange={open => { if (!open) setEditLead(null); }}>
        <DialogContent dir={direction} className="sm:max-w-lg">
          <DialogHeader className={ar ? "text-right" : "text-left"}>
            <DialogTitle>{copy.editTitle}</DialogTitle>
            <DialogDescription>{editLead ? `${editLead.prospectFirstName} ${editLead.prospectLastName} — ${editLead.branchName}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>{copy.status}</Label><Select value={editStatus} onValueChange={value => setEditStatus(value as RegistrationLeadStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_VALUES.map(value => <SelectItem key={value} value={value}>{statusLabel(value)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="crm-edit-follow-up">{copy.followUp}</Label><Input id="crm-edit-follow-up" type="datetime-local" value={editFollowUpAt} onChange={event => setEditFollowUpAt(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="crm-edit-notes">{copy.notes}</Label><textarea id="crm-edit-notes" value={editNotes} onChange={event => setEditNotes(event.target.value)} maxLength={2000} rows={5} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={() => void submitEdit()} disabled={submitting} className="bg-[#0B4738] hover:bg-[#0B4738]/90">{submitting ? copy.saving : copy.update}</Button><Button variant="outline" onClick={() => setEditLead(null)} disabled={submitting}>{copy.cancel}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
