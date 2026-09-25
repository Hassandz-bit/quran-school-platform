import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("unauthorized");
  return match[1];
}

export async function handlePrepareSchoolRestore(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const token = bearer(request);
    const body = (await request.json()) as Record<string, unknown>;
    const schoolId = String(body.schoolId ?? "");
    const snapshotId = String(body.snapshotId ?? "");

    const url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
    if (!url || !anon || !service) return json(500, { error: "server_config" });

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: user, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user.user) throw new Error("unauthorized");

    const { data: allowed, error: permissionError } = await userClient.rpc(
      "has_school_permission",
      {
        target_school_id: schoolId,
        target_permission_code: "backup.restore_request",
      }
    );
    if (permissionError || allowed !== true) return json(403, { error: "restore_request_denied" });

    const { data: snapshot, error: snapshotError } = await admin
      .from("school_backup_snapshots")
      .select("id,school_id,status,storage_key,checksum_sha256,byte_size,format_version,includes_documents")
      .eq("id", snapshotId)
      .eq("school_id", schoolId)
      .single();

    if (snapshotError || !snapshot) return json(404, { error: "snapshot_not_found" });
    if (snapshot.status !== "ready") return json(409, { error: "snapshot_not_ready" });
    if (!snapshot.storage_key) return json(409, { error: "snapshot_storage_missing" });

    const { data: source, error: downloadError } = await admin.storage
      .from("school-backups")
      .download(snapshot.storage_key);
    if (downloadError || !source) return json(409, { error: "snapshot_download_failed" });

    const preRestoreKey = `${schoolId}/pre-restore-${crypto.randomUUID()}.json`;
    const { error: uploadError } = await admin.storage
      .from("school-backups")
      .upload(preRestoreKey, source, {
        contentType: "application/json",
        upsert: false,
      });
    if (uploadError) return json(500, { error: "pre_restore_snapshot_failed" });

    const { data: preRestore, error: insertError } = await admin
      .from("school_backup_snapshots")
      .insert({
        school_id: schoolId,
        backup_kind: "pre_restore",
        status: "ready",
        format_version: snapshot.format_version,
        storage_backend: "external_object_storage",
        storage_key: preRestoreKey,
        checksum_sha256: snapshot.checksum_sha256,
        byte_size: snapshot.byte_size,
        includes_documents: snapshot.includes_documents,
        created_by: user.user.id,
        completed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !preRestore) {
      await admin.storage.from("school-backups").remove([preRestoreKey]);
      return json(500, { error: "pre_restore_metadata_failed" });
    }

    await admin.from("school_backup_events").insert([
      {
        school_id: schoolId,
        snapshot_id: snapshotId,
        actor_profile_id: user.user.id,
        event_type: "restore_requested",
        details: { pre_restore_snapshot_id: preRestore.id, destructive_restore: false },
      },
      {
        school_id: schoolId,
        snapshot_id: preRestore.id,
        actor_profile_id: user.user.id,
        event_type: "restore_started",
        details: { stage: "pre_restore_snapshot_only", source_snapshot_id: snapshotId },
      },
    ]);

    return json(200, {
      prepared: true,
      destructiveRestore: false,
      sourceSnapshotId: snapshotId,
      preRestoreSnapshotId: preRestore.id,
      message: "Pre-restore safety snapshot created. No school data was modified.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "restore_prepare_failed";
    if (message === "unauthorized") return json(401, { error: "unauthorized" });
    return json(500, { error: "restore_prepare_failed" });
  }
}
