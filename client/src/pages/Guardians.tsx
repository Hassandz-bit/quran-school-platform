import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Download, Mail, Pencil, Phone, Plus, RefreshCw, Search, ShieldCheck, UserX, Users } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
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
import { Switch } from "@/components/ui/switch";
import {
  GuardianInviteError,
  fetchGuardianDirectory,
  fetchGuardianBranchRights,
  fetchGuardianInviteStudents,
  fetchGuardianManagementAccess,
  guardianInviteErrorMessage,
  guardianRelationshipLabel,
  guardianStatusLabel,
  invitationStatusLabel,
  inviteGuardian,
  revokeGuardianRelationship,
  updateGuardianRelationship,
  type GuardianDirectoryRow,
  type GuardianBranchRights,
  type GuardianInviteStudent,
  type GuardianManagementAccess,
  type GuardianRelationshipType,
} from "@/lib/guardians";
import { downloadGuardianImportTemplate } from "@/lib/student-import";

const relationshipTypes: GuardianRelationshipType[] = [
  "father",
  "mother",
  "legal_guardian",
  "relative",
  "other",
];

const emptyAccess: GuardianManagementAccess = {
  canView: false,
  canInvite: false,
  canViewContacts: false,
  canRevoke: false,
};

type GuardianDirectoryStatusFilter = "all" | "not_invited" | "pending" | "sent" | "accepted" | "active" | "failed" | "expired" | "revoked";

function guardianDirectoryCohortKey(row: GuardianDirectoryRow) {
  return `${row.branchId}:${row.className ?? "__no_class__"}`;
}

function matchesGuardianStatus(row: GuardianDirectoryRow, filter: GuardianDirectoryStatusFilter) {
  if (filter === "all") return true;
  if (filter === "not_invited") return row.invitationStatus === null;
  if (filter === "pending") return row.relationshipStatus === "pending" || row.invitationStatus === "prepared";
  if (filter === "active") return row.relationshipStatus === "active";
  if (filter === "revoked") return row.relationshipStatus === "revoked" || row.invitationStatus === "revoked";
  return row.invitationStatus === filter;
}

