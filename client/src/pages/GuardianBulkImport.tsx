import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, RefreshCw, Send, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { downloadGuardianImportErrors, previewGuardianImport, type GuardianImportRow } from "@/lib/guardian-import";
import { fetchGuardianManagementAccess, inviteGuardian, type GuardianRelationshipType } from "@/lib/guardians";
import { downloadGuardianImportTemplate } from "@/lib/student-import";

type Copy = {
  title: string; subtitle: string; back: string; template: string; choose: string;
  preview: string; send: string; report: string; file: string; row: string;
  student: string; guardian: string; email: string; branch: string; relationship: string;
  status: string; issues: string; ready: string; error: string; duplicate: string;
  sent: string; sending: string; previewDone: string; failed: string; noRows: string;
  security: string; noAccess: string; loading: string; confirmTitle: string;
  confirmText: string; cancel: string; confirmSend: string; sentToast: string;
  sendFailed: string; sendProgress: string; studentNotFound: string; studentAmbiguous: string;
  cohort: string; allCohorts: string; noCohort: string; noCohortRows: string;
  guardianNameInvalid: string; guardianEmailInvalid: string; guardianPhoneInvalid: string;
  branchNotFound: string; relationshipInvalid: string; primaryInvalid: string;
  duplicateRelationship: string; multiplePrimary: string; inviteFailed: string;
  relationFather: string; relationMother: string; relationLegal: string; relationRelative: string; relationOther: string;
};

const AR: Copy = {
  title: "الاستيراد الجماعي للأولياء",
  subtitle: "ارفع ملف Excel، طابق الأولياء بالطلاب، راجع الصفوف الجاهزة ثم أرسل الدعوات بعد التأكيد.",
  back: "العودة إلى الأولياء", template: "تنزيل نموذج Excel", choose: "اختيار ملف .xlsx",
  preview: "فحص ومعاينة", send: "إرسال الدعوات الجاهزة", report: "تنزيل تقرير الأخطاء",
  file: "الملف", row: "الصف", student: "الطالب", guardian: "ولي الأمر", email: "البريد الإلكتروني",
  branch: "الفرع", relationship: "صلة القرابة", status: "الحالة", issues: "الملاحظات",
  ready: "جاهز", error: "خطأ", duplicate: "مكرر", sent: "أُرسلت الدعوة", sending: "جارٍ إرسال الدعوات...",
  previewDone: "اكتملت المعاينة؛ لم تُرسل أي دعوة.", failed: "تعذر تنفيذ العملية. تحقق من الملف والصلاحيات ثم أعد المحاولة.",
  noRows: "لا توجد صفوف في المعاينة بعد.",
  security: "المعاينة لا تنشئ حسابات ولا ترسل بريدًا. عند التأكيد سيُنشئ النظام أو يطابق حساب الولي ويرسل دعوة بريد لكل صف جاهز. إرسال البريد لا يمكن التراجع عنه من هذه الصفحة.",
  noAccess: "لا تملك صلاحية دعوة وربط أولياء الأمور.", loading: "جارٍ التحقق من الصلاحيات...",
  confirmTitle: "تأكيد إرسال دعوات الأولياء",
  confirmText: "سيُرسل بريد دعوة فعلي إلى عناوين الصفوف الجاهزة أدناه. لا ترسل إلا إذا كانت البيانات والعناوين صحيحة.",
  cancel: "مراجعة الملف", confirmSend: "تأكيد وإرسال", sentToast: "اكتمل إرسال الدعوات الجاهزة.",
  sendFailed: "اكتمل الإرسال مع صفوف تعذر إرسالها؛ راجع التقرير قبل إعادة المحاولة.",
  sendProgress: "تمت معالجة", studentNotFound: "لم يُعثر على طالب مطابق في الفرع المحدد",
  cohort: "الفوج / الحلقة", allCohorts: "كل الأفواج", noCohort: "بدون فوج/حلقة", noCohortRows: "لا توجد صفوف مطابقة لهذا الفوج.",
  studentAmbiguous: "اسم الطالب متكرر؛ أضف رقم هويته لتحديده بدقة",
  guardianNameInvalid: "اسم ولي الأمر غير صالح", guardianEmailInvalid: "البريد الإلكتروني غير صالح",
  guardianPhoneInvalid: "رقم الهاتف غير صالح", branchNotFound: "رمز الفرع غير موجود أو غير متاح للصلاحية",
  relationshipInvalid: "صلة القرابة غير صالحة", primaryInvalid: "قيمة الولي الأساسي غير صالحة",
  duplicateRelationship: "تكرار علاقة الطالب والولي في الملف", multiplePrimary: "يوجد أكثر من ولي أساسي للطالب في الملف",
  inviteFailed: "تعذر إرسال الدعوة لهذا الصف؛ تحقق من حالة الدعوة وحاول لاحقًا.",
  relationFather: "الأب", relationMother: "الأم", relationLegal: "الولي الشرعي", relationRelative: "قريب", relationOther: "أخرى",
};
const EN: Copy = {
  title: "Bulk Guardian Import", subtitle: "Upload an Excel file, match guardians to students, review eligible rows, then send invitations after confirmation.",
  back: "Back to guardians", template: "Download Excel template", choose: "Choose .xlsx file",
  preview: "Validate & preview", send: "Send eligible invitations", report: "Download issue report",
  file: "File", row: "Row", student: "Student", guardian: "Guardian", email: "Email", branch: "Branch",
  relationship: "Relationship", status: "Status", issues: "Issues", ready: "Ready", error: "Error",
  duplicate: "Duplicate", sent: "Invitation sent", sending: "Sending invitations...", previewDone: "Preview complete; no invitations have been sent.",
  failed: "The operation could not be completed. Check the file and permissions, then retry.", noRows: "No preview rows yet.",
  security: "Preview does not create accounts or send email. On confirmation, the system will create or match guardian accounts and email an invitation for every eligible row. Email cannot be recalled from this page.",
  noAccess: "You do not have permission to invite and link guardians.", loading: "Checking permissions...", confirmTitle: "Confirm guardian invitations",
  confirmText: "A real invitation email will be sent to every eligible address below. Continue only after reviewing the data and addresses.",
  cancel: "Review file", confirmSend: "Confirm and send", sentToast: "Eligible invitations have been processed.",
  sendFailed: "Processing finished with failed rows; review the report before retrying.", sendProgress: "Processed",
  cohort: "Cohort / class", allCohorts: "All cohorts", noCohort: "No cohort/class", noCohortRows: "No rows match this cohort.",
  studentNotFound: "No matching student was found in the selected branch", studentAmbiguous: "Student name is ambiguous; add the national ID to identify the student",
  guardianNameInvalid: "Invalid guardian name", guardianEmailInvalid: "Invalid email", guardianPhoneInvalid: "Invalid phone number",
  branchNotFound: "Branch code was not found or is outside your permission scope", relationshipInvalid: "Invalid relationship type",
  primaryInvalid: "Invalid primary-guardian value", duplicateRelationship: "Duplicate student/guardian relationship in file",
  multiplePrimary: "More than one primary guardian is set for this student in the file", inviteFailed: "Could not send this invitation; check invitation status and retry later.",
  relationFather: "Father", relationMother: "Mother", relationLegal: "Legal guardian", relationRelative: "Relative", relationOther: "Other",
};
const RELATION_LABEL: Record<GuardianRelationshipType, keyof Copy> = {
  father: "relationFather", mother: "relationMother", legal_guardian: "relationLegal", relative: "relationRelative", other: "relationOther",
};

