import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const CORS = {
  "content-type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-backup-scheduler-secret, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

function secretFor(request: Request) {
  const supplied = request.headers.get("x-backup-scheduler-secret")?.trim() ?? "";
  const expected = Deno.env.get("BACKUP_SCHEDULER_SECRET")?.trim() ?? "";
  return supplied.length > 0 && expected.length > 0 && supplied === expected;
}

function clients() {
  const url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    "";
  if (!url || !key) throw new Error("scheduler_server_config");
  return { url, admin: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleRunScheduledSchoolBackups(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!secretFor(request)) return json(401, { error: "scheduler_unauthorized" });

  try {
    const { url, admin } = clients();
    const batchSize = Math.min(Math.max(Number(Deno.env.get("BACKUP_SCHEDULE_BATCH_SIZE") ?? "25"), 1), 100);
    const { data: schools, error: schoolError } = await admin
      .from("schools")
      .select("id")
      .order("id")
      .limit(batchSize);
    if (schoolError) throw new Error("scheduler_school_list_failed");

    const results: Array<Record<string, unknown>> = [];
    const schedulerSecret = Deno.env.get("BACKUP_SCHEDULER_SECRET")?.trim() ?? "";
    for (const school of schools ?? []) {
      try {
        const response = await fetch(`${url}/functions/v1/create-school-backup`, {
          method: "POST",
          headers: {
            "x-backup-scheduler-secret": schedulerSecret,
            "content-type": "application/json",
          },
          body: JSON.stringify({ schoolId: school.id, backupKind: "scheduled" }),
        });
        const payload = await response.json().catch(() => ({}));
        results.push({
          schoolId: school.id,
          ok: response.ok,
          snapshotId: payload.snapshotId ?? null,
          error: response.ok ? null : payload.error ?? "backup_failed",
        });
      } catch {
        results.push({ schoolId: school.id, ok: false, snapshotId: null, error: "backup_request_failed" });
      }
      await sleep(150);
    }

    const now = new Date().toISOString();
    const { data: expired } = await admin
      .from("school_backup_snapshots")
      .select("id,school_id,storage_key")
      .eq("status", "ready")
      .not("expires_at", "is", null)
      .lte("expires_at", now)
      .limit(100);

    let expiredCount = 0;
    for (const snapshot of expired ?? []) {
      if (!snapshot.storage_key) continue;
      const { error: removeError } = await admin.storage.from("school-backups").remove([snapshot.storage_key]);
      if (removeError) continue;
      const { error: updateError } = await admin
        .from("school_backup_snapshots")
        .update({ status: "expired" })
        .eq("id", snapshot.id)
        .eq("school_id", snapshot.school_id)
        .eq("status", "ready");
      if (updateError) continue;
      await admin.from("school_backup_events").insert({
        school_id: snapshot.school_id,
        snapshot_id: snapshot.id,
        actor_profile_id: null,
        event_type: "expired",
        details: { storage_deleted: true, source: "scheduled_maintenance" },
      });
      expiredCount++;
    }

    return json(200, {
      processedSchools: results.length,
      successfulBackups: results.filter(item => item.ok === true).length,
      failedBackups: results.filter(item => item.ok !== true).length,
      expiredSnapshots: expiredCount,
      results,
    });
  } catch (error) {
    console.error("scheduled school backup failed", error instanceof Error ? error.message : "unknown");
    return json(500, { error: "scheduled_backup_failed" });
  }
}
