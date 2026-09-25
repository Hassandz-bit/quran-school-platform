import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileSearch,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  dryRunSchoolBackupFile,
  type BackupDryRunResult,
} from "@/lib/school-backup-validation";
import {
  createAndDownloadSchoolBackup,
  listSchoolBackups,
  prepareSchoolBackupRestore,
  type SchoolBackupSnapshot,
} from "@/lib/school-backups";

function integrityLabel(
  integrity: BackupDryRunResult["integrity"],
  t: ReturnType<typeof useLocale>["t"]
) {
  if (integrity === "verified") return t("backup.integrityVerified");
  if (integrity === "unregistered") return t("backup.integrityUnregistered");
  if (integrity === "registry_unavailable") return t("backup.integrityUnavailable");
  return null;
}

export default function SchoolBackups() {
  const { school } = useAuth();
  const { direction, t } = useLocale();
  const [items, setItems] = useState<SchoolBackupSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [preparingRestoreId, setPreparingRestoreId] = useState<string | null>(null);
  const [restorePreparation, setRestorePreparation] = useState<Awaited<ReturnType<typeof prepareSchoolBackupRestore>> | null>(null);
  const [checkedFileName, setCheckedFileName] = useState("");
  const [dryRun, setDryRun] = useState<BackupDryRunResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    if (!school?.id) return;
    try {
      setItems(await listSchoolBackups(school.id));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void refresh();
  }, [school?.id]);

  const createBackup = async () => {
    if (!school?.id || busy) return;
    setBusy(true);
    try {
      await createAndDownloadSchoolBackup({
        schoolId: school.id,
        schoolSlug: school.slug ?? "school",
      });
      toast.success(t("backup.success"));
      await refresh();
    } catch {
      toast.error(t("backup.error"));
    } finally {
      setBusy(false);
    }
  };

  const checkBackupFile = async (file: File | null) => {
    if (!file || !school?.id || checking) return;
    setChecking(true);
    setCheckedFileName(file.name);
    setDryRun(null);
    try {
      const result = await dryRunSchoolBackupFile(file, school.id);
      setDryRun(result);
    } catch {
      setDryRun({
        valid: false,
        errors: ["dry_run_failed"],
        warnings: [],
        tableCounts: {},
        totalRecords: 0,
        snapshotId: null,
        checksumSha256: null,
        integrity: "unchecked",
      });
    } finally {
      setChecking(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const integrityText = dryRun ? integrityLabel(dryRun.integrity, t) : null;

  const prepareRestore = async (snapshotId: string) => {
    if (!school?.id || preparingRestoreId) return;
    setPreparingRestoreId(snapshotId);
    setRestorePreparation(null);
    try {
      const result = await prepareSchoolBackupRestore({
        schoolId: school.id,
        snapshotId,
      });
      setRestorePreparation(result);
      toast.success(t("backup.restorePrepared"));
    } catch {
      toast.error(t("backup.restorePrepareError"));
    } finally {
      setPreparingRestoreId(null);
    }
  };


  return (
    <main className="min-h-full bg-[#F7F8F3] p-4 sm:p-6" dir={direction}>
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold text-[#173B2D]">
            {t("backup.title")}
          </h1>
          <p className="mt-2 text-sm leading-7 text-[#5B6D64]">
            {t("backup.subtitle")}
          </p>
          <Button
            className="mt-5 gap-2 bg-[#0B4738] text-white"
            onClick={createBackup}
            disabled={busy}
          >
            {busy ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
            {busy ? t("backup.creating") : t("backup.create")}
          </Button>
          <p className="mt-3 text-xs text-[#697971]">
            {t("backup.manualHelp")}
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAF3EC] text-[#0B4738]">
              <FileSearch size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-[#173B2D]">
                {t("backup.dryRunTitle")}
              </h2>
              <p className="mt-1 text-sm leading-7 text-[#5B6D64]">
                {t("backup.dryRunDescription")}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={event => void checkBackupFile(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            className="mt-5 gap-2 border-[#0B4738] text-[#0B4738]"
            disabled={checking}
            onClick={() => fileInputRef.current?.click()}
          >
            {checking ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Upload size={18} />
            )}
            {checking ? t("backup.validating") : t("backup.selectFile")}
          </Button>

          <p className="mt-3 text-xs font-medium text-[#697971]">
            {t("backup.noWrite")}
          </p>

          {dryRun && (
            <div
              role="status"
              className={`mt-5 rounded-2xl border p-4 ${
                dryRun.valid
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "border-red-200 bg-red-50/70"
              }`}
            >
              <div className="flex items-start gap-3">
                {dryRun.valid ? (
                  <CheckCircle2
                    className="mt-0.5 shrink-0 text-emerald-700"
                    size={22}
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldAlert
                    className="mt-0.5 shrink-0 text-red-700"
                    size={22}
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[#173B2D]">
                    {dryRun.valid
                      ? t("backup.dryRunValid")
                      : t("backup.dryRunInvalid")}
                  </p>
                  {checkedFileName && (
                    <p className="mt-1 truncate text-xs text-[#5B6D64]" dir="auto">
                      {checkedFileName}
                    </p>
                  )}
                  {integrityText && (
                    <p className="mt-2 text-sm text-[#3F5E4E]">{integrityText}</p>
                  )}
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <p>
                      <span className="font-semibold">{t("backup.totalRecords")}:</span>{" "}
                      <span dir="ltr">{dryRun.totalRecords}</span>
                    </p>
                    <p>
                      <span className="font-semibold">{t("backup.warningCount")}:</span>{" "}
                      <span dir="ltr">{dryRun.warnings.length}</span>
                    </p>
                    <p>
                      <span className="font-semibold">{t("backup.errorCount")}:</span>{" "}
                      <span dir="ltr">{dryRun.errors.length}</span>
                    </p>
                  </div>
                  {dryRun.checksumSha256 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-[#5B6D64]">
                        {t("backup.checksum")}
                      </p>
                      <p
                        className="mt-1 break-all font-mono text-[11px] text-[#40554A]"
                        dir="ltr"
                      >
                        {dryRun.checksumSha256}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="font-bold text-[#173B2D]">{t("backup.history")}</h2>
          {items.length === 0 ? (
            <p className="mt-4 text-sm text-[#697971]">{t("backup.empty")}</p>
          ) : (
            <div className="mt-4 space-y-2">
              {items.map(item => (
                <div key={item.id} className="rounded-xl border p-3 text-sm">
                  <strong>
                    {item.status === "ready"
                      ? t("backup.ready")
                      : item.status === "failed"
                        ? t("backup.failed")
                        : t("backup.generating")}
                  </strong>
                  {item.checksum_sha256 && (
                    <p className="mt-1 truncate font-mono text-xs" dir="ltr">
                      {item.checksum_sha256}
                    </p>
                  )}
                  {item.status === "ready" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 gap-2 border-[#0B4738] text-[#0B4738]"
                      disabled={preparingRestoreId !== null}
                      onClick={() => void prepareRestore(item.id)}
                    >
                      {preparingRestoreId === item.id ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <ShieldAlert size={16} />
                      )}
                      {preparingRestoreId === item.id
                        ? t("backup.preparingRestore")
                        : t("backup.prepareRestore")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-sm text-[#697971]">{t("backup.cloudPending")}</p>
        {restorePreparation && (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
            <h2 className="font-bold text-[#173B2D]">{t("backup.restorePrepared")}</h2>
            <p className="mt-2 text-sm text-[#3F5E4E]">{t("backup.noChanges")}</p>
            {restorePreparation.preRestoreSnapshotId && (
              <p className="mt-3 text-xs text-[#5B6D64]" dir="ltr">
                {t("backup.preRestoreSnapshot")}: {restorePreparation.preRestoreSnapshotId}
              </p>
            )}
            {Object.keys(restorePreparation.conflicts.countDifferences ?? {}).length > 0 && (
              <p className="mt-3 text-sm font-semibold text-[#7A4B00]">
                {t("backup.conflicts")}: {Object.keys(restorePreparation.conflicts.countDifferences ?? {}).length}
              </p>
            )}
          </section>
        )}

        <p className="text-sm text-[#697971]">{t("backup.restoreLocked")}</p>
      </div>
    </main>
  );
}
