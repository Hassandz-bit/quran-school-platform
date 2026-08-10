import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PWA manifest exposes the minimum install contract", async () => {
  const manifest = JSON.parse(await read("client/public/manifest.webmanifest"));

  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.name);
  assert.ok(manifest.short_name);

  const sizes = new Set(manifest.icons.map(icon => icon.sizes));
  assert.ok(sizes.has("192x192"));
  assert.ok(sizes.has("512x512"));
  assert.ok(manifest.icons.some(icon => icon.src === "/pwa-icon-192.svg"));
  assert.ok(manifest.icons.some(icon => icon.src === "/pwa-icon.svg"));
  assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
});

test("PWA icons declare intrinsic dimensions for browser install surfaces", async () => {
  const icon192 = await read("client/public/pwa-icon-192.svg");
  const icon512 = await read("client/public/pwa-icon.svg");
  const maskable = await read("client/public/pwa-icon-maskable.svg");

  assert.match(icon192, /width="192" height="192"/);
  assert.match(icon512, /width="512" height="512"/);
  assert.match(maskable, /width="512" height="512"/);
});

test("HTML advertises QuranOS manifest, favicon, and mobile presentation", async () => {
  const html = await read("client/index.html");

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="icon" href="\/pwa-icon\.svg" type="image\/svg\+xml"/);
  assert.match(html, /name="theme-color" content="#0B4738"/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
});

test("service worker and real install prompt are wired from the app", async () => {
  const main = await read("client/src/main.tsx");
  const helper = await read("client/src/lib/pwa.ts");
  const login = await read("client/src/pages/Login.tsx");

  assert.match(main, /registerPwaServiceWorker\(\)/);
  assert.match(helper, /serviceWorker\.register\("\/sw\.js", \{ scope: "\/" \}\)/);
  assert.match(helper, /beforeinstallprompt/);
  assert.match(helper, /PWA_INSTALL_AVAILABLE_EVENT/);
  assert.match(login, /تثبيت QuranOS على الهاتف/);
  assert.match(login, /canPromptPwaInstall\(\)/);
});

test("service worker stays same-origin and read-only", async () => {
  const worker = await read("client/public/sw.js");

  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /caches\.match\("\/index\.html"\)/);
});
