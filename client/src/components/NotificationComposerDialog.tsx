import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Loader2, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/contexts/LocaleContext";
import {
  fetchManualNotificationRecipients,
  fetchNotificationScopes,
  sendManualNotification,
  type NotificationAudience,
  type NotificationCategory,
  type NotificationRecipient,
  type NotificationScopes,
} from "@/lib/notifications";

type DeliveryMode = "individual" | "group" | "custom";
type GroupMode = "all" | "audience" | "branch" | "class";

const categoryOptions: Array<{ value: NotificationCategory; ar: string; en: string }> = [
  { value: "administration", ar: "الإدارة", en: "Administration" },
  { value: "teachers", ar: "المعلمون", en: "Teachers" },
  { value: "students", ar: "الطلاب", en: "Students" },
  { value: "learning", ar: "التعليم والحفظ", en: "Learning and memorization" },
  { value: "attendance", ar: "الحضور", en: "Attendance" },
  { value: "finance", ar: "المالية", en: "Finance" },
  { value: "guardians", ar: "الأولياء", en: "Guardians" },
  { value: "system", ar: "النظام", en: "System" },
];

const audienceOptions: Array<{ value: NotificationAudience; ar: string; en: string }> = [
  { value: "staff", ar: "الموظفون", en: "Staff" },
  { value: "teachers", ar: "المعلمون", en: "Teachers" },
  { value: "students", ar: "أولياء الطلاب", en: "Student guardians" },
  { value: "guardians", ar: "الأولياء", en: "Guardians" },
];

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function NotificationComposerDialog({
  schoolId,
  onSent,
}: {
  schoolId: string;
  onSent: () => void | Promise<void>;
}) {
  const { locale, direction } = useLocale();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [scopes, setScopes] = useState<NotificationScopes>({ branches: [], classes: [] });
  const [mode, setMode] = useState<DeliveryMode>("individual");
  const [groupMode, setGroupMode] = useState<GroupMode>("all");
  const [audience, setAudience] = useState<NotificationAudience>("staff");
  const [scopeId, setScopeId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<NotificationCategory>("administration");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetPath, setTargetPath] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void Promise.all([
      fetchManualNotificationRecipients(schoolId),
      fetchNotificationScopes(schoolId),
    ]).then(([nextRecipients, nextScopes]) => {
      if (!active) return;
      setRecipients(nextRecipients);
      setScopes(nextScopes);
    }).catch(() => {
      if (active) toast.error(en ? "Could not load recipients." : "تعذر تحميل المستلمين.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [en, open, schoolId]);

  const filteredRecipients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    if (!normalized) return recipients;
    return recipients.filter(recipient =>
      `${recipient.fullName} ${recipient.relatedStudents.join(" ")}`
        .toLocaleLowerCase(locale)
        .includes(normalized)
    );
  }, [locale, query, recipients]);

  const resolvedIds = useMemo(() => {
    if (mode === "individual") return selectedIds.slice(0, 1);
    if (mode === "custom") return selectedIds;
    if (groupMode === "all") return recipients.map(recipient => recipient.profileId);
    if (groupMode === "audience") {
      return recipients.filter(recipient => recipient.audienceTypes.includes(audience)).map(recipient => recipient.profileId);
    }
    if (!scopeId) return [];
    if (groupMode === "branch") {
      return recipients.filter(recipient => recipient.branchIds.includes(scopeId)).map(recipient => recipient.profileId);
    }
    return recipients.filter(recipient => recipient.classIds.includes(scopeId)).map(recipient => recipient.profileId);
  }, [audience, groupMode, mode, recipients, scopeId, selectedIds]);

  const uniqueResolvedIds = useMemo(() => [...new Set(resolvedIds)], [resolvedIds]);
  const resetSelection = (nextMode: DeliveryMode) => {
    setMode(nextMode);
    setSelectedIds([]);
    setQuery("");
  };

  const toggleRecipient = (profileId: string) => {
    if (mode === "individual") {
      setSelectedIds([profileId]);
      return;
    }
    setSelectedIds(current => current.includes(profileId)
      ? current.filter(id => id !== profileId)
      : [...current, profileId]);
  };

  const submit = async () => {
    if (!title.trim() || !body.trim() || uniqueResolvedIds.length === 0) {
      toast.error(en ? "Add a title, message and at least one recipient." : "أضف العنوان والنص وحدد مستلمًا واحدًا على الأقل.");
      return;
    }
    setSending(true);
    try {
      const result = await sendManualNotification({
        schoolId,
        recipientProfileIds: uniqueResolvedIds,
        category,
        title,
        body,
        targetPath,
        targetingSummary: { mode, groupMode: mode === "group" ? groupMode : null, audience, scopeId: scopeId || null },
      });
      toast.success(en
        ? `Notification sent to ${result.recipientCount} recipients.`
        : `تم إرسال الإشعار إلى ${result.recipientCount} مستلمًا.`);
      setOpen(false);
      setTitle("");
      setBody("");
      setTargetPath("");
      setSelectedIds([]);
      await onSent();
    } catch {
      toast.error(en ? "The notification could not be sent." : "تعذر إرسال الإشعار.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#17663B] hover:bg-[#125432]">
          <BellRing className="size-4" /> {en ? "Create notification" : "إنشاء إشعار"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" dir={direction}>
        <DialogHeader className={en ? "text-left" : "text-right"}>
          <DialogTitle>{en ? "Create and send a notification" : "إنشاء وإرسال إشعار"}</DialogTitle>
          <DialogDescription>
            {en ? "Choose individual, group or specific recipients. The final count is shown before sending."
              : "اختر إرسالًا فرديًا أو جماعيًا أو أشخاصًا محددين، وراجع العدد قبل الإرسال."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {(["individual", "group", "custom"] as const).map(value => (
              <Button key={value} type="button" variant={mode === value ? "default" : "outline"}
                onClick={() => resetSelection(value)}>
                {value === "individual" ? (en ? "Individual" : "فردي")
                  : value === "group" ? (en ? "Group" : "جماعي")
                    : (en ? "Specific people" : "أشخاص محددون")}
              </Button>
            ))}
          </div>

          {mode === "group" && (
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-medium">{en ? "Group type" : "نوع المجموعة"}</span>
                <select className={selectClass} value={groupMode} onChange={event => { setGroupMode(event.target.value as GroupMode); setScopeId(""); }}>
                  <option value="all">{en ? "Everyone" : "الجميع"}</option>
                  <option value="audience">{en ? "Category" : "فئة محددة"}</option>
                  <option value="branch">{en ? "Branch" : "فرع محدد"}</option>
                  <option value="class">{en ? "Class" : "حلقة محددة"}</option>
                </select>
              </label>
              {groupMode === "audience" && (
                <label>
                  <span className="mb-1 block text-sm font-medium">{en ? "Recipients" : "المعنيون"}</span>
                  <select className={selectClass} value={audience} onChange={event => setAudience(event.target.value as NotificationAudience)}>
                    {audienceOptions.map(option => <option key={option.value} value={option.value}>{en ? option.en : option.ar}</option>)}
                  </select>
                </label>
              )}
              {groupMode === "branch" && (
                <label>
                  <span className="mb-1 block text-sm font-medium">{en ? "Branch" : "الفرع"}</span>
                  <select className={selectClass} value={scopeId} onChange={event => setScopeId(event.target.value)}>
                    <option value="">{en ? "Choose a branch" : "اختر الفرع"}</option>
                    {scopes.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </label>
              )}
              {groupMode === "class" && (
                <label>
                  <span className="mb-1 block text-sm font-medium">{en ? "Class" : "الحلقة"}</span>
                  <select className={selectClass} value={scopeId} onChange={event => setScopeId(event.target.value)}>
                    <option value="">{en ? "Choose a class" : "اختر الحلقة"}</option>
                    {scopes.classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {mode !== "group" && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="relative">
                <Search className={`absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ${en ? "left-3" : "right-3"}`} />
                <Input value={query} onChange={event => setQuery(event.target.value)}
                  placeholder={en ? "Search by member, guardian or student name" : "ابحث باسم الموظف أو الولي أو الطالب"}
                  className={en ? "pl-9" : "pr-9"} />
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{en ? "Loading recipients..." : "جارٍ تحميل المستلمين..."}</div>
                ) : filteredRecipients.length === 0 ? (
                  <p className="p-5 text-center text-sm text-muted-foreground">{en ? "No matching recipients." : "لا يوجد مستلمون مطابقون."}</p>
                ) : filteredRecipients.map(recipient => {
                  const checked = selectedIds.includes(recipient.profileId);
                  const rowClassName = `flex w-full items-center gap-3 rounded-lg border p-3 text-start ${checked ? "border-[#17663B] bg-[#F1F8F4]" : "border-transparent hover:bg-muted/50"}`;
                  const details = (
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{recipient.fullName}</strong>
                      <small className="block truncate text-muted-foreground">
                        {recipient.audienceTypes.map(type => audienceOptions.find(option => option.value === type)?.[en ? "en" : "ar"] ?? type).join(" • ")}
                        {recipient.relatedStudents.length > 0 ? ` — ${recipient.relatedStudents.join("، ")}` : ""}
                      </small>
                    </span>
                  );
                  if (mode === "custom") {
                    return (
                      <div key={recipient.profileId} className={rowClassName}>
                        <Checkbox checked={checked} onCheckedChange={() => toggleRecipient(recipient.profileId)} aria-label={recipient.fullName} />
                        {details}
                      </div>
                    );
                  }
                  return (
                    <button type="button" key={recipient.profileId} onClick={() => toggleRecipient(recipient.profileId)}
                      className={rowClassName}>
                      <span className={`flex size-5 items-center justify-center rounded-full border ${checked ? "border-[#17663B] bg-[#17663B] text-white" : ""}`}>{checked && <Check className="size-3" />}</span>
                      {details}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm font-medium">{en ? "Category" : "التصنيف"}</span>
              <select className={selectClass} value={category} onChange={event => setCategory(event.target.value as NotificationCategory)}>
                {categoryOptions.map(option => <option key={option.value} value={option.value}>{en ? option.en : option.ar}</option>)}
              </select>
            </label>
            <div>
              <Label htmlFor="notification-target-path">{en ? "Internal link (optional)" : "رابط داخلي (اختياري)"}</Label>
              <Input id="notification-target-path" value={targetPath} onChange={event => setTargetPath(event.target.value)} placeholder="/attendance" dir="ltr" />
            </div>
          </div>
          <div>
            <Label htmlFor="notification-title">{en ? "Title" : "العنوان"}</Label>
            <Input id="notification-title" value={title} maxLength={160} onChange={event => setTitle(event.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">{title.length}/160</p>
          </div>
          <div>
            <Label htmlFor="notification-body">{en ? "Message" : "نص الإشعار"}</Label>
            <Textarea id="notification-body" value={body} maxLength={700} rows={5} onChange={event => setBody(event.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">{body.length}/700</p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#C8A26A]/40 bg-[#C8A26A]/10 p-4">
            <span className="flex items-center gap-2 text-sm font-medium"><Users className="size-4" />{en ? "Recipients before sending" : "عدد المستلمين قبل الإرسال"}</span>
            <strong className="text-xl text-[#17663B]">{uniqueResolvedIds.length}</strong>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>{en ? "Cancel" : "إلغاء"}</Button>
          <Button type="button" onClick={() => void submit()} disabled={sending || loading || uniqueResolvedIds.length === 0} className="bg-[#17663B] hover:bg-[#125432]">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? (en ? "Sending..." : "جارٍ الإرسال...") : (en ? "Send notification" : "إرسال الإشعار")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
