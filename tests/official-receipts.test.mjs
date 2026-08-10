import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/027_official_receipts.sql");
const receiptsLib = read("client/src/lib/receipts.ts");
const receiptsPage = read("client/src/pages/Receipts.tsx");
const receiptDialog = read("client/src/components/OfficialReceiptDialog.tsx");
const staffRoute = read("client/src/components/StaffRoute.tsx");
const app = read("client/src/App.tsx");
const navigation = read("client/src/lib/app-navigation.ts");

test("official receipt ledger is private, immutable from the browser, and RPC-only", () => {
  assert.match(migration, /create table public\.official_receipt_counters/i);
  assert.match(migration, /create table public\.official_receipts/i);
  assert.match(migration, /alter table public\.official_receipts enable row level security/i);
  assert.match(migration, /revoke all on table public\.official_receipt_counters, public\.official_receipts[\s\S]*authenticated/i);
  assert.doesNotMatch(receiptsLib, /\.from\(["']official_receipts["']\)/);
  assert.match(receiptsLib, /rpc\("issue_payment_receipt"/);
  assert.match(receiptsLib, /rpc\(\s*"issue_registration_receipt"/);
  assert.match(receiptsLib, /rpc\("get_official_receipt"/);
  assert.match(receiptsLib, /rpc\("list_my_official_receipts"/);
});

test("receipt numbering is explicit, school-scoped, idempotent, and demo-safe", () => {
  assert.match(migration, /unique \(school_id, sequence_number\)/i);
  assert.match(migration, /unique \(school_id, receipt_number\)/i);
  assert.match(migration, /create unique index official_receipts_payment_once_idx/i);
  assert.match(migration, /create unique index official_receipts_registration_once_idx/i);
  assert.match(migration, /allocate_official_receipt_sequence/i);
  assert.match(migration, /'QOS-' \|\| lpad\(next_sequence::text, 8, '0'\)/i);
  assert.match(migration, /official_receipt_demo_record/i);
  assert.doesNotMatch(migration, /after insert[\s\S]{0,200}payments[\s\S]{0,200}official_receipt/i);
});

test("payment reversal preserves the receipt and marks it reversed", () => {
  assert.match(migration, /create or replace function public\.sync_payment_receipt_reversal/i);
  assert.match(migration, /set receipt_status = 'reversed'/i);
  assert.match(migration, /reversed_at = coalesce\(receipt\.reversed_at, now\(\)\)/i);
  assert.doesNotMatch(migration, /delete from public\.official_receipts/i);
  assert.match(receiptDialog, /معكوس \/ ملغى محاسبيًا/);
  assert.match(receiptDialog, /retained for audit purposes/i);
});

test("receipt center supports payment and non-financial registration receipts plus print PDF", () => {
  assert.match(receiptsPage, /issuePaymentReceipt/);
  assert.match(receiptsPage, /issueRegistrationReceipt/);
  assert.match(receiptsPage, /الوصولات الرسمية/);
  assert.match(receiptsPage, /Official Receipts/);
  assert.match(receiptDialog, /window\.print\(\)/);
  assert.match(receiptDialog, /طباعة \/ حفظ PDF/);
  assert.match(receiptDialog, /amountToWords/);
  assert.match(receiptDialog, /إثبات تسجيل — دون مبلغ مالي/);
});

test("shared staff routes no longer incorrectly require school_admin", () => {
  assert.match(staffRoute, /activeRoleCodes\.length === 0/);
  assert.match(app, /path="\/guardians"[\s\S]*?<StaffRoute>/);
  assert.match(app, /path="\/notifications"[\s\S]*?<StaffRoute>/);
  assert.match(app, /path="\/settings"[\s\S]*?<StaffRoute>/);
  assert.match(app, /path="\/receipts"[\s\S]*?<StaffRoute>/);
  assert.match(navigation, /id: "receipts"/);
  assert.match(navigation, /path: "\/receipts"/);
});
