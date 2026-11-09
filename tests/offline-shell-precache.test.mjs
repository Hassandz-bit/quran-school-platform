import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../client/public/sw.js", import.meta.url), "utf8");

test("production build publishes the Vite asset manifest", () => {
  assert.match(vite, /manifest:\\s*true/);
});

test("service worker precaches every same-origin JavaScript and CSS build chunk", () => {
  assert.ok(worker.includes('fetch("/.vite/manifest.json"'));
  assert.match(worker, /Object\\.values\\(manifest\\)/);
  assert.match(worker, /entry\\.file/);
  assert.match(worker, /entry\\.css/);
  assert.ok(worker.includes("/\\\\.(?:m?js|css)$/i"));
  assert.match(worker, /assetUrl\\.origin === self\\.location\\.origin/);
  assert.match(worker, /await cache\\.addAll\\(\\[\\.\\.\\.assets\\]\\)/);
});

test("large public documents are not forced into the install-time cache", () => {
  assert.match(worker, /large public files remain\\s+runtime\\/on-demand/);
  assert.doesNotMatch(worker, /\\.pdf\\$\\//i);
});
