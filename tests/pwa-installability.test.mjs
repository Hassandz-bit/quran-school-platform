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
  assert.ok(manifest.name);
  assert.ok(manifest.short_name);

  const sizes = new Set(manifest.icons.map(icon => icon.sizes));
  assert.ok(sizes.has("192x192"));
  assert.ok(sizes.has("512x512"));
  assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
});

test("HTML advertises the QuranOS manifest and mobile presentation", async () => {
  const html = await read("client/index.html");

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /name="theme-color" content="#0B4738"/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
});

test("service worker is registered from the application entrypoint", async () => {
  const main = await read("client/src/main.tsx");
  const helper = await read("client/src/lib/pwa.ts");

  assert.match(main, /registerPwaServiceWorker\(\)/);
  assert.match(helper, /serviceWorker\.register\("\/sw\.js", \{ scope: "\/" \}\)/);
});

test("service worker stays same-origin and read-only", async () => {
  const worker = await read("client/public/sw.js");

  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /caches\.match\("\/index\.html"\)/);
});
