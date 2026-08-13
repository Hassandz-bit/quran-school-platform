import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/035_documents_management_foundation.sql");
const storageHardening = read("supabase/036_documents_storage_integrity.sql");
const scopeHardening = read("supabase/037_documents_subject_scope_sync.sql");
const storagePolicyHelpers = read("supabase/038_documents_storage_policy_helpers.sql");
const triggerExecuteHardening = read("supabase/055_documents_trigger_function_execute_hardening.sql");
const client = read("client/src/lib/documents.ts");
const page = read("client/src/pages/Documents.tsx");
const route = read("client/src/components/DocumentsRoute.tsx");
const app = read("client/src/App.tsx");
const appShell = read("client/src/components/AppShell.tsx");
const navigation = read("client/src/lib/app-navigation.ts");
const locale = read("client/src/lib/locale.ts");

test("document metadata is private and browser access is RPC-only", () => {
  assert.match(migration, /alter table public\.document_records enable row level security/i);
  assert.match(migration, /alter table public\.document_events enable row level security/i);
  assert.match(migration, /revoke all on table public\.document_records, public\.document_events[\s\S]*authenticated/i);
  assert.doesNotMatch(client, /\.from\(["']document_(?:records|events)["']\)/);
  assert.match(client, /rpc\(["']list_document_records["']/);
  assert.match(client, /rpc\(["']create_document_slot["']/);
  assert.match(client, /rpc\(["']finalize_document_upload["']/);
  assert.match(client, /rpc\(["']update_document_status["']/);
});

test("document permissions are conservative and exact", () => {
  assert.match(migration, /'documents\.view'/);
  assert.match(migration, /'documents\.manage'/);
  assert.match(migration, /\('registrar', 'documents\.manage'\)/i);
  assert.match(migration, /\('branch_manager', 'documents\.manage'\)/i);
  assert.doesNotMatch(migration, /\('teacher', 'documents\.(?:view|manage)'\)/i);
  assert.doesNotMatch(migration, /\('guardian', 'documents\.(?:view|manage)'\)/i);
  assert.match(route, /fetchDocumentsAccess/);
  assert.match(route, /result\.canView/);
  assert.match(appShell, /fetchDocumentsAccess/);
  assert.match(appShell, /canViewDocuments/);
  assert.match(navigation, /canViewDocuments/);
});

test("document files stay in private bounded Storage with immutable current bytes", () => {
  assert.match(migration, /'school-documents'[\s\S]*false[\s\S]*10485760/i);
  assert.match(migration, /application\/pdf/);
  assert.match(migration, /image\/jpeg/);
  assert.match(migration, /image\/png/);
  assert.match(migration, /image\/webp/);
  assert.match(storageHardening, /document_storage_object_missing/);
  assert.match(storageHardening, /drop policy if exists "school documents scoped update"/i);
  assert.match(storagePolicyHelpers, /security definer/i);
  assert.match(storagePolicyHelpers, /can_read_document_storage_object/i);
  assert.match(storagePolicyHelpers, /can_manage_document_storage_object/i);
  assert.match(storagePolicyHelpers, /document\.object_path = target_object_name/i);
  assert.match(storagePolicyHelpers, /create policy "school documents scoped read"[\s\S]*can_read_document_storage_object\(name\)/i);
  assert.match(storagePolicyHelpers, /create policy "school documents scoped insert"[\s\S]*can_manage_document_storage_object\(name, false\)/i);
  assert.match(storagePolicyHelpers, /create policy "school documents scoped delete"[\s\S]*can_manage_document_storage_object\(name, true\)/i);
  assert.doesNotMatch(storagePolicyHelpers, /create policy "school documents scoped update"/i);
  assert.match(client, /upsert: false/);
  assert.match(client, /\.download\(objectPath\)/);
  assert.doesNotMatch(client, /getPublicUrl|createSignedUrl/);
});

test("document trigger helpers are not browser-executable", () => {
  for (const signature of [
    "validate_document_subject_scope",
    "validate_document_storage_object",
    "sync_student_document_branch",
  ]) {
    assert.match(
      triggerExecuteHardening,
      new RegExp(`revoke all on function public\\.${signature}\\(\\)[\\s\\S]*from public, anon, authenticated`, "i"),
    );
  }
  assert.doesNotMatch(triggerExecuteHardening, /grant\s+execute/i);
});

test("students and registration leads share one scoped document foundation", () => {
  assert.match(migration, /subject_type = 'student'/);
  assert.match(migration, /subject_type = 'registration_lead'/);
  assert.match(migration, /student_id uuid references public\.students/i);
  assert.match(migration, /registration_lead_id uuid references public\.registration_leads/i);
  assert.match(migration, /validate_document_subject_scope/);
  assert.match(migration, /birth_certificate_provided/);
  assert.match(migration, /medical_report_provided/);
});

test("document scope follows student transfers and custom other slots remain distinct", () => {
  assert.match(scopeHardening, /create trigger students_sync_document_branch/i);
  assert.match(scopeHardening, /after update of school_id, branch_id on public\.students/i);
  assert.match(scopeHardening, /update public\.document_records[\s\S]*set branch_id = new\.branch_id/i);
  assert.match(scopeHardening, /document_records_student_other_label_idx/i);
  assert.match(scopeHardening, /lower\(btrim\(custom_label\)\)/i);
  assert.match(scopeHardening, /target_category <> 'other'[\s\S]*lower\(btrim\(document\.custom_label\)\)/i);
});

test("document route, UI and navigation are bilingual", () => {
  assert.match(app, /path="\/documents"/);
  assert.match(app, /<DocumentsRoute>/);
  assert.match(navigation, /id: "documents"/);
  assert.match(navigation, /path: "\/documents"/);
  assert.match(locale, /"nav\.documents": "الوثائق"/);
  assert.match(locale, /"nav\.documents": "Documents"/);
  assert.match(page, /إدارة الوثائق/);
  assert.match(page, /Document Management/);
});
