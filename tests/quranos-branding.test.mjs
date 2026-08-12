import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("primary QuranOS surfaces use the approved mark and descriptor", async () => {
  const [login, shell, parentShell, locale] = await Promise.all([
    read("client/src/pages/Login.tsx"),
    read("client/src/components/AppShell.tsx"),
    read("client/src/components/ParentShell.tsx"),
    read("client/src/lib/locale.ts"),
  ]);

  assert.match(login, /src="\/pwa-icon-192\.svg"/);
  assert.match(login, /منظومة إدارة المدارس القرآنية/);
  assert.match(login, /تنظيم • تعليم • متابعة • إتقان/);
  assert.doesNotMatch(login, /منصة المدرسة القرآنية الذكية/);

  assert.match(shell, /src="\/pwa-icon-192\.svg"/);
  assert.match(shell, /Quran/);
  assert.match(shell, /text-\[#DAAF37\]/);

  assert.match(parentShell, /src="\/pwa-icon-192\.svg"/);
  assert.match(locale, /"brand\.school": "منظومة إدارة المدارس القرآنية"/);
  assert.match(locale, /"brand\.school": "Quran School Management System"/);
});

test("active icon assets use the approved QuranOS palette and no legacy crescent geometry", async () => {
  const [icon, icon192, maskable] = await Promise.all([
    read("client/public/pwa-icon.svg"),
    read("client/public/pwa-icon-192.svg"),
    read("client/public/pwa-icon-maskable.svg"),
  ]);

  for (const source of [icon, icon192, maskable]) {
    assert.match(source, /#0F5132/);
    assert.match(source, /#DAAF37/);
    assert.match(source, /#F7F5EF/);
    assert.match(source, /aria-label="QuranOS"/);
    assert.doesNotMatch(source, /<circle/);
  }
});
