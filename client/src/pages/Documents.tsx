import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
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
  downloadDocument,
  fetchDocumentsAccess,
  listDocumentRecords,
  listDocumentSubjects,
  updateDocumentStatus,
  uploadDocument,
  validateDocumentFile,
  type DocumentCategory,
  type DocumentRecord,
  type DocumentStatus,
  type DocumentSubject,
  type DocumentSubjectType,
  type DocumentsAccess,
} from "@/lib/documents";

const CATEGORIES: DocumentCategory[] = [
  "birth_certificate",
  "personal_photos",
  "medical_report",
  "previous_certificate",
  "guardian_identity",
  "registration_form",
  "other",
];

const EMPTY_ACCESS: DocumentsAccess = { canView: false, canManage: false };

export default function Documents() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const ar = locale === "ar";
  const [access, setAccess] = useState<DocumentsAccess>(EMPTY_ACCESS);
  const [subjects, setSubjects] = useState<DocumentSubject[]>([]);
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<DocumentSubjectType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [statusRecord, setStatusRecord] = useState<DocumentRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [uploadSubjectKey, setUploadSubjectKey] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("birth_certificate");
  const [customLabel, setCustomLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [notes, setNotes] = useState("");
  const [nextStatus, setNextStatus] = useState<Exclude<DocumentStatus, "missing">>("verified");
  const [statusExpiresOn, setStatusExpiresOn] = useState("");
  const [statusNotes, setStatusNotes] = useState("");

  const copy = ar
    ? {
        title: "إدارة الوثائق",
        subtitle: "وثائق خاصة للطلاب وطلبات التسجيل، محفوظة بصلاحيات الفرع فقط.",
        refresh: "تحديث",
        upload: "رفع وثيقة",
        total: "إجمالي الملفات",
        verified: "موثقة",
        attention: "تحتاج متابعة",
        expiring: "منتهية / قريبة",
        search: "بحث بالاسم أو الملف أو الفرع...",
        allSubjects: "كل الملفات",
        students: "الطلاب",
        leads: "طلبات التسجيل",
        allStatuses: "كل الحالات",
        empty: "لا توجد وثائق مطابقة.",
        missing: "ناقصة",
        uploaded: "مرفوعة",
        statusVerified: "موثقة",
        rejected: "مرفوضة",
        expired: "منتهية",
        guardian: "ولي الأمر",
        file: "الملف",
        noFile: "لم يرفع ملف بعد",
        expiry: "الصلاحية",
        noExpiry: "بدون تاريخ انتهاء",
        download: "تنزيل",
        update: "تحديث الحالة",
        uploadTitle: "رفع أو استبدال وثيقة",
        uploadDescription: "الملف يبقى داخل التخزين الخاص ولا يُنشأ له رابط عام.",
        subject: "صاحب الوثيقة",
        category: "نوع الوثيقة",
        otherLabel: "اسم الوثيقة الأخرى",
        chooseFile: "اختر PDF أو صورة بحد أقصى 10MB",
        issuedOn: "تاريخ الإصدار (اختياري)",
        expiresOn: "تاريخ الانتهاء (اختياري)",
        notes: "ملاحظات",
        saveUpload: "رفع وحفظ",
        saving: "جارٍ الحفظ...",
        cancel: "إلغاء",
        statusTitle: "تحديث حالة الوثيقة",
        status: "الحالة",
        saveStatus: "حفظ الحالة",
        loadError: "تعذر تحميل مركز الوثائق.",
        uploadSuccess: "تم حفظ الوثيقة بأمان.",
        statusSuccess: "تم تحديث حالة الوثيقة.",
        actionError: "تعذر تنفيذ العملية حاليًا.",
        invalidFile: "اختر ملفًا صالحًا أولًا.",
        required: "أكمل الحقول المطلوبة.",
      }
    : {
        title: "Document Management",
        subtitle: "Private student and registration documents scoped to authorized branches.",
        refresh: "Refresh",
        upload: "Upload document",
        total: "Total files",
        verified: "Verified",
        attention: "Needs attention",
        expiring: "Expired / near expiry",
        search: "Search name, file, or branch...",
        allSubjects: "All documents",
        students: "Students",
        leads: "Registration leads",
        allStatuses: "All statuses",
        empty: "No matching documents.",
        missing: "Missing",
        uploaded: "Uploaded",
        statusVerified: "Verified",
        rejected: "Rejected",
        expired: "Expired",
        guardian: "Guardian",
        file: "File",
        noFile: "No file uploaded yet",
        expiry: "Expiry",
        noExpiry: "No expiry",
        download: "Download",
        update: "Update status",
        uploadTitle: "Upload or replace document",
        uploadDescription: "The file stays in private storage and never receives a public URL.",
        subject: "Document subject",
        category: "Document type",
        otherLabel: "Other document label",
        chooseFile: "Choose PDF or image, maximum 10MB",
        issuedOn: "Issue date (optional)",
        expiresOn: "Expiry date (optional)",
        notes: "Notes",
        saveUpload: "Upload and save",
        saving: "Saving...",
        cancel: "Cancel",
        statusTitle: "Update document status",
        status: "Status",
        saveStatus: "Save status",
        loadError: "Document center could not be loaded.",
        uploadSuccess: "Document saved securely.",
        statusSuccess: "Document status updated.",
        actionError: "The operation could not be completed.",
        invalidFile: "Choose a valid file first.",
        required: "Complete the required fields.",
      };

  const categoryLabel = useCallback((value: DocumentCategory) => {
    const labels: Record<DocumentCategory, [string, string]> = {
      birth_certificate: ["شهادة الميلاد", "Birth certificate"],
      personal_photos: ["صور شخصية", "Personal photos"],
      medical_report: ["تقرير طبي", "Medical report"],
      previous_certificate: ["شهادة مدرسية سابقة", "Previous certificate"],
      guardian_identity: ["هوية ولي الأمر", "Guardian identity"],
      registration_form: ["استمارة التسجيل", "Registration form"],
      other: ["وثيقة أخرى", "Other document"],
    };
    return labels[value][ar ? 0 : 1];
  }, [ar]);

  const statusLabel = useCallback((value: DocumentStatus) => {
    const labels: Record<DocumentStatus, string> = {
      missing: copy.missing,
      uploaded: copy.uploaded,
      verified: copy.statusVerified,
      rejected: copy.rejected,
      expired: copy.expired,
    };
    return labels[value];
  }, [copy.expired, copy.missing, copy.rejected, copy.statusVerified, copy.uploaded]);

  const subjectKey = (subject: Pick<DocumentSubject, "subjectType" | "subjectId">) => `${subject.subjectType}:${subject.subjectId}`;

  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const nextAccess = await fetchDocumentsAccess(school.id);
      setAccess(nextAccess);
      if (!nextAccess.canView) {
        setSubjects([]);
        setRecords([]);
        return;
      }
      const [nextSubjects, nextRecords] = await Promise.all([
        listDocumentSubjects(school.id),
        listDocumentRecords(school.id),
      ]);
      setSubjects(nextSubjects);
      setRecords(nextRecords);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSubject = subjects.find(subject => subjectKey(subject) === selectedSubjectKey) ?? null;
  const manageableSubjects = subjects.filter(subject => subject.canManage);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return records.filter(record => {
      if (subjectTypeFilter !== "all" && record.subjectType !== subjectTypeFilter) return false;
      if (selectedSubject && (record.subjectType !== selectedSubject.subjectType || record.subjectId !== selectedSubject.subjectId)) return false;
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (!needle) return true;
      return [record.subjectName, record.branchName, record.originalFileName ?? "", record.customLabel ?? "", categoryLabel(record.category)]
        .some(value => value.toLocaleLowerCase(locale).includes(needle));
    });
  }, [categoryLabel, locale, query, records, selectedSubject, statusFilter, subjectTypeFilter]);

  const today = new Date();
  const nearExpiry = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const verifiedCount = records.filter(record => record.status === "verified").length;
  const attentionCount = records.filter(record => ["missing", "rejected"].includes(record.status)).length;
  const expiryCount = records.filter(record => {
    if (record.status === "expired") return true;
    if (!record.expiresOn) return false;
    const expiry = new Date(`${record.expiresOn}T23:59:59`);
    return expiry <= nearExpiry;
  }).length;

  const resetUpload = () => {
    setUploadSubjectKey(manageableSubjects.length === 1 ? subjectKey(manageableSubjects[0]) : "");
    setCategory("birth_certificate");
    setCustomLabel("");
    setFile(null);
    setIssuedOn("");
    setExpiresOn("");
    setNotes("");
  };

  const openUpload = (subject?: DocumentSubject | null) => {
    resetUpload();
    if (subject?.canManage) setUploadSubjectKey(subjectKey(subject));
    setUploadOpen(true);
  };

  const submitUpload = async () => {
    if (!school?.id || !uploadSubjectKey || !file || (category === "other" && !customLabel.trim())) {
      toast.error(copy.required);
      return;
    }
    const fileError = validateDocumentFile(file);
    if (fileError) {
      toast.error(fileError);
      return;
    }
    const subject = manageableSubjects.find(item => subjectKey(item) === uploadSubjectKey);
    if (!subject) {
      toast.error(copy.required);
      return;
    }

    setSubmitting(true);
    try {
      await uploadDocument({
        schoolId: school.id,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        category,
        customLabel: category === "other" ? customLabel : null,
        notes: notes || null,
        issuedOn: issuedOn || null,
        expiresOn: expiresOn || null,
        file,
      });
      toast.success(copy.uploadSuccess);
      setUploadOpen(false);
      resetUpload();
      await load();
    } catch (error) {
      toast.error(error instanceof Error && error.message.startsWith("ال") ? error.message : copy.actionError);
    } finally {
      setSubmitting(false);
    }
  };

  const openStatus = (record: DocumentRecord) => {
    setStatusRecord(record);
    setNextStatus(record.status === "missing" ? "uploaded" : record.status);
    setStatusExpiresOn(record.expiresOn ?? "");
    setStatusNotes(record.notes ?? "");
  };

  const submitStatus = async () => {
    if (!statusRecord) return;
    setSubmitting(true);
    try {
      await updateDocumentStatus({
        documentId: statusRecord.documentId,
        status: nextStatus,
        expiresOn: statusExpiresOn || null,
        notes: statusNotes || null,
      });
      toast.success(copy.statusSuccess);
      setStatusRecord(null);
      await load();
    } catch {
      toast.error(copy.actionError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (record: DocumentRecord) => {
    if (!record.objectPath) return;
    try {
      const blob = await downloadDocument(record.objectPath);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.originalFileName || "document";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(copy.actionError);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-3" dir={direction}><RefreshCw className="size-5 animate-spin text-[#17663B]" /><span>{ar ? "جارٍ تحميل الوثائق..." : "Loading documents..."}</span></div>;
  }

  return (
    <div className="space-y-5 p-4 sm:p-6" dir={direction}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#173B2D]"><FileText className="size-6 text-[#17663B]" />{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="size-4" />{copy.refresh}</Button>
          {access.canManage && manageableSubjects.length > 0 && <Button className="bg-[#0B4738] hover:bg-[#0B4738]/90" onClick={() => openUpload(selectedSubject)}><Upload className="size-4" />{copy.upload}</Button>}
        </div>
      </div>

      {loadError && <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-sm text-red-800">{copy.loadError}</CardContent></Card>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.total}</div><div className="mt-1 text-2xl font-bold">{records.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.verified}</div><div className="mt-1 text-2xl font-bold text-[#17663B]">{verifiedCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.attention}</div><div className="mt-1 text-2xl font-bold text-amber-700">{attentionCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{copy.expiring}</div><div className="mt-1 text-2xl font-bold text-red-700">{expiryCount}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{copy.title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2"><Search className={`absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ${ar ? "right-3" : "left-3"}`} /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} className={ar ? "pr-9" : "pl-9"} /></div>
            <Select value={subjectTypeFilter} onValueChange={value => { setSubjectTypeFilter(value as DocumentSubjectType | "all"); setSelectedSubjectKey("all"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{copy.allSubjects}</SelectItem><SelectItem value="student">{copy.students}</SelectItem><SelectItem value="registration_lead">{copy.leads}</SelectItem></SelectContent></Select>
            <Select value={statusFilter} onValueChange={value => setStatusFilter(value as DocumentStatus | "all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{copy.allStatuses}</SelectItem>{(["missing", "uploaded", "verified", "rejected", "expired"] as DocumentStatus[]).map(value => <SelectItem key={value} value={value}>{statusLabel(value)}</SelectItem>)}</SelectContent></Select>
          </div>

          <Select value={selectedSubjectKey} onValueChange={setSelectedSubjectKey}>
            <SelectTrigger><SelectValue placeholder={copy.subject} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{copy.allSubjects}</SelectItem>{subjects.filter(subject => subjectTypeFilter === "all" || subject.subjectType === subjectTypeFilter).map(subject => <SelectItem key={subjectKey(subject)} value={subjectKey(subject)}>{subject.subjectName} — {subject.branchName} ({subject.subjectType === "student" ? copy.students : copy.leads})</SelectItem>)}</SelectContent>
          </Select>

          {filtered.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{copy.empty}</div> : filtered.map(record => (
            <div key={record.documentId} className="rounded-xl border bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-[#173B2D]">{record.subjectName}</span><Badge variant="secondary">{record.branchName}</Badge><Badge variant={record.status === "verified" ? "default" : record.status === "rejected" || record.status === "expired" ? "destructive" : "outline"}>{statusLabel(record.status)}</Badge></div>
                  <div className="text-sm font-medium">{record.customLabel || categoryLabel(record.category)}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{copy.file}: {record.originalFileName || copy.noFile}</span><span>{formatSize(record.sizeBytes)}</span><span>{copy.expiry}: {record.expiresOn || copy.noExpiry}</span></div>
                  {record.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{record.notes}</p>}
                  {record.verifiedByName && <div className="flex items-center gap-1 text-xs text-[#17663B]"><ShieldCheck className="size-4" />{record.verifiedByName}</div>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {record.objectPath && <Button variant="outline" onClick={() => void handleDownload(record)}><Download className="size-4" />{copy.download}</Button>}
                  {record.canManage && record.objectPath && <Button variant="outline" onClick={() => openStatus(record)}>{copy.update}</Button>}
                  {record.canManage && <Button onClick={() => openUpload(subjects.find(subject => subject.subjectType === record.subjectType && subject.subjectId === record.subjectId))} className="bg-[#0B4738] hover:bg-[#0B4738]/90"><Upload className="size-4" />{copy.upload}</Button>}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={open => { setUploadOpen(open); if (!open) resetUpload(); }}>
        <DialogContent dir={direction} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className={ar ? "text-right" : "text-left"}><DialogTitle>{copy.uploadTitle}</DialogTitle><DialogDescription>{copy.uploadDescription}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>{copy.subject}</Label><Select value={uploadSubjectKey} onValueChange={setUploadSubjectKey}><SelectTrigger><SelectValue placeholder={copy.subject} /></SelectTrigger><SelectContent>{manageableSubjects.map(subject => <SelectItem key={subjectKey(subject)} value={subjectKey(subject)}>{subject.subjectName} — {subject.branchName} ({subject.subjectType === "student" ? copy.students : copy.leads})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{copy.category}</Label><Select value={category} onValueChange={value => setCategory(value as DocumentCategory)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(value => <SelectItem key={value} value={value}>{categoryLabel(value)}</SelectItem>)}</SelectContent></Select></div>
            {category === "other" && <div className="space-y-2"><Label htmlFor="document-custom-label">{copy.otherLabel}</Label><Input id="document-custom-label" value={customLabel} onChange={event => setCustomLabel(event.target.value)} maxLength={120} /></div>}
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="document-file">{copy.file}</Label><Input id="document-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">{copy.chooseFile}</p></div>
            <div className="space-y-2"><Label htmlFor="document-issued">{copy.issuedOn}</Label><Input id="document-issued" type="date" value={issuedOn} onChange={event => setIssuedOn(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="document-expires">{copy.expiresOn}</Label><Input id="document-expires" type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="document-notes">{copy.notes}</Label><textarea id="document-notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={4} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={() => void submitUpload()} disabled={submitting || !file || !uploadSubjectKey} className="bg-[#0B4738] hover:bg-[#0B4738]/90">{submitting ? copy.saving : copy.saveUpload}</Button><Button variant="outline" onClick={() => setUploadOpen(false)} disabled={submitting}>{copy.cancel}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(statusRecord)} onOpenChange={open => { if (!open) setStatusRecord(null); }}>
        <DialogContent dir={direction} className="sm:max-w-lg">
          <DialogHeader className={ar ? "text-right" : "text-left"}><DialogTitle>{copy.statusTitle}</DialogTitle><DialogDescription>{statusRecord ? `${statusRecord.subjectName} — ${statusRecord.customLabel || categoryLabel(statusRecord.category)}` : ""}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>{copy.status}</Label><Select value={nextStatus} onValueChange={value => setNextStatus(value as Exclude<DocumentStatus, "missing">)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="uploaded">{copy.uploaded}</SelectItem><SelectItem value="verified"><span className="flex items-center gap-1"><CheckCircle2 className="size-4" />{copy.statusVerified}</span></SelectItem><SelectItem value="rejected"><span className="flex items-center gap-1"><AlertTriangle className="size-4" />{copy.rejected}</span></SelectItem><SelectItem value="expired">{copy.expired}</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="document-status-expiry">{copy.expiresOn}</Label><Input id="document-status-expiry" type="date" value={statusExpiresOn} onChange={event => setStatusExpiresOn(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="document-status-notes">{copy.notes}</Label><textarea id="document-status-notes" value={statusNotes} onChange={event => setStatusNotes(event.target.value)} maxLength={2000} rows={4} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={() => void submitStatus()} disabled={submitting} className="bg-[#0B4738] hover:bg-[#0B4738]/90">{submitting ? copy.saving : copy.saveStatus}</Button><Button variant="outline" onClick={() => setStatusRecord(null)} disabled={submitting}>{copy.cancel}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
