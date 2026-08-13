import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getDirection,
  normalizeLocale,
  translate,
} from "../client/src/lib/locale.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("locale helpers only accept supported account locales", () => {
  assert.equal(normalizeLocale("ar"), "ar");
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("fr"), null);
  assert.equal(normalizeLocale(null), null);
  assert.equal(getDirection("ar"), "rtl");
  assert.equal(getDirection("en"), "ltr");
  assert.equal(translate("ar", "nav.settings"), "الإعدادات");
  assert.equal(translate("en", "nav.settings"), "Settings");
});

test("authenticated locale persistence is self-scoped and never uses privileged credentials", () => {
  const source = read("client/src/contexts/LocaleContext.tsx");

  assert.match(source, /\.from\("profiles"\)/);
  assert.match(source, /\.update\(\{ locale \}\)/);
  assert.match(source, /\.eq\("id", user\.id\)/);
  assert.match(source, /\.eq\("status", "active"\)/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("language selection is available only on login and drives every shell", () => {
  const app = read("client/src/App.tsx");
  const parentShell = read("client/src/components/ParentShell.tsx");
  const appShell = read("client/src/components/AppShell.tsx");

  assert.match(app, /<LocaleProvider>/);
  assert.doesNotMatch(app, /path="\/settings"/);
  assert.doesNotMatch(app, /path="\/parent\/settings"/);
  assert.doesNotMatch(parentShell, /setLocation\("\/parent\/settings"\)/);
  assert.match(appShell, /dir=\{direction\}/);
  assert.match(appShell, /locale,/);
});

test("the explicit login locale survives profile loading and is persisted to the account", () => {
  const source = read("client/src/contexts/LocaleContext.tsx");

  assert.match(source, /loginChoiceRef/);
  assert.match(source, /if \(!loginChoiceRef\.current\)/);
  assert.match(source, /\.update\(\{ locale \}\)/);
  assert.match(source, /The explicit login choice still applies locally/);
});

test("internal bilingual pages consume the shared locale without rendering selectors", () => {
  const paths = [
    "client/src/pages/AddStudentForm.tsx",
    "client/src/pages/AddTeacherForm.tsx",
    "client/src/pages/AddClassForm.tsx",
    "client/src/pages/TeachersList.tsx",
    "client/src/pages/ClassesList.tsx",
    "client/src/pages/StudentsList.tsx",
  ];

  for (const path of paths) {
    const source = read(path);
    assert.match(source, /useLocale\(\)/, path);
    assert.doesNotMatch(source, /setLanguage\(/, path);
    assert.doesNotMatch(source, />\s*English\s*</, path);
  }
});

test("login language selector uses the shared locale context instead of page-only state", () => {
  const source = read("client/src/pages/Login.tsx");

  assert.match(source, /useLocale\(\)/);
  assert.match(source, /setLocale\("ar"\)/);
  assert.match(source, /setLocale\("en"\)/);
  assert.doesNotMatch(source, /useState<"ar" \| "en">/);
});