function bulkRowCohortKey(row: GuardianImportRow) {
  if (!row.studentId) return null;
  const branch = String(row.payload.branch_code ?? "").trim().toUpperCase();
  return `${branch}:${row.studentClassName?.trim() || "__no_class__"}`;
}

export default function GuardianBulkImport() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const copy = locale === "ar" ? AR : EN;
  const [, setLocation] = useLocation();
  const [canImport, setCanImport] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<GuardianImportRow[]>([]);
  const [cohortFilter, setCohortFilter] = useState("all");
  const [batchKey, setBatchKey] = useState("");
  const [busy, setBusy] = useState<"template" | "preview" | "commit" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const cohortOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of rows) {
      const key = bulkRowCohortKey(row);
      if (!key) continue;
      const className = row.studentClassName?.trim() || copy.noCohort;
      const branch = String(row.payload.branch_code ?? "").trim().toUpperCase();
      options.set(key, `${className} — ${branch}`);
    }
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [copy.noCohort, rows]);
  const visibleRows = useMemo(() => rows.filter(row => cohortFilter === "all" || bulkRowCohortKey(row) === cohortFilter), [cohortFilter, rows]);
  const eligibleRows = useMemo(() => visibleRows.filter(row => row.rowStatus === "ready" || row.rowStatus === "delivery_error"), [visibleRows]);

  useEffect(() => {
    let active = true;
    if (!school?.id) return;
    void fetchGuardianManagementAccess(school.id).then(access => {
      if (active) setCanImport(access.canInvite);
    }).catch(() => {
      if (active) setCanImport(false);
    });
    return () => { active = false; };
  }, [school?.id]);

  const handleTemplate = async () => {
    if (!school?.id) return;
    setBusy("template");
    try { await downloadGuardianImportTemplate(school.id); }
    catch { toast.error(copy.failed); }
    finally { setBusy(null); }
  };
  const handlePreview = async () => {
    if (!school?.id || !file) return;
    setBusy("preview");
    setRows([]);
    setBatchKey("");
    try {
      const nextRows = await previewGuardianImport(school.id, file);
      setRows(nextRows);
      setBatchKey(crypto.randomUUID());
      toast.success(copy.previewDone);
    } catch { toast.error(copy.failed); }
    finally { setBusy(null); }
  };
  const handleCommit = async () => {
    if (!school?.id || !batchKey || eligibleRows.length === 0) return;
    setConfirmOpen(false);
    setBusy("commit");
    setProgress(0);
    const workingRows = [...rows];
    const selectedRowNumbers = new Set(eligibleRows.map(row => row.rowNumber));
    let completed = 0;
    for (let index = 0; index < workingRows.length; index += 1) {
      const row = workingRows[index];
      if (!selectedRowNumbers.has(row.rowNumber) || (row.rowStatus !== "ready" && row.rowStatus !== "delivery_error") || !row.studentId) continue;
      try {
        const relation = String(row.payload.relationship_type) as GuardianRelationshipType;
        await inviteGuardian({
          schoolId: school.id,
          studentId: row.studentId,
          email: String(row.payload.email ?? ""),
          fullName: String(row.payload.guardian_name ?? ""),
          phone: String(row.payload.phone ?? "") || undefined,
          relationshipType: relation,
          isPrimary: String(row.payload.is_primary).toLowerCase() === "true",
          idempotencyKey: `guardian-import-${batchKey}-${row.rowNumber}`,
        });
        workingRows[index] = { ...row, rowStatus: "sent", issues: [] };
      } catch {
        workingRows[index] = {
          ...row,
          rowStatus: "delivery_error",
          issues: [copy.inviteFailed],
        };
      }
      completed += 1;
      setRows([...workingRows]);
      setProgress(completed);
    }
    setBusy(null);
    const anyFailed = workingRows.some(row => row.rowStatus === "delivery_error");
    if (anyFailed) toast.error(copy.sendFailed);
    else toast.success(copy.sentToast);
  };
  const issueLabel = (issue: string) => {
    const keys: Record<string, keyof Copy> = {
      student_not_found: "studentNotFound", student_ambiguous: "studentAmbiguous",
      guardian_name_invalid: "guardianNameInvalid", guardian_email_invalid: "guardianEmailInvalid",
      guardian_phone_invalid: "guardianPhoneInvalid", branch_not_found: "branchNotFound",
      relationship_invalid: "relationshipInvalid", is_primary_invalid: "primaryInvalid",
      duplicate_relationship: "duplicateRelationship", multiple_primary_guardians: "multiplePrimary",
      invite_failed: "inviteFailed",
    };
    const key = keys[issue];
    return key ? copy[key] : issue;
  };
  const statusLabel = (status: GuardianImportRow["rowStatus"]) => {
    if (status === "ready") return copy.ready;
    if (status === "sent") return copy.sent;
    if (status === "duplicate") return copy.duplicate;
    return copy.error;
  };

  if (!school?.id || canImport === null) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-3 p-6 text-sm text-muted-foreground" dir={direction}><RefreshCw className="size-5 animate-spin" />{copy.loading}</div>;
  }
  if (!canImport) {
    return <Card className="mx-auto mt-8 max-w-2xl" dir={direction}><CardContent className="p-6"><h1 className="font-bold">{copy.title}</h1><p className="mt-2 text-sm text-muted-foreground">{copy.noAccess}</p></CardContent></Card>;
  }
  return (
    <div className="space-y-5 p-4 sm:p-6" dir={direction}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-[#173B2D]">{copy.title}</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.subtitle}</p></div>
        <Button variant="outline" className="gap-2" onClick={() => setLocation("/guardians")}><ArrowLeft className={direction === "rtl" ? "rotate-180" : ""} size={17} />{copy.back}</Button>
      </div>
      <Card className="border border-[#0B4738]/15 p-5">
        <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-end">
          <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={() => void handleTemplate()}>{busy === "template" ? <RefreshCw size={17} className="animate-spin" /> : <Download size={17} />}{copy.template}</Button>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-gray-700">{copy.choose}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy !== null} onChange={event => { setFile(event.target.files?.[0] ?? null); setRows([]); setBatchKey(""); setCohortFilter("all"); }} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /></label>
          <Button className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]" disabled={!file || busy !== null} onClick={() => void handlePreview()}>{busy === "preview" ? <RefreshCw size={17} className="animate-spin" /> : <Upload size={17} />}{copy.preview}</Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-amber-800">{copy.security}</p>
      </Card>
      {rows.length > 0 && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[[copy.ready, visibleRows.filter(row => row.rowStatus === "ready").length, "text-emerald-700"], [copy.error, visibleRows.filter(row => row.rowStatus === "error" || row.rowStatus === "delivery_error").length, "text-red-700"], [copy.duplicate, visibleRows.filter(row => row.rowStatus === "duplicate").length, "text-blue-700"], [copy.sent, visibleRows.filter(row => row.rowStatus === "sent").length, "text-[#0B4738]"]].map(([label, value, color]) => <Card key={String(label)} className="p-4 text-center"><div className={`text-2xl font-black ${color}`}>{value}</div><div className="mt-1 text-xs text-gray-500">{label}</div></Card>)}
        </div>
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle className="text-base">{copy.file}: {file?.name}</CardTitle>{busy === "commit" && <CardDescription className="mt-1">{copy.sending} {progress} / {progress + eligibleRows.length}</CardDescription>}</div>
            <label className="text-xs font-semibold text-muted-foreground">{copy.cohort}
              <select value={cohortFilter} onChange={event => setCohortFilter(event.target.value)} className="mt-1 block h-10 min-w-48 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground">
                <option value="all">{copy.allCohorts}</option>
                {cohortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {rows.some(row => row.rowStatus === "error" || row.rowStatus === "duplicate" || row.rowStatus === "delivery_error") && <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={() => downloadGuardianImportErrors(rows)}><Download size={16} />{copy.report}</Button>}
              {eligibleRows.length > 0 && <Button className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]" disabled={busy !== null} onClick={() => setConfirmOpen(true)}><Send size={16} />{copy.send} ({eligibleRows.length})</Button>}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[1080px] text-sm"><thead className="border-y bg-gray-50 text-gray-500"><tr>{[copy.row, copy.student, copy.cohort, copy.guardian, copy.email, copy.branch, copy.relationship, copy.status, copy.issues].map(label => <th key={label} className="px-3 py-3 text-start font-semibold">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">{visibleRows.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{copy.noCohortRows}</td></tr> : visibleRows.map(row => <tr key={row.rowNumber}>
                <td className="px-3 py-3 font-mono">{row.rowNumber}</td>
                <td className="px-3 py-3">{row.studentName ?? String(row.payload.student_name ?? "—")}</td>
                <td className="px-3 py-3">{row.studentClassName ?? "—"}</td>
                <td className="px-3 py-3 font-semibold">{String(row.payload.guardian_name ?? "")}</td>
                <td className="px-3 py-3" dir="ltr">{String(row.payload.email ?? "")}</td>
                <td className="px-3 py-3">{String(row.payload.branch_code ?? "—")}</td>
                <td className="px-3 py-3">{RELATION_LABEL[String(row.payload.relationship_type) as GuardianRelationshipType] ? copy[RELATION_LABEL[String(row.payload.relationship_type) as GuardianRelationshipType]] : String(row.payload.relationship_type ?? "—")}</td>
                <td className="px-3 py-3"><Badge variant={row.rowStatus === "ready" || row.rowStatus === "sent" ? "default" : "secondary"}>{statusLabel(row.rowStatus)}</Badge></td>
                <td className="px-3 py-3 text-gray-600">{row.issues.length ? row.issues.map(issueLabel).join("، ") : "—"}</td>
              </tr>)}</tbody>
            </table>
          </CardContent>
          {rows.length === 0 && <CardFooter>{copy.noRows}</CardFooter>}
        </Card>
      </>}
      <Dialog open={confirmOpen} onOpenChange={open => { if (busy !== "commit") setConfirmOpen(open); }}>
        <DialogContent dir={direction}>
          <DialogHeader><DialogTitle>{copy.confirmTitle}</DialogTitle><DialogDescription>{copy.confirmText}</DialogDescription></DialogHeader>
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{copy.cohort}: {cohortFilter === "all" ? copy.allCohorts : cohortOptions.find(([value]) => value === cohortFilter)?.[1]} · {copy.send} ({eligibleRows.length})</div>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmOpen(false)}>{copy.cancel}</Button><Button className="bg-[#0B4738] text-white hover:bg-[#08382d]" disabled={busy !== null} onClick={() => void handleCommit()}>{copy.confirmSend}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
