import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/070_institution_settings_branding.sql");
const service = read("client/src/lib/institution-settings.ts");
const panel = read("client/src/components/InstitutionSettingsPanel.tsx");
const authorization = read("client/src/lib/authorization.ts");
const shell = read("client/src/components/AppShell.tsx");
const receiptsPage = read("client/src/pages/Receipts.tsx");
const receiptDialog = read("client/src/components/OfficialReceiptDialog.tsx");
const locale = read("client/src/lib/locale.ts");

test("institution settings migration keeps updates school-scoped and logo uploads constrained", () => {
  for (const column of ["contact_phone", "contact_email", "address", "website_url", "logo_path"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`, "i"));
  }
  assert.match(migration, /grant update \(contact_phone, contact_email, address, website_url, logo_path\)[\s\S]*?on public\.schools to authenticated/i);
  assert.match(migration, /insert into storage\.buckets[\s\S]*?'school-logos'[\s\S]*?true[\s\S]*?1048576/i);
  assert.match(migration, /array\['image\/png', 'image\/jpeg', 'image\/webp'\]/i);
  assert.match(migration, /school logos scoped insert[\s\S]*?public\.has_school_permission\(school\.id, 'school\.update'\)/i);
  assert.match(migration, /school logos scoped delete[\s\S]*?public\.has_school_permission\(school\.id, 'school\.update'\)/i);
  assert.match(migration, /school\.id::text = \(storage\.foldername\(name\)\)\[1\]/i);
  assert.doesNotMatch(migration, /create policy[^;]*school logos[^;]*for update/i);
});

test("institution settings client validates uploads and relies on school.update permission", () => {
  assert.match(service, /target_permission_code: "school\.update"/);
  assert.match(service, /SCHOOL_LOGO_MAX_BYTES = 1_048_576/);
  assert.match(service, /image\/png.*image\/jpeg.*image\/webp/s);
  assert.match(service, /upsert: false/);
  assert.match(service, /\.eq\("id", input\.schoolId\)/);
  assert.match(service, /\.eq\("status", "active"\)/);
  assert.match(panel, /hasInstitutionSettingsPermission/);
  assert.match(panel, /saveInstitutionSettings/);
  assert.match(panel, /school\.logo_path/);
});

test("institution profile logo is used in the app shell and official receipt print view", () => {
  assert.match(authorization, /contact_phone, contact_email, address, website_url, logo_path/);
  assert.match(shell, /getInstitutionLogoUrl\(school\?\.logo_path\)/);
  assert.match(shell, /logoUrl=\{schoolLogoUrl\}/);
  assert.match(receiptsPage, /getInstitutionLogoUrl\(school\.logo_path\)/);
  assert.match(receiptsPage, /branding=\{receiptBranding\}/);
  assert.match(receiptDialog, /branding\?\.logoUrl/);
  assert.match(receiptDialog, /branding\?\.address/);
});

test("institution settings provide matching Arabic and English interface strings", () => {
  for (const key of ["institution.title", "institution.logoHelp", "institution.save", "institution.logoTypeError"]) {
    assert.match(locale, new RegExp(`"${key}":`));
  }
  assert.match(locale, /"institution\.title": "بيانات المؤسسة"/);
  assert.match(locale, /"institution\.title": "Institution profile"/);
});
