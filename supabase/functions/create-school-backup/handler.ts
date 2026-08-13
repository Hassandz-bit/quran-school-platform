import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";
import { persistBackupOffsite } from "./r2-storage.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = {
  ...CORS_HEADERS,
  "content-type": "application/json; charset=utf-8",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SCHOOL_TABLES = [
  "branches",
  "school_memberships",
  "roles",
  "role_permissions",
  "membership_roles",
  "classes",
  "students",
  "teachers",
  "class_teachers",
  "fee_plans",
  "student_charges",
  "payments",
  "student_discounts",
  "expenses",
  "attendance_sessions",
  "attendance_records",
  "attendance_record_history",
  "memorization_records",
  "memorization_record_history",
  "student_guardians",
  "guardian_access_events",
  "app_notifications",
  "official_receipt_counters",
  "official_receipts",
  "registration_leads",
  "registration_lead_events",
  "document_records",
  "document_events",
  "memorization_follow_up_notes",
  "memorization_follow_up_note_history",
  "payroll_compensation_profiles",
  "payroll_periods",
  "payroll_entries",
  "payroll_payments",
  "payroll_audit_events",
  "treasury_accounts",
  "other_income",
  "treasury_transfers",
  "treasury_movements",
  "treasury_audit_events",
  "financial_periods",
  "financial_period_events",
  "treasury_account_reconciliations",
  "staff_positions",
  "notification_campaigns",
  "employees",
] as const;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function mappedEnvironmentValue(name: string): string | null {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed.default === "string" ? parsed.default : null;
  } catch {
    return null;
  }
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization")?.trim() ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("backup_unauthorized");
  return match[1];
}

function createClients(token: string) {
  const url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const publishableKey =
    mappedEnvironmentValue("SUPABASE_PUBLISHABLE_KEYS") ??
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() ??
    "";
  const secretKey =
    mappedEnvironmentValue("SUPABASE_SECRET_KEYS") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ??
    "";

  if (!url || !publishableKey || !secretKey) {
    throw new Error("backup_server_config");
  }

  return {
    userClient: createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    adminClient: createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function authorize(
  userClient: SupabaseClient,
  token: string,
  schoolId: string
) {
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Error("backup_unauthorized");
  }

  const { data: allowed, error } = await userClient.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: "backup.create",
  });
  if (error || allowed !== true) {
    throw new Error("backup_denied");
  }

  return userData.user.id;
}

async function readSchoolRows(
  adminClient: SupabaseClient,
  table: string,
  schoolId: string
) {
  const { data, error } = await adminClient
    .from(table)
    .select("*")
    .eq("school_id", schoolId);
  if (error) throw new Error(`backup_table_failed:${table}`);
  return data ?? [];
}

