import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { createAndDownloadSchoolBackup, listSchoolBackups, type SchoolBackupSnapshot } from "@/lib/school-backups";

export default function SchoolBackups() {
  const { school } = useAuth();
  const { direction, t } = useLocale();
  const [items, setItems] = useState<SchoolBackupSnapshot[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!school?.id) return;
    try { setItems(await listSchoolBackups(school.id)); } catch { setItems([]); }
  };

  useEffect(() => { void refresh(); }, [school?.id]);

  const createBackup = async () => {
    if (!school?.id || busy) return;
    setBusy(true);
    try {
      await createAndDownloadSchoolBackup({ schoolId: school.id, schoolSlug: school.slug ?? "school" });
      toast.success(t("backup.success"));
      await refresh();
    } catch {
      toast.error(t("backup.error"));
    } finally { setBusy(false); }
  };

  return <main className="min-h-full bg-[#F7F8F3] p-6" dir={direction}>
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-[#173B2D]">{t("backup.title")}</h1>
        <p className="mt-2 text-sm leading-7 text-[#5B6D64]">{t("backup.subtitle")}</p>
        <Button className="mt-5 gap-2 bg-[#0B4738] text-white" onClick={createBackup} disabled={busy}>
          {busy ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
          {busy ? t("backup.creating") : t("backup.create")}
        </Button>
        <p className="mt-3 text-xs text-[#697971]">{t("backup.manualHelp")}</p>
      </section>
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="font-bold text-[#173B2D]">{t("backup.history")}</h2>
        {items.length === 0 ? <p className="mt-4 text-sm text-[#697971]">{t("backup.empty")}</p> :
          <div className="mt-4 space-y-2">{items.map(item => <div key={item.id} className="rounded-xl border p-3 text-sm"><strong>{item.status === "ready" ? t("backup.ready") : item.status === "failed" ? t("backup.failed") : t("backup.generating")}</strong>{item.checksum_sha256 && <p className="mt-1 truncate font-mono text-xs" dir="ltr">{item.checksum_sha256}</p>}</div>)}</div>}
      </section>
      <p className="text-sm text-[#697971]">{t("backup.cloudPending")}</p>
      <p className="text-sm text-[#697971]">{t("backup.restoreLocked")}</p>
    </div>
  </main>;
}
