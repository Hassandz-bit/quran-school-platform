import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { validateSchoolBackupPackage } from "../validate-school-backup/logic.ts";
import { SCHOOL_BACKUP_TABLES } from "../create-school-backup/package.ts";

const CORS = {
  "content-type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

function tokenOf(req: Request) {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) throw new Error("unauthorized");
  return m[1];
}

function clients(token: string) {
  const url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || Deno.env.get("SUPABASE_SECRET_KEY")?.trim() || "";
  if (!url || !anon || !service) throw new Error("server_config");
  return {
    url,
    user: createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }),
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function checksum(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}

export async function handlePrepareSchoolRestore(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const token = tokenOf(request);
    const body = (await request.json()) as Record<string, unknown>;
    const schoolId = String(body.schoolId ?? "");
    const snapshotId = String(body.snapshotId ?? "");
    const { url, user, admin } = clients(token);

    const { data: authUser, error: authError } = await user.auth.getUser(token);
    if (authError || !authUser.user) throw new Error("unauthorized");

    const { data: allowed, error: permissionError } = await user.rpc("has_school_permission", {
      target_school_id: schoolId,
      target_permission_code: "backup.restore_request",
    });
    if (permissionError || allowed !== true) return json(403, { error: "restore_request_denied" });

    const { data: snapshot, error: snapshotError } = await admin
      .from("school_backup_snapshots")
      .select("id,school_id,status,storage_key,checksum_sha256,byte_size")
      .eq("id", snapshotId).eq("school_id", schoolId).single();
    if (snapshotError || !snapshot) return json(404, { error: "snapshot_not_found" });
    if (snapshot.status !== "ready" || !snapshot.storage_key || !snapshot.checksum_sha256) {
      return json(409, { error: "snapshot_not_ready" });
    }

    const { data: source, error: downloadError } = await admin.storage.from("school-backups").download(snapshot.storage_key);
    if (downloadError || !source) return json(409, { error: "snapshot_download_failed" });
    const bytes = new Uint8Array(await source.arrayBuffer());
    const actualChecksum = await checksum(bytes);
    if (actualChecksum !== snapshot.checksum_sha256) {
      await admin.from("school_backup_events").insert({
        school_id: schoolId, snapshot_id: snapshotId, actor_profile_id: authUser.user.id,
        event_type: "verification_failed",
        details: { reason: "checksum_mismatch", expected: snapshot.checksum_sha256, actual: actualChecksum },
      });
      return json(409, { error: "backup_checksum_mismatch", destructiveRestore: false });
    }

    let pkg: unknown;
    try { pkg = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return json(422, { error: "backup_json_invalid", destructiveRestore: false }); }

    const validation = validateSchoolBackupPackage(pkg, schoolId);
    if (!validation.valid) {
      await admin.from("school_backup_events").insert({
        school_id: schoolId, snapshot_id: snapshotId, actor_profile_id: authUser.user.id,
        event_type: "verification_failed", details: { reason: "package_validation_failed", errors: validation.errors },
      });
      return json(422, { error: "backup_package_invalid", validation, destructiveRestore: false });
    }

    const currentCounts: Record<string, number> = {};
    const countDifferences: Record<string, { backup: number; current: number }> = {};
    const packageTables = (pkg as Record<string, unknown>).tables as Record<string, unknown[]>;
    for (const table of SCHOOL_BACKUP_TABLES) {
      const { count, error: countError } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId);
      if (countError) throw new Error(`restore_count_failed:${table}`);
      const current = count ?? 0;
      const backup = Array.isArray(packageTables[table]) ? packageTables[table].length : 0;
      currentCounts[table] = current;
      if (backup !== current) countDifferences[table] = { backup, current };
    }

    const preRestoreResponse = await fetch(`${url}/functions/v1/create-school-backup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ schoolId, backupKind: "pre_restore" }),
    });
    const preRestore = await preRestoreResponse.json().catch(() => ({}));
    if (!preRestoreResponse.ok || typeof preRestore.snapshotId !== "string") {
      throw new Error("pre_restore_backup_failed");
    }

    const { data: requestRow, error: requestError } = await admin
      .from("school_backup_restore_requests")
      .insert({
        school_id: schoolId,
        snapshot_id: snapshotId,
        requested_by: authUser.user.id,
        status: "dry_run_ready",
        pre_restore_snapshot_id: preRestore.snapshotId,
        validation_report: validation,
        conflict_report: {
          sourceChecksum: snapshot.checksum_sha256,
          sourceByteSize: snapshot.byte_size,
          countDifferences,
          currentCounts,
          destructiveRestore: false,
        },
      })
      .select("id,status,pre_restore_snapshot_id")
      .single();
    if (requestError || !requestRow) throw new Error("restore_request_create_failed");

    await admin.from("school_backup_events").insert([
      { school_id: schoolId, snapshot_id: snapshotId, actor_profile_id: authUser.user.id,
        event_type: "restore_requested",
        details: { request_id: requestRow.id, pre_restore_snapshot_id: preRestore.snapshotId } },
      { school_id: schoolId, snapshot_id: snapshotId, actor_profile_id: authUser.user.id,
        event_type: "restore_dry_run",
        details: { request_id: requestRow.id, destructive_restore: false, validation_errors: validation.errors } },
    ]);

    return json(200, {
      requestId: requestRow.id,
      status: requestRow.status,
      preRestoreSnapshotId: preRestore.snapshotId,
      validation,
      conflicts: { countDifferences, currentCounts, destructiveRestore: false },
      destructiveRestore: false,
      noSchoolDataModified: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "restore_prepare_failed";
    if (message === "unauthorized") return json(401, { error: "unauthorized" });
    console.error("prepare school restore failed", message);
    return json(500, { error: "restore_prepare_failed" });
  }
}
