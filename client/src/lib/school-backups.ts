import { getSupabaseClient } from "@/lib/supabase";

export const SCHOOL_BACKUP_FORMAT_VERSION = 1;

export type SchoolBackupSnapshot = {
  id: string;
  school_id: string;
  backup_kind: "manual" | "scheduled" | "pre_restore";
  status: "queued" | "generating" | "ready" | "failed" | "expired";
  checksum_sha256: string | null;
  byte_size: number | null;
  record_counts: Record<string, number> | null;
  includes_documents: boolean;
  failure_code: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function listSchoolBackups(
  schoolId: string
): Promise<SchoolBackupSnapshot[]> {
  const { data, error } = await getSupabaseClient()
    .from("school_backup_snapshots")
    .select(
      "id,school_id,backup_kind,status,checksum_sha256,byte_size,record_counts,includes_documents,failure_code,created_at,completed_at"
    )
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw error;
  return (data ?? []) as SchoolBackupSnapshot[];
}

function makeBackupFileName(schoolSlug: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `quranos-${schoolSlug || "school"}-backup-${date}.json`;
}

export async function createAndDownloadSchoolBackup(input: {
  schoolId: string;
  schoolSlug: string;
}): Promise<void> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "create-school-backup",
    { body: { schoolId: input.schoolId } }
  );

  if (error || !data) throw error ?? new Error("backup_empty_response");

  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = makeBackupFileName(input.schoolSlug);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
