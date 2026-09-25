import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export async function handleCleanupSchoolBackups(request: Request) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("BACKUP_CLEANUP_SECRET")?.trim();
  const supplied = request.headers.get("x-backup-cleanup-secret")?.trim();
  if (!expected || !supplied || supplied !== expected) {
    return json(401, { error: "cleanup_unauthorized" });
  }

  const url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() || "";
  if (!url || !serviceKey) return json(500, { error: "server_config" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();
  const { data: expired, error } = await admin
    .from("school_backup_snapshots")
    .select("id,school_id,storage_key")
    .eq("status", "ready")
    .not("expires_at", "is", null)
    .lte("expires_at", now)
    .limit(100);

  if (error) return json(500, { error: "cleanup_query_failed" });

  let deleted = 0;
  for (const snapshot of expired ?? []) {
    let storageDeleted = !snapshot.storage_key;
    if (snapshot.storage_key) {
      const { error: storageError } = await admin.storage.from("school-backups").remove([snapshot.storage_key]);
      if (storageError) continue;
      storageDeleted = true;
    }

    const { error: updateError } = await admin
      .from("school_backup_snapshots")
      .update({ status: "expired" })
      .eq("id", snapshot.id)
      .eq("school_id", snapshot.school_id)
      .eq("status", "ready");

    if (!updateError) {
      await admin.from("school_backup_events").insert({
        school_id: snapshot.school_id,
        snapshot_id: snapshot.id,
        event_type: "expired",
        details: { expired_at: now, storage_deleted: storageDeleted },
      });
      deleted++;
    }
  }

  return json(200, { processed: expired?.length ?? 0, expired: deleted });
}
