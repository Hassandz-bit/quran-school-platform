import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";
import {
  authorizeImporter,
  buildStudentTemplate,
  decodeBase64,
  encodeBase64,
  getClients,
  MAX_FILE_BASE64_CHARS,
  parseStudentWorkbook,
  sha256Hex,
  stageImport,
} from "./services.ts";

const JSON_HEADERS = {
  ...corsHeaders,
  "content-type": "application/json; charset=utf-8",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function getBearer(request: Request) {
  const value = request.headers.get("authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(value)) throw new Error("student_import_unauthorized");
  return value;
}

export async function handleStudentImport(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(415, { error: "application_json_required" });
  }

  try {
    const bearer = getBearer(request);
    const body = await request.json() as Record<string, unknown>;
    const mode = String(body.mode ?? "");
    const schoolId = String(body.schoolId ?? "");
    if (!UUID_RE.test(schoolId)) return json(400, { error: "invalid_school" });

    const { userClient, adminClient } = getClients(bearer);
    const actorId = await authorizeImporter(userClient, schoolId);

    if (mode === "template") {
      const bytes = await buildStudentTemplate();
      return json(200, {
        fileName: "quranos-student-import-template.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileBase64: encodeBase64(bytes),
      });
    }

    if (mode !== "preview") return json(400, { error: "invalid_mode" });

    const fileName = String(body.fileName ?? "").trim();
    const fileBase64 = String(body.fileBase64 ?? "");
    if (!/\.xlsx$/i.test(fileName) || fileName.length > 180 || fileBase64.length === 0) {
      return json(400, { error: "invalid_file" });
    }
    if (fileBase64.length > MAX_FILE_BASE64_CHARS) {
      return json(422, { error: "student_import_file_size" });
    }

    const bytes = decodeBase64(fileBase64);
    const [rows, sha256] = await Promise.all([
      parseStudentWorkbook(bytes),
      sha256Hex(bytes),
    ]);
    const batchId = await stageImport(adminClient, schoolId, actorId, fileName, sha256, rows);
    return json(200, { batchId, rowCount: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "student_import_failed";
    if (message.includes("unauthorized")) return json(403, { error: "student_import_denied" });
    if (message.includes("missing_header")) return json(422, { error: message });
    if (message.includes("file_size") || message.includes("invalid_base64") || message.includes("invalid_workbook") || message.includes("too_many_rows") || message.includes("no_rows") || message.includes("sheet_missing")) {
      return json(422, { error: message });
    }
    console.error("student import failed", message);
    return json(500, { error: "student_import_failed" });
  }
}