async function sha256Hex(text: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function safeProfiles(
  adminClient: SupabaseClient,
  profileIds: string[]
) {
  if (profileIds.length === 0) return [];
  const { data, error } = await adminClient
    .from("profiles")
    .select("id,full_name,avatar_url,phone,locale,status,created_at,updated_at")
    .in("id", profileIds);
  if (error) throw new Error("backup_profiles_failed");
  return data ?? [];
}

export async function handleCreateSchoolBackup(
  request: Request
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    const token = bearerToken(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const schoolId = String(payload.schoolId ?? "");
    if (!UUID_RE.test(schoolId)) {
      return json(400, { error: "invalid_school" });
    }

    const { userClient, adminClient } = createClients(token);
    const actorId = await authorize(userClient, token, schoolId);

    const { data: school, error: schoolError } = await adminClient
      .from("schools")
      .select(
        "id,name,slug,status,default_locale,timezone,currency_code,created_at,updated_at"
      )
      .eq("id", schoolId)
      .single();
    if (schoolError || !school) {
      throw new Error("backup_school_missing");
    }

    const { data: snapshot, error: snapshotError } = await adminClient
      .from("school_backup_snapshots")
      .insert({
        school_id: schoolId,
        backup_kind: "manual",
        status: "generating",
        storage_backend: "temporary_download",
        created_by: actorId,
      })
      .select("id")
      .single();
    if (snapshotError || !snapshot) {
      throw new Error("backup_snapshot_create_failed");
    }

    await adminClient.from("school_backup_events").insert({
      school_id: schoolId,
      snapshot_id: snapshot.id,
      actor_profile_id: actorId,
      event_type: "generation_started",
      details: { mode: "manual_download" },
    });

    try {
      const tables: Record<string, unknown[]> = {};
      const counts: Record<string, number> = {};

      for (const table of SCHOOL_TABLES) {
        const rows = await readSchoolRows(adminClient, table, schoolId);
        tables[table] = rows;
        counts[table] = rows.length;
      }

      const profileIds = new Set<string>();
      const profileSources = [
        ["school_memberships", "profile_id"],
        ["teachers", "profile_id"],
        ["student_guardians", "guardian_profile_id"],
        ["employees", "linked_profile_id"],
      ] as const;
      for (const [table, column] of profileSources) {
        for (const row of tables[table] ?? []) {
          const value = (row as Record<string, unknown>)[column];
          if (typeof value === "string") profileIds.add(value);
        }
      }

      const profiles = await safeProfiles(adminClient, [...profileIds]);
      counts.profiles = profiles.length;

      const permissionIds = [
        ...new Set(
          (tables.role_permissions ?? [])
            .map(row => (row as Record<string, unknown>).permission_id)
            .filter((value): value is string => typeof value === "string")
        ),
      ];
      let permissionCatalog: unknown[] = [];
      if (permissionIds.length > 0) {
        const { data, error } = await adminClient
          .from("permissions")
          .select("id,code,module,name_ar,description")
          .in("id", permissionIds);
        if (error) throw new Error("backup_permissions_failed");
        permissionCatalog = data ?? [];
      }
      counts.permissions = permissionCatalog.length;

      const documentObjectPaths = (tables.document_records ?? [])
        .map(row => (row as Record<string, unknown>).object_path)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0
        );

      const createdAt = new Date().toISOString();
      const packageData = {
        format: "quranos-school-backup",
        formatVersion: 1,
        snapshotId: snapshot.id,
        generatedAt: createdAt,
        school,
        profiles,
        permissionCatalog,
        tables,
        storage: {
          documentsIncluded: false,
          documentObjectPaths,
        },
        exclusions: [
          "auth.users",
          "passwords_and_auth_tokens",
          "teacher_invitations",
          "guardian_invitations",
          "guardian_push_subscriptions",
          "guardian_notification_deliveries",
          "platform_secrets",
        ],
      };

      const serialized = JSON.stringify(packageData);
      const checksum = await sha256Hex(serialized);
      const byteSize = new TextEncoder().encode(serialized).byteLength;
      const fileName = `quranos-${school.slug}-backup-${createdAt.slice(
        0,
        10
      )}-${snapshot.id.slice(0, 8)}.json`;

      const offsite = await persistBackupOffsite({
        schoolId,
        snapshotId: snapshot.id,
        createdAt,
        body: serialized,
        checksumSha256: checksum,
      });
      const storageBackend = offsite
        ? "external_object_storage"
        : "temporary_download";
      const storageKey = offsite?.storageKey ?? `direct-download://${fileName}`;

      const { error: readyError } = await adminClient
        .from("school_backup_snapshots")
        .update({
          status: "ready",
          storage_backend: storageBackend,
          storage_key: storageKey,
          checksum_sha256: checksum,
          byte_size: byteSize,
          record_counts: counts,
          includes_documents: false,
          completed_at: createdAt,
          expires_at: offsite ? null : createdAt,
        })
        .eq("id", snapshot.id)
        .eq("school_id", schoolId);
      if (readyError) {
        throw new Error("backup_snapshot_finalize_failed");
      }

      await adminClient.from("school_backup_events").insert({
        school_id: schoolId,
        snapshot_id: snapshot.id,
        actor_profile_id: actorId,
        event_type: "generated",
        details: {
          checksum_sha256: checksum,
          byte_size: byteSize,
          documents_included: false,
          storage_backend: storageBackend,
          offsite_stored: Boolean(offsite),
        },
      });

      return new Response(serialized, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${fileName}"`,
          "x-quranos-backup-sha256": checksum,
          "x-quranos-backup-snapshot": snapshot.id,
          "x-quranos-backup-offsite": offsite ? "stored" : "not-configured",
        },
      });
    } catch (generationError) {
      const code =
        generationError instanceof Error
          ? generationError.message.split(":")[0]
          : "backup_generation_failed";
      await adminClient
        .from("school_backup_snapshots")
        .update({ status: "failed", failure_code: code })
        .eq("id", snapshot.id)
        .eq("school_id", schoolId);
      await adminClient.from("school_backup_events").insert({
        school_id: schoolId,
        snapshot_id: snapshot.id,
        actor_profile_id: actorId,
        event_type: "generation_failed",
        details: { code },
      });
      throw generationError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "backup_failed";
    if (message.includes("unauthorized")) {
      return json(401, { error: "backup_unauthorized" });
    }
    if (message.includes("denied")) {
      return json(403, { error: "backup_denied" });
    }
    console.error("school backup failed", message);
    return json(500, { error: "backup_failed" });
  }
}
