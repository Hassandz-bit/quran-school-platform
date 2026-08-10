import { useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  commitStudentImport,
  downloadStudentImportErrors,
  downloadStudentImportTemplate,
  fetchStudentImportBatch,
  listStudentImportRows,
  previewStudentImport,
  rollbackStudentImport,
  type StudentImportBatch,
  type StudentImportRow,
} from "@/lib/student-import";

export default function StudentBulkImport() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"template" | "preview" | "commit" | "rollback" | null>(null);
  const [batch, setBatch] = useState<StudentImportBatch | null>(null);
  const [rows, setRows] = useState<StudentImportRow[]>([]);

  const copy = locale === "ar" ? {
    title: "الاستيراد الجماعي للطلاب",
    subtitle: "ارفع ملف Excel، راجع الأخطاء والتكرارات، ثم اعتمد الصفوف الجاهزة فقط.",
    back: "العودة إلى الطلاب",
    template: "تنزيل نموذج Excel",
    choose: "اختيار ملف .xlsx",
    preview: "فحص ومعاينة",
    commit: "اعتماد الصفوف الجاهزة",
    rollback: "التراجع عن هذه الدفعة",
    report: "تنزيل تقرير الأخطاء",
    file: "الملف",
    total: "الإجمالي",
    ready: "جاهز",
    warning: "تحذير",
    duplicate: "مكرر",
    error: "خطأ",
    created: "تم إنشاؤه",
    row: "الصف",
    student: "الطالب",
    branch: "الفرع",
    class: "الحلقة",
    status: "الحالة",
    issues: "الملاحظات",
    noClass: "بدون حلقة",
    noIssues: "—",
    previewDone: "اكتملت المعاينة. لم يتم إنشاء أي طالب بعد.",
    commitDone: "تم اعتماد الدفعة وإنشاء الطلاب الجاهزين.",
    rollbackDone: "تم التراجع عن الطلاب الذين أنشأتهم هذه الدفعة.",
    failed: "تعذر تنفيذ العملية. راجع الملف والصلاحيات ثم أعد المحاولة.",
    stagedHint: "الرفع وحده لا يغيّر بيانات الطلاب. اضغط اعتماد بعد مراجعة الجدول.",
    rollbackHint: "التراجع يُرفض إذا بدأ استخدام أي طالب مستورد في الحضور أو الحفظ أو المالية أو ربط الأولياء.",
  } : {
    title: "Bulk Student Import",
    subtitle: "Upload an Excel file, review validation and duplicates, then commit only eligible rows.",
    back: "Back to students",
    template: "Download Excel template",
    choose: "Choose .xlsx file",
    preview: "Validate & preview",
    commit: "Commit eligible rows",
    rollback: "Rollback this batch",
    report: "Download issue report",
    file: "File",
    total: "Total",
    ready: "Ready",
    warning: "Warning",
    duplicate: "Duplicate",
    error: "Error",
    created: "Created",
    row: "Row",
    student: "Student",
    branch: "Branch",
    class: "Class",
    status: "Status",
    issues: "Issues",
    noClass: "No class",
    noIssues: "—",
    previewDone: "Preview complete. No student has been created yet.",
    commitDone: "The batch was committed and eligible students were created.",
    rollbackDone: "Students created by this batch were rolled back.",
    failed: "The operation could not be completed. Check the file and permissions, then retry.",
    stagedHint: "Uploading does not change student data. Commit only after reviewing the table.",
    rollbackHint: "Rollback is refused once an imported student has attendance, memorization, finance, guardian links, or receipts.",
  };

  const refresh = async (batchId: string) => {
    const [batchData, rowData] = await Promise.all([
      fetchStudentImportBatch(batchId),
      listStudentImportRows(batchId),
    ]);
    setBatch(batchData);
    setRows(rowData);
  };

  const handleTemplate = async () => {
    if (!school?.id) return;
    setBusy("template");
    try { await downloadStudentImportTemplate(school.id); }
    catch { toast.error(copy.failed); }
    finally { setBusy(null); }
  };

  const handlePreview = async () => {
    if (!school?.id || !file) return;
    setBusy("preview");
    try {
      const batchId = await previewStudentImport(school.id, file);
      await refresh(batchId);
      toast.success(copy.previewDone);
    } catch { toast.error(copy.failed); }
    finally { setBusy(null); }
  };

  const handleCommit = async () => {
    if (!batch) return;
    setBusy("commit");
    try {
      await commitStudentImport(batch.batchId);
      await refresh(batch.batchId);
      toast.success(copy.commitDone);
    } catch { toast.error(copy.failed); }
    finally { setBusy(null); }
  };

  const handleRollback = async () => {
    if (!batch) return;
    setBusy("rollback");
    try {
      await rollbackStudentImport(batch.batchId);
      await refresh(batch.batchId);
      toast.success(copy.rollbackDone);
    } catch { toast.error(copy.failed); }
    finally { setBusy(null); }
  };

  const statusLabel = (status: StudentImportRow["rowStatus"]) => ({
    ready: copy.ready, warning: copy.warning, duplicate: copy.duplicate,
    error: copy.error, created: copy.created,
  })[status];

  const issueLabel = (issue: string) => {
    if (locale !== "ar") return issue.replaceAll("_", " ");
    const labels: Record<string, string> = {
      branch_not_found: "رمز الفرع غير موجود",
      branch_permission_denied: "لا توجد صلاحية على الفرع",
      class_not_found: "رمز الحلقة غير موجود في الفرع",
      class_unassigned: "لم تحدد حلقة",
      first_name_invalid: "الاسم غير صالح",
      last_name_invalid: "اللقب غير صالح",
      birth_date_invalid: "تاريخ الميلاد غير صالح",
      gender_invalid: "الجنس غير صالح",
      guardian_name_invalid: "اسم الولي غير صالح",
      guardian_relation_invalid: "صلة الولي غير صالحة",
      guardian_phone_invalid: "هاتف الولي غير صالح",
      duplicate_student: "طالب مكرر",
      duplicate_detected_at_commit: "ظهر تكرار قبل الاعتماد",
      branch_permission_changed: "تغيرت صلاحية الفرع",
      class_changed: "الحلقة لم تعد متاحة",
    };
    return labels[issue] ?? issue;
  };

  return (
    <div className="space-y-6" dir={direction}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#173B2D]">{copy.title}</h1>
          <p className="mt-1 text-sm leading-6 text-gray-600">{copy.subtitle}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setLocation("/students")}>
          <ArrowLeft size={17} className={direction === "rtl" ? "rotate-180" : ""} /> {copy.back}
        </Button>
      </div>

      <Card className="border border-[#0B4738]/15 p-5">
        <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-end">
          <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={() => void handleTemplate()}>
            {busy === "template" ? <RefreshCw size={17} className="animate-spin" /> : <Download size={17} />}
            {copy.template}
          </Button>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">{copy.choose}</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={event => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
          </label>
          <Button className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]" disabled={!file || busy !== null} onClick={() => void handlePreview()}>
            {busy === "preview" ? <RefreshCw size={17} className="animate-spin" /> : <Upload size={17} />}
            {copy.preview}
          </Button>
        </div>
        <p className="mt-3 text-xs text-gray-500">{copy.stagedHint}</p>
      </Card>

      {batch && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              [copy.total, batch.totalCount, "text-gray-800"], [copy.ready, batch.readyCount, "text-emerald-700"],
              [copy.warning, batch.warningCount, "text-amber-700"], [copy.duplicate, batch.duplicateCount, "text-blue-700"],
              [copy.error, batch.errorCount, "text-red-700"], [copy.created, batch.createdCount, "text-[#0B4738]"],
            ].map(([label, value, style]) => (
              <Card key={String(label)} className="p-4 text-center"><div className={`text-2xl font-black ${style}`}>{value}</div><div className="mt-1 text-xs text-gray-500">{label}</div></Card>
            ))}
          </div>

          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-600"><strong>{copy.file}:</strong> {batch.fileName}</div>
              <div className="flex flex-wrap gap-2">
                {rows.some(row => row.rowStatus === "warning" || row.rowStatus === "duplicate" || row.rowStatus === "error") && (
                  <Button variant="outline" className="gap-2" onClick={() => downloadStudentImportErrors(rows)}><Download size={16} />{copy.report}</Button>
                )}
                {batch.status === "staged" && (
                  <Button className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]" disabled={busy !== null || batch.readyCount + batch.warningCount === 0} onClick={() => void handleCommit()}>
                    {busy === "commit" ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}{copy.commit}
                  </Button>
                )}
                {batch.status === "committed" && batch.createdCount > 0 && (
                  <Button variant="destructive" className="gap-2" disabled={busy !== null} onClick={() => void handleRollback()}>
                    {busy === "rollback" ? <RefreshCw size={16} className="animate-spin" /> : <RotateCcw size={16} />}{copy.rollback}
                  </Button>
                )}
              </div>
            </div>
            {batch.status === "committed" && <p className="mt-3 text-xs text-amber-700">{copy.rollbackHint}</p>}
          </Card>

          <Card className="overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b bg-gray-50 text-gray-500"><tr>
                  {[copy.row, copy.student, copy.branch, copy.class, copy.status, copy.issues].map(label => <th key={label} className="px-4 py-3 text-start font-semibold">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(row => <tr key={row.rowNumber}>
                    <td className="px-4 py-3 font-mono">{row.rowNumber}</td>
                    <td className="px-4 py-3 font-semibold">{String(row.payload.first_name ?? "")} {String(row.payload.last_name ?? "")}</td>
                    <td className="px-4 py-3">{String(row.payload.branch_code ?? "—")}</td>
                    <td className="px-4 py-3">{String(row.payload.class_code ?? copy.noClass) || copy.noClass}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold">{statusLabel(row.rowStatus)}</span></td>
                    <td className="px-4 py-3 text-gray-600">{row.issues.length ? row.issues.map(issueLabel).join("، ") : copy.noIssues}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
