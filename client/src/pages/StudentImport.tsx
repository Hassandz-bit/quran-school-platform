import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  History,
  RefreshCw,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  commitStudentImport,
  downloadStudentImportIssues,
  downloadStudentImportTemplate,
  fetchStudentImportLookups,
  getStudentImportFileErrorMessage,
  listStudentImportBatches,
  parseStudentImportFile,
  previewStudentImport,
  rollbackStudentImport,
  translateStudentImportIssue,
  translateStudentImportStatus,
  type ParsedStudentImportRow,
  type StudentImportBatch,
  type StudentImportLookup,
  type StudentImportPreview,
  type StudentImportPreviewRow,
} from "@/lib/student-import";

const EMPTY_LOOKUPS: StudentImportLookup = { branches: [], classes: [] };

export default function StudentImport() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lookups, setLookups] = useState<StudentImportLookup>(EMPTY_LOOKUPS);
  const [history, setHistory] = useState<StudentImportBatch[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStudentImportRow[]>([]);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [rollingBackBatchId, setRollingBackBatchId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const copy = locale === "ar"
    ? {
        title: "استيراد الطلاب من Excel",
        subtitle: "استورد حتى 2000 طالب في دفعة واحدة بعد معاينة الأخطاء والتكرارات، دون كتابة أي بيانات قبل التأكيد.",
        template: "تنزيل نموذج Excel الرسمي",
        templateHint: "النموذج يحتوي أوراق STUDENTS وEXAMPLE وLOOKUPS وINSTRUCTIONS مع رموز الفروع والحلقات الحالية.",
        choose: "اختيار ملف Excel",
        dropTitle: "اسحب ملف Excel هنا أو اضغط للاختيار",
        dropHint: "XLSX / XLS / CSV — بحد أقصى 5MB و2000 طالب",
        parsing: "جارٍ قراءة الملف والتحقق من البيانات...",
        file: "الملف",
        rows: "صفوف البيانات",
        ready: "جاهز",
        warning: "تحذير",
        duplicate: "مكرر",
        error: "خطأ",
        previewTitle: "معاينة قبل الاعتماد",
        previewHint: "الصفوف الجاهزة وصفوف التحذير فقط ستُضاف. المكررات والأخطاء ستُتجاوز تلقائيًا.",
        row: "صف Excel",
        student: "الطالب",
        branchClass: "الفرع / الحلقة",
        status: "الحالة",
        issues: "الملاحظات",
        noIssues: "لا توجد ملاحظات",
        moreRows: "يعرض الجدول أول 250 صفًا فقط؛ نتيجة الاعتماد تشمل جميع الصفوف.",
        downloadIssues: "تنزيل ملف الأخطاء والملاحظات",
        commit: "اعتماد الاستيراد",
        committing: "جارٍ اعتماد الاستيراد...",
        nothingToImport: "لا توجد صفوف صالحة للاستيراد.",
        commitConfirm: "سيتم إنشاء الطلاب الجاهزين وصفوف التحذير فقط. هل تريد المتابعة؟",
        importDone: "اكتملت دفعة الاستيراد",
        imported: "تمت الإضافة",
        skippedDuplicates: "مكررات",
        skippedErrors: "أخطاء",
        history: "سجل دفعات الاستيراد",
        historyHint: "يمكن التراجع خلال 24 ساعة عن الطلاب الذين أنشأتهم الدفعة ولم تُربط بهم سجلات لاحقة.",
        filename: "الملف",
        createdBy: "نفذ بواسطة",
        date: "التاريخ",
        result: "النتيجة",
        action: "الإجراء",
        rollback: "تراجع آمن",
        rollbackConfirm: "سيُحذف فقط الطلاب الذين أنشأتهم هذه الدفعة ولم تُسجل لهم بيانات لاحقة. هل تريد المتابعة؟",
        rollbackDone: "اكتمل التراجع الآمن.",
        rollbackBlocked: "طلاب تعذر حذفهم لأن لديهم تعديلات أو سجلات لاحقة",
        rolledBack: "متراجع عنها",
        partial: "تراجع جزئي",
        completed: "مكتملة",
        noHistory: "لا توجد دفعات استيراد سابقة.",
        loadError: "تعذر تحميل بيانات الاستيراد حاليًا.",
        retry: "إعادة المحاولة",
        serverError: "تعذر التحقق من ملف الاستيراد أو اعتماده حاليًا.",
        templateError: "تعذر تجهيز نموذج Excel حاليًا.",
        issueFileError: "تعذر تجهيز ملف الأخطاء حاليًا.",
        reset: "اختيار ملف آخر",
        warningNote: "راجع صفوف التحذير قبل الاعتماد؛ هي ليست مكررات مؤكدة.",
      }
    : {
        title: "Import Students from Excel",
        subtitle: "Import up to 2,000 students in one batch after validating errors and duplicates, with no database writes before confirmation.",
        template: "Download official Excel template",
        templateHint: "The template includes STUDENTS, EXAMPLE, LOOKUPS and INSTRUCTIONS sheets with current branch and class codes.",
        choose: "Choose Excel file",
        dropTitle: "Drop an Excel file here or click to choose",
        dropHint: "XLSX / XLS / CSV — maximum 5MB and 2,000 students",
        parsing: "Reading and validating the spreadsheet...",
        file: "File",
        rows: "Data rows",
        ready: "Ready",
        warning: "Warning",
        duplicate: "Duplicate",
        error: "Error",
        previewTitle: "Preview before commit",
        previewHint: "Only ready and warning rows will be created. Duplicates and errors are skipped automatically.",
        row: "Excel row",
        student: "Student",
        branchClass: "Branch / class",
        status: "Status",
        issues: "Issues",
        noIssues: "No issues",
        moreRows: "The table shows the first 250 rows; commit results cover the complete file.",
        downloadIssues: "Download issues file",
        commit: "Commit import",
        committing: "Committing import...",
        nothingToImport: "There are no valid rows to import.",
        commitConfirm: "Only ready and warning rows will be created. Continue?",
        importDone: "Import batch completed",
        imported: "Imported",
        skippedDuplicates: "Duplicates",
        skippedErrors: "Errors",
        history: "Import batch history",
        historyHint: "Within 24 hours, you can safely roll back students created by a batch if no later records depend on them.",
        filename: "File",
        createdBy: "Created by",
        date: "Date",
        result: "Result",
        action: "Action",
        rollback: "Safe rollback",
        rollbackConfirm: "Only students created by this batch with no later dependent records will be deleted. Continue?",
        rollbackDone: "Safe rollback completed.",
        rollbackBlocked: "Students kept because they have later changes or dependent records",
        rolledBack: "Rolled back",
        partial: "Partial rollback",
        completed: "Completed",
        noHistory: "No previous import batches.",
        loadError: "Import data could not be loaded right now.",
        retry: "Try again",
        serverError: "The import file could not be validated or committed right now.",
        templateError: "The Excel template could not be prepared right now.",
        issueFileError: "The issues file could not be prepared right now.",
        reset: "Choose another file",
        warningNote: "Review warning rows before commit; they are not confirmed duplicates.",
      };

  const loadWorkspace = useCallback(async () => {
    if (!school?.id) {
      setLoadError(true);
      setIsBootLoading(false);
      return;
    }
    setIsBootLoading(true);
    setLoadError(false);
    try {
      const [lookupRows, batches] = await Promise.all([
        fetchStudentImportLookups(school.id),
        listStudentImportBatches(school.id),
      ]);
      setLookups(lookupRows);
      setHistory(batches);
    } catch {
      setLoadError(true);
    } finally {
      setIsBootLoading(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const branchById = useMemo(
    () => new Map(lookups.branches.map(branch => [branch.id, branch])),
    [lookups.branches]
  );
  const classById = useMemo(
    () => new Map(lookups.classes.map(classItem => [classItem.id, classItem])),
    [lookups.classes]
  );
  const parsedBySourceRow = useMemo(
    () => new Map(parsedRows.map(item => [item.row.row_number, item.row])),
    [parsedRows]
  );

  const resetFile = () => {
    setSelectedFile(null);
    setParsedRows([]);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processFile = async (file: File | null) => {
    if (!file || !school?.id) return;
    setIsParsing(true);
    setSelectedFile(file);
    setParsedRows([]);
    setPreview(null);
    try {
      const parsed = await parseStudentImportFile(file);
      const validation = await previewStudentImport(school.id, parsed);
      setParsedRows(parsed);
      setPreview(validation);
    } catch (error) {
      resetFile();
      const fileMessage = getStudentImportFileErrorMessage(error, locale);
      if (error instanceof Error && error.name === "StudentImportFileError") {
        toast.error(fileMessage);
      } else {
        toast.error(copy.serverError);
      }
    } finally {
      setIsParsing(false);
    }
  };

  const downloadTemplate = async () => {
    setIsDownloading(true);
    try {
      await downloadStudentImportTemplate(lookups, locale);
    } catch {
      toast.error(copy.templateError);
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadIssues = async () => {
    if (!preview || parsedRows.length === 0) return;
    setIsDownloading(true);
    try {
      await downloadStudentImportIssues(parsedRows, preview, locale);
    } catch {
      toast.error(copy.issueFileError);
    } finally {
      setIsDownloading(false);
    }
  };

  const commitImport = async () => {
    if (!school?.id || !selectedFile || !preview || parsedRows.length === 0) return;
    if (preview.ready + preview.warning === 0) {
      toast.error(copy.nothingToImport);
      return;
    }
    if (!window.confirm(copy.commitConfirm)) return;

    setIsCommitting(true);
    try {
      const result = await commitStudentImport(school.id, selectedFile.name, parsedRows);
      toast.success(
        `${copy.importDone}: ${copy.imported} ${result.importedRows}، ${copy.skippedDuplicates} ${result.duplicateRows}، ${copy.skippedErrors} ${result.errorRows}`
      );
      resetFile();
      await loadWorkspace();
    } catch {
      toast.error(copy.serverError);
    } finally {
      setIsCommitting(false);
    }
  };

  const rollbackBatch = async (batch: StudentImportBatch) => {
    if (!batch.canRollback || !window.confirm(copy.rollbackConfirm)) return;
    setRollingBackBatchId(batch.batchId);
    try {
      const result = await rollbackStudentImport(batch.batchId);
      if (result.blockedStudents > 0) {
        toast.warning(
          `${copy.rollbackDone} ${copy.rollbackBlocked}: ${result.blockedStudents}.`
        );
      } else {
        toast.success(`${copy.rollbackDone} ${result.rolledBackStudents}`);
      }
      await loadWorkspace();
    } catch {
      toast.error(copy.serverError);
    } finally {
      setRollingBackBatchId(null);
    }
  };

  const statusClass = (status: StudentImportPreviewRow["status"]) => {
    if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
    if (status === "duplicate") return "border-blue-200 bg-blue-50 text-blue-700";
    return "border-red-200 bg-red-50 text-red-700";
  };

  const batchStatusLabel = (batch: StudentImportBatch) => {
    if (batch.status === "rolled_back") return copy.rolledBack;
    if (batch.status === "rollback_partial") return copy.partial;
    return copy.completed;
  };

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  if (isBootLoading) {
    return (
      <Card className="p-10 text-center text-gray-500" dir={direction}>
        <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
        {copy.parsing}
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="p-10 text-center" dir={direction}>
        <p className="text-red-700">{copy.loadError}</p>
        <Button className="mt-4 gap-2" variant="outline" onClick={() => void loadWorkspace()}>
          <RefreshCw size={16} /> {copy.retry}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6" dir={direction}>
      <header>
        <h1 className="text-2xl font-black text-[#173B2D]">{copy.title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{copy.subtitle}</p>
      </header>

      <Card className="border border-[#C8A26A]/30 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold text-[#173B2D]">
              <FileSpreadsheet size={20} /> {copy.template}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">{copy.templateHint}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isDownloading}
            onClick={() => void downloadTemplate()}
            className="min-h-11 shrink-0 gap-2 border-[#0B4738]/30 text-[#0B4738]"
          >
            {isDownloading ? <RefreshCw size={17} className="animate-spin" /> : <Download size={17} />}
            {copy.template}
          </Button>
        </div>
      </Card>

      {!selectedFile && (
        <Card
          className="cursor-pointer border-2 border-dashed border-[#0B4738]/30 p-8 text-center transition hover:border-[#0B4738]/60 hover:bg-[#F7F8F3]"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            void processFile(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <Upload className="mx-auto mb-3 text-[#0B4738]" size={34} />
          <p className="font-bold text-[#173B2D]">{copy.dropTitle}</p>
          <p className="mt-2 text-sm text-gray-500">{copy.dropHint}</p>
          <Button type="button" className="mt-5 gap-2 bg-[#0B4738] text-white" onClick={event => {
            event.stopPropagation();
            fileInputRef.current?.click();
          }}>
            <FileSpreadsheet size={17} /> {copy.choose}
          </Button>
        </Card>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        onChange={event => void processFile(event.target.files?.[0] ?? null)}
      />

      {isParsing && (
        <Card className="p-8 text-center text-gray-600">
          <RefreshCw className="mx-auto mb-3 animate-spin text-[#0B4738]" size={28} />
          {copy.parsing}
        </Card>
      )}

      {selectedFile && preview && !isParsing && (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-bold text-[#173B2D]">{copy.file}: {selectedFile.name}</p>
                <p className="mt-1 text-sm text-gray-500">{copy.rows}: {parsedRows.length}</p>
              </div>
              <Button type="button" variant="outline" onClick={resetFile} className="gap-2">
                <RefreshCw size={16} /> {copy.reset}
              </Button>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { key: "ready", label: copy.ready, value: preview.ready, icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
              { key: "warning", label: copy.warning, value: preview.warning, icon: AlertTriangle, className: "border-amber-200 bg-amber-50 text-amber-800" },
              { key: "duplicate", label: copy.duplicate, value: preview.duplicate, icon: FileSpreadsheet, className: "border-blue-200 bg-blue-50 text-blue-800" },
              { key: "error", label: copy.error, value: preview.error, icon: XCircle, className: "border-red-200 bg-red-50 text-red-800" },
            ].map(item => (
              <Card key={item.key} className={`border p-4 ${item.className}`}>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-3xl font-black">{item.value}</p></div>
                  <item.icon size={28} />
                </div>
              </Card>
            ))}
          </div>

          {preview.warning > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
              <AlertTriangle className="me-2 inline" size={18} /> {copy.warningNote}
            </div>
          )}

          <Card className="overflow-hidden border border-gray-100">
            <div className="border-b bg-gray-50 px-5 py-4">
              <h2 className="font-bold text-[#173B2D]">{copy.previewTitle}</h2>
              <p className="mt-1 text-sm text-gray-500">{copy.previewHint}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-sm">
                <thead className="border-b bg-white text-gray-500">
                  <tr>
                    {[copy.row, copy.student, copy.branchClass, copy.status, copy.issues].map(label => (
                      <th key={label} className="px-4 py-3 text-start font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rows.slice(0, 250).map(result => {
                    const source = parsedBySourceRow.get(result.rowNumber);
                    const branch = result.resolvedBranchId ? branchById.get(result.resolvedBranchId) : null;
                    const classItem = result.resolvedClassId ? classById.get(result.resolvedClassId) : null;
                    const issueCodes = [...result.errorCodes, ...result.warningCodes];
                    return (
                      <tr key={`${result.rowNumber}-${source?.first_name ?? "row"}`}>
                        <td className="px-4 py-3 font-mono font-bold">{result.rowNumber}</td>
                        <td className="px-4 py-3"><div className="font-semibold">{source ? `${source.first_name} ${source.last_name}`.trim() : "—"}</div><div className="mt-1 text-xs text-gray-400">{source?.birth_date || "—"}</div></td>
                        <td className="px-4 py-3 text-gray-600">{branch ? `${branch.code} — ${branch.name}` : (source?.branch_code || "—")}<br/><span className="text-xs text-gray-400">{classItem ? `${classItem.code} — ${classItem.name}` : (source?.class_code || "—")}</span></td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(result.status)}`}>{translateStudentImportStatus(result.status, locale)}</span></td>
                        <td className="max-w-[420px] px-4 py-3 text-xs leading-5 text-gray-600">{issueCodes.length === 0 ? copy.noIssues : issueCodes.map(code => translateStudentImportIssue(code, locale)).join(" • ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 250 && <div className="border-t bg-gray-50 px-5 py-3 text-xs text-gray-500">{copy.moreRows}</div>}
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            {preview.warning + preview.duplicate + preview.error > 0 && (
              <Button type="button" variant="outline" disabled={isDownloading} onClick={() => void downloadIssues()} className="min-h-11 gap-2">
                <FileDown size={17} /> {copy.downloadIssues}
              </Button>
            )}
            <Button
              type="button"
              disabled={isCommitting || preview.ready + preview.warning === 0}
              onClick={() => void commitImport()}
              className="min-h-11 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
            >
              {isCommitting ? <RefreshCw size={17} className="animate-spin" /> : <Upload size={17} />}
              {isCommitting ? copy.committing : copy.commit}
            </Button>
          </div>
        </>
      )}

      <Card className="overflow-hidden border border-gray-100">
        <div className="border-b bg-gray-50 px-5 py-4">
          <div className="flex items-center gap-2 font-bold text-[#173B2D]"><History size={19} /> {copy.history}</div>
          <p className="mt-1 text-sm text-gray-500">{copy.historyHint}</p>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{copy.noHistory}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="border-b bg-white text-gray-500">
                <tr>
                  {[copy.filename, copy.createdBy, copy.date, copy.result, copy.status, copy.action].map(label => (
                    <th key={label} className="px-4 py-3 text-start font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(batch => (
                  <tr key={batch.batchId}>
                    <td className="max-w-[220px] truncate px-4 py-3 font-medium" title={batch.sourceFilename}>{batch.sourceFilename}</td>
                    <td className="px-4 py-3 text-gray-600">{batch.createdByName}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(batch.createdAt)}</td>
                    <td className="px-4 py-3 text-xs leading-5 text-gray-600">{copy.imported}: <strong>{batch.importedRows}</strong> · {copy.warning}: {batch.warningRows} · {copy.duplicate}: {batch.duplicateRows} · {copy.error}: {batch.errorRows}</td>
                    <td className="px-4 py-3 font-semibold">{batchStatusLabel(batch)}</td>
                    <td className="px-4 py-3">
                      {batch.canRollback ? (
                        <Button type="button" size="sm" variant="outline" disabled={rollingBackBatchId !== null} onClick={() => void rollbackBatch(batch)} className="gap-2 text-amber-700">
                          {rollingBackBatchId === batch.batchId ? <RefreshCw size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                          {copy.rollback}
                        </Button>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
