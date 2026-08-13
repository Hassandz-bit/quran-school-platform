import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Mail, Phone, Plus, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
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
  fetchGuardianInviteStudents,
  fetchGuardianManagementAccess,
  guardianInviteErrorMessage,
  guardianRelationshipLabel,
  guardianStatusLabel,
  invitationStatusLabel,
  inviteGuardian,
  type GuardianDirectoryRow,
  type GuardianInviteStudent,
  type GuardianManagementAccess,
  type GuardianRelationshipType,
} from "@/lib/guardians";

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

export default function Guardians() {
  const { school } = useAuth();
  const [access, setAccess] = useState<GuardianManagementAccess>(emptyAccess);
  const [rows, setRows] = useState<GuardianDirectoryRow[]>([]);
  const [inviteStudents, setInviteStudents] = useState<GuardianInviteStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [relationshipType, setRelationshipType] = useState<GuardianRelationshipType>("father");
  const [isPrimary, setIsPrimary] = useState(false);

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
        return;
      }
      const [directory, students] = await Promise.all([
        fetchGuardianDirectory(school.id),
        nextAccess.canInvite ? fetchGuardianInviteStudents(school.id) : Promise.resolve([]),
      ]);
      setRows(directory);
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    if (!needle) return rows;
    return rows.filter(row =>
      [
        row.studentName,
        row.guardianName,
        row.guardianEmail ?? "",
        row.guardianPhone ?? "",
        row.branchName,
        row.className ?? "",
      ].some(value => value.toLocaleLowerCase("ar").includes(needle))
    );
  }, [query, rows]);

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" /> تحديث
          </Button>
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
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="بحث بالطالب أو الولي أو الفرع..." className="pr-9" />
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
                <div className="flex items-center gap-2 text-sm">
                  <BellRing className="size-4 text-[#17663B]" />
                  <span>{invitationStatusLabel(row.invitationStatus)}</span>
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
    </div>
  );
}
