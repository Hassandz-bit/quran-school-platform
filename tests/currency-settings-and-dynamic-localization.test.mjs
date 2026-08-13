import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("school currency is constrained, admin-gated, and applied to new financial records", () => {
  const sql = read("supabase/064_school_currency_settings.sql");
  assert.match(sql, /add column if not exists currency_code text not null default 'DZD'/i);
  assert.match(sql, /currency_code in \('DZD', 'TND', 'MAD', 'EUR', 'USD', 'SAR', 'AED'\)/i);
  assert.match(sql, /grant update \(currency_code\) on public\.schools to authenticated/i);
  assert.match(sql, /fee_plans_apply_school_currency/i);
  assert.match(sql, /treasury_accounts_apply_school_currency/i);
  assert.match(sql, /official_receipts_apply_school_currency/i);
});

test("currency formatter keeps Latin digits and supports the configured currency", () => {
  const source = read("client/src/lib/currency.ts");
  assert.match(source, /ar-DZ-u-nu-latn/);
  assert.match(source, /SUPPORTED_CURRENCIES/);
  assert.match(source, /style: "currency"/);
});

test("currency catalog covers Islamic countries, Europe, and the Americas", () => {
  const source = read("client/src/lib/currency.ts");
  const migration = read("supabase/065_expand_supported_currencies.sql");
  const quotedCodes = [...source.matchAll(/"([A-Z]{3})"/g)].map(match => match[1]);
  const codes = [...new Set(quotedCodes)];
  const migrationCodes = [
    ...new Set(
      [...migration.matchAll(/'([A-Z]{3})'/g)].map(match => match[1])
    ),
  ];

  assert.equal(codes.length, 101);
  assert.deepEqual(migrationCodes, codes);
  assert.match(source, /id: "islamic"/);
  assert.match(source, /id: "europe"/);
  assert.match(source, /id: "americas"/);
  for (const code of ["DZD", "SAR", "AED", "EUR", "GBP", "USD", "CAD", "BRL"]) {
    assert.ok(codes.includes(code), `missing ${code} from the client catalog`);
    assert.match(migration, new RegExp(`'${code}'`));
  }
});

test("preferences expose language globally and restrict school currency edits", () => {
  const dialog = read("client/src/components/PreferencesDialog.tsx");
  assert.match(dialog, /setLocale\("ar"\)/);
  assert.match(dialog, /setLocale\("en"\)/);
  assert.match(dialog, /disabled=!canChangeCurrency|disabled=\{!canChangeCurrency/);
  assert.match(dialog, /currencyWarning/);
});

test("dynamic Arabic messages with names and counts have English renderers", () => {
  const source = read("client/src/lib/ui-translation.ts");
  assert.match(source, /Notification sent to/);
  assert.match(source, /Attendance saved for/);
  assert.match(source, /Welcome,/);
  assert.match(source, /Cancel the charge for/);
});
