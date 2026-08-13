import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const UI_ROOTS = ["client/src/pages", "client/src/components"];
const ARABIC = /[\u0600-\u06ff]/;
const ALLOWED_ARABIC = new Set([
  "ق", // QuranOS brand mark
  "ع", // Arabic-name avatar fallback
  "ال", // dynamic Arabic definite-article fragment
  "العربية", // language selector must remain recognizable in both locales
  "،",
]);

function filesUnder(directory) {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "ui" ? [] : filesUnder(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

function parseCatalog(source) {
  const entries = new Set();
  for (const match of source.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"(?:[^"\\]|\\.)*",?$/gm)) {
    entries.add(JSON.parse(`"${match[1]}"`));
  }
  return entries;
}

function sourceCopy(source) {
  const values = [];
  for (const match of source.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    const value = match[2]
      .replace(/\$\{[^}]+\}/g, "")
      .replace(/\\"/g, '"')
      .trim();
    if (value && value.length < 500 && ARABIC.test(value)) values.push(value);
  }
  for (const match of source.matchAll(/>([^<>{}]*[\u0600-\u06ff][^<>{}]*)</g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value) values.push(value);
  }
  return values;
}

test("every fixed Arabic UI string has an English catalog entry", () => {
  const catalog = new Set([
    ...parseCatalog(readFileSync(join(ROOT, "client/src/lib/ui-translation.ts"), "utf8")),
    ...parseCatalog(readFileSync(join(ROOT, "client/src/lib/ui-copy-en.ts"), "utf8")),
  ]);
  const uncovered = [];

  for (const path of UI_ROOTS.flatMap(filesUnder)) {
    const source = readFileSync(join(ROOT, path), "utf8");
    for (const value of sourceCopy(source)) {
      if (ALLOWED_ARABIC.has(value) || !/[\u0621-\u064a]/.test(value)) continue;
      if (value.includes("${") || value.includes("}")) continue;
      if (!catalog.has(value)) uncovered.push(`${relative(ROOT, path)}: ${value}`);
    }
  }

  assert.deepEqual(uncovered, []);
});

test("Arabic display formatting uses Algerian month names and Latin digits", () => {
  const locale = "ar-DZ-u-nu-latn";
  const months = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, month, 1))
    )
  );

  assert.deepEqual(months, [
    "جانفي",
    "فيفري",
    "مارس",
    "أفريل",
    "ماي",
    "جوان",
    "جويلية",
    "أوت",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ]);
  assert.equal(new Intl.NumberFormat(locale).format(1234567890), "1.234.567.890");

  const offenders = [];
  for (const path of UI_ROOTS.flatMap(filesUnder)) {
    const source = readFileSync(join(ROOT, path), "utf8");
    if (/(["'])ar-DZ\1/.test(source)) offenders.push(relative(ROOT, path));
  }
  assert.deepEqual(offenders, []);
});


test("date filters use Latin digits while the dashboard date stays Arabic", () => {
  const dashboard = readFileSync(join(ROOT, "client/src/pages/Dashboard.tsx"), "utf8");
  const bridge = readFileSync(
    join(ROOT, "client/src/components/LegacyPageTranslation.tsx"),
    "utf8"
  );
  const css = readFileSync(join(ROOT, "client/src/index.css"), "utf8");

  assert.match(dashboard, /DASHBOARD_DATE_FORMATTER/);
  assert.match(dashboard, /lang="ar-DZ-u-nu-latn"/);
  assert.match(dashboard, /data-translation-lock="true"/);
  assert.match(bridge, /LATIN_DATE_CONTROL_TYPES/);
  assert.match(bridge, /input\.lang = "en-CA"/);
  assert.match(bridge, /input\.dir = "ltr"/);
  assert.match(css, /input\[type="date"\]/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
});