export default function Guardians() {
  const { school } = useAuth();
  const [, setLocation] = useLocation();
  const [access, setAccess] = useState<GuardianManagementAccess>(emptyAccess);
  const [rows, setRows] = useState<GuardianDirectoryRow[]>([]);
  const [branchRights, setBranchRights] = useState<Map<string, GuardianBranchRights>>(() => new Map());
  const [inviteStudents, setInviteStudents] = useState<GuardianInviteStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<GuardianDirectoryStatusFilter>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [relationshipType, setRelationshipType] = useState<GuardianRelationshipType>("father");
  const [isPrimary, setIsPrimary] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [editing, setEditing] = useState<GuardianDirectoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRelationshipType, setEditRelationshipType] = useState<GuardianRelationshipType>("father");
  const [editIsPrimary, setEditIsPrimary] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const nextAccess = await fetchGuardianManagementAccess(school.id);
      setAccess(nextAccess);
      if (!nextAccess.canView) {
        setRows([]);
        setInviteStudents([]);
        setBranchRights(new Map());
        return;
      }
      const [directory, students] = await Promise.all([
        fetchGuardianDirectory(school.id),
        nextAccess.canInvite ? fetchGuardianInviteStudents(school.id) : Promise.resolve([]),
      ]);
      const rights = await fetchGuardianBranchRights(school.id, directory.map(row => row.branchId));
      setRows(directory);
      setBranchRights(rights);
      setInviteStudents(students);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const cohortOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of rows) {
      options.set(guardianDirectoryCohortKey(row), `${row.branchName} — ${row.className ?? "بدون فوج/حلقة"}`);
    }
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1], "ar"));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    return rows.filter(row =>
      (cohortFilter === "all" || guardianDirectoryCohortKey(row) === cohortFilter) &&
      matchesGuardianStatus(row, statusFilter) &&
      (!needle || [
        row.studentName,
        row.guardianName,
        row.guardianEmail ?? "",
        row.guardianPhone ?? "",
        row.branchName,
        row.className ?? "",
      ].some(value => value.toLocaleLowerCase("ar").includes(needle)))
    );
  }, [cohortFilter, query, rows, statusFilter]);

  const activeCount = rows.filter(row => row.relationshipStatus === "active").length;
  const pendingCount = rows.filter(row => row.relationshipStatus === "pending").length;

  const resetInvite = () => {
    setStudentId("");
    setFullName("");
    setEmail("");
    setRelationshipType("father");
    setIsPrimary(false);
  };

  const submitInvite = async () => {
    if (!school?.id || !studentId || !fullName.trim() || !email.trim()) {
      toast.error("أكمل بيانات الدعوة المطلوبة.");
      return;
    }
    setSubmitting(true);
    try {
      await inviteGuardian({
        schoolId: school.id,
        studentId,
        email,
        fullName,
        relationshipType,
        isPrimary,
      });
      toast.success("تم إرسال دعوة ولي الأمر بصورة آمنة.");
      setInviteOpen(false);
      resetInvite();
      await load();
    } catch (error) {
      toast.error(
        error instanceof GuardianInviteError
          ? guardianInviteErrorMessage(error.code)
          : "تعذر إرسال دعوة ولي الأمر حاليًا."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    if (!school?.id) return;
    setDownloadingTemplate(true);
    try {
      await downloadGuardianImportTemplate(school.id);
      toast.success("تم تنزيل نموذج الاستيراد الجماعي للأولياء.");
    } catch {
      toast.error("تعذر تنزيل نموذج استيراد الأولياء.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const startEditing = (row: GuardianDirectoryRow) => {
    setEditing(row);
    setEditName(row.guardianName);
    setEditPhone(row.guardianPhone ?? "");
    setEditRelationshipType(row.relationshipType);
    setEditIsPrimary(row.isPrimary);
  };

  const submitEdit = async () => {
    if (!school?.id || !editing) return;
    const rights = branchRights.get(editing.branchId);
    if (!rights?.canEdit || editName.trim().length < 2) {
      toast.error("تحقق من الاسم وصلاحية تعديل علاقة الولي.");
      return;
    }
    setEditSubmitting(true);
    try {
      await updateGuardianRelationship({
        schoolId: school.id,
        relationshipId: editing.relationshipId,
        guardianName: editName,
        guardianPhone: rights.canViewContacts ? (editPhone.trim() || null) : null,
        relationshipType: editRelationshipType,
        isPrimary: editIsPrimary,
      });
      toast.success("تم تحديث بيانات الولي المرتبطة بهذا الطالب.");
      setEditing(null);
      await load();
    } catch {
      toast.error("تعذر تحديث علاقة ولي الأمر؛ تحقق من الصلاحيات والحالة.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const revoke = async (row: GuardianDirectoryRow) => {
    if (!school?.id || !branchRights.get(row.branchId)?.canRevoke || row.relationshipStatus === "revoked") return;
    if (!window.confirm("هل تريد إلغاء وصول ولي الأمر إلى بيانات هذا الطالب؟ سيبقى سجل العلاقة محفوظًا.")) return;
    try {
      await revokeGuardianRelationship(school.id, row.relationshipId);
      toast.success("تم إلغاء وصول ولي الأمر مع حفظ سجل العلاقة.");
      await load();
    } catch {
      toast.error("تعذر إلغاء ربط ولي الأمر؛ تحقق من الصلاحيات والحالة.");
    }
  };

  if (!school?.id) {
    return <div className="p-6 text-sm text-muted-foreground">تعذر تحديد المدرسة الحالية.</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3" dir="rtl">
        <RefreshCw className="size-5 animate-spin text-[#17663B]" />
        <span>جارٍ تحميل بيانات الأولياء...</span>
      </div>
    );
  }

  if (!access.canView) {
    return (
      <Card className="mx-auto mt-8 max-w-2xl" dir="rtl">
        <CardContent className="flex items-start gap-3 p-6">
          <ShieldCheck className="mt-0.5 size-5 text-[#17663B]" />
          <div>
            <h1 className="font-bold">الأولياء</h1>
            <p className="mt-1 text-sm text-muted-foreground">لا تملك صلاحية عرض روابط أولياء الطلبة في نطاقك الحالي.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#173B2D]">
            <Users className="size-6 text-[#17663B]" /> الأولياء
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">إدارة روابط أولياء الأمور ودعواتهم ومتابعة حالة التفعيل.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" /> تحديث
          </Button>
          {access.canInvite && (
            <Button variant="outline" onClick={() => setLocation("/guardians/import")}>
              <Users className="size-4" /> استيراد الأولياء
            </Button>
          )}
          {access.canInvite && (
            <Button variant="outline" onClick={() => void downloadTemplate()} disabled={downloadingTemplate}>
              {downloadingTemplate ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />} نموذج استيراد الأولياء
            </Button>
          )}
          {access.canInvite && (
            <Button className="bg-[#0B4738] hover:bg-[#0B4738]/90" onClick={() => setInviteOpen(true)}>
              <Plus className="size-4" /> دعوة ولي أمر
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-800">تعذر تحميل بيانات الأولياء. أعد المحاولة.</CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">إجمالي الروابط</div><div className="mt-1 text-2xl font-bold">{rows.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">نشطة</div><div className="mt-1 text-2xl font-bold text-[#17663B]">{activeCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">بانتظار التفعيل</div><div className="mt-1 text-2xl font-bold text-amber-700">{pendingCount}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">روابط الأولياء</CardTitle>
            <div className="grid w-full gap-2 sm:max-w-4xl sm:grid-cols-[minmax(190px,1fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)]">
              <div className="relative">
                <Search className="absolute right-3 top-3 size-4 text-muted-foreground" />
                <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="بحث بالطالب أو الولي أو الفرع..." className="pr-9" />
              </div>
              <label className="text-xs font-semibold text-muted-foreground">الفوج / الحلقة
                <select value={cohortFilter} onChange={event => setCohortFilter(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground">
                  <option value="all">كل الأفواج</option>
                  {cohortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">حالة الدعوة / العلاقة
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as GuardianDirectoryStatusFilter)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground">
                  <option value="all">كل الحالات</option>
                  <option value="not_invited">لم تُرسل دعوة</option>
                  <option value="pending">قيد الانتظار / بانتظار التفعيل</option>
                  <option value="sent">أُرسلت الدعوة</option>
                  <option value="accepted">قُبلت الدعوة</option>
                  <option value="active">نشط</option>
                  <option value="failed">تعذر الإرسال</option>
                  <option value="expired">انتهت الدعوة</option>
                  <option value="revoked">ملغاة</option>
                </select>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد روابط أولياء مطابقة.</div>
          ) : filtered.map(row => (
            <div key={row.relationshipId} className="rounded-xl border bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#173B2D]">{row.guardianName}</span>
                    <Badge variant={row.relationshipStatus === "active" ? "default" : "secondary"}>{guardianStatusLabel(row.relationshipStatus)}</Badge>
                    {row.isPrimary && <Badge variant="outline">ولي أساسي</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {guardianRelationshipLabel(row.relationshipType)} لـ <span className="font-medium text-foreground">{row.studentName}</span>
                    {` — ${row.branchName}${row.className ? ` / ${row.className}` : ""}`}
                  </div>
                  {access.canViewContacts && (row.guardianEmail || row.guardianPhone) && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {row.guardianEmail && <span className="flex items-center gap-1"><Mail className="size-3.5" />{row.guardianEmail}</span>}
                      {row.guardianPhone && <span className="flex items-center gap-1"><Phone className="size-3.5" />{row.guardianPhone}</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <div className="flex items-center gap-2"><BellRing className="size-4 text-[#17663B]" /><span>{invitationStatusLabel(row.invitationStatus)}</span></div>
                  {row.relationshipStatus !== "revoked" && branchRights.get(row.branchId)?.canEdit && <Button type="button" size="sm" variant="outline" onClick={() => startEditing(row)}><Pencil className="size-3.5" />تعديل بيانات العلاقة</Button>}
                  {row.relationshipStatus !== "revoked" && branchRights.get(row.branchId)?.canRevoke && <Button type="button" size="sm" variant="outline" className="text-red-700 hover:text-red-800" onClick={() => void revoke(row)}><UserX className="size-3.5" />إلغاء الربط</Button>}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={open => { setInviteOpen(open); if (!open) resetInvite(); }}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>دعوة ولي أمر</DialogTitle>
            <DialogDescription>اختر الطالب ثم أدخل هوية ولي الأمر. سيصل رابط تفعيل آمن إلى البريد.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الطالب</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="اختر الطالب" /></SelectTrigger>
                <SelectContent>
                  {inviteStudents.map(student => (
                    <SelectItem key={student.studentId} value={student.studentId}>
                      {student.studentName} — {student.branchName}{student.className ? ` / ${student.className}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label htmlFor="guardian-name">اسم ولي الأمر</Label><Input id="guardian-name" value={fullName} onChange={event => setFullName(event.target.value)} maxLength={150} /></div>
            <div className="space-y-2"><Label htmlFor="guardian-email">البريد الإلكتروني</Label><Input id="guardian-email" type="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} /></div>
            <div className="space-y-2">
              <Label>صلة القرابة</Label>
              <Select value={relationshipType} onValueChange={value => setRelationshipType(value as GuardianRelationshipType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{relationshipTypes.map(type => <SelectItem key={type} value={type}>{guardianRelationshipLabel(type)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div><div className="text-sm font-medium">ولي أساسي</div><div className="text-xs text-muted-foreground">يمكن تعيين ولي أساسي واحد فقط للطالب.</div></div>
              <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => void submitInvite()} disabled={submitting || !studentId || !fullName.trim() || !email.trim()} className="bg-[#0B4738] hover:bg-[#0B4738]/90">
              {submitting ? "جارٍ الإرسال..." : "إرسال الدعوة"}
            </Button>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={submitting}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !editSubmitting) setEditing(null); }}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>تعديل بيانات علاقة ولي الأمر</DialogTitle>
            <DialogDescription>تُحفظ التعديلات لهذا الطالب فقط. لا يتغير بريد تسجيل الدخول أو ملف الولي المشترك مع مدارس أخرى.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="edit-guardian-student">الطالب</Label><Input id="edit-guardian-student" value={editing?.studentName ?? ""} readOnly /></div>
            <div className="space-y-2"><Label htmlFor="edit-guardian-name">اسم ولي الأمر</Label><Input id="edit-guardian-name" value={editName} onChange={event => setEditName(event.target.value)} maxLength={150} /></div>
            {editing && branchRights.get(editing.branchId)?.canViewContacts && <>
              <div className="space-y-2"><Label htmlFor="edit-guardian-email">البريد المرتبط بالحساب (غير قابل للتعديل هنا)</Label><Input id="edit-guardian-email" value={editing.guardianEmail ?? "—"} readOnly dir="ltr" /></div>
              <div className="space-y-2"><Label htmlFor="edit-guardian-phone">هاتف ولي الأمر لهذا الطالب</Label><Input id="edit-guardian-phone" value={editPhone} onChange={event => setEditPhone(event.target.value)} dir="ltr" type="tel" maxLength={40} /></div>
            </>}
            <div className="space-y-2">
              <Label>صلة القرابة</Label>
              <Select value={editRelationshipType} onValueChange={value => setEditRelationshipType(value as GuardianRelationshipType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{relationshipTypes.map(type => <SelectItem key={type} value={type}>{guardianRelationshipLabel(type)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div><div className="text-sm font-medium">ولي أساسي</div><div className="text-xs text-muted-foreground">سيصبح هذا الرابط أساسيًا للطالب، ويُحدّث الرابط الأساسي السابق تلقائيًا.</div></div>
              <Switch checked={editIsPrimary} onCheckedChange={setEditIsPrimary} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => void submitEdit()} disabled={editSubmitting || !editing || editName.trim().length < 2} className="bg-[#0B4738] hover:bg-[#0B4738]/90">{editSubmitting ? "جارٍ الحفظ..." : "حفظ التعديلات"}</Button>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={editSubmitting}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
