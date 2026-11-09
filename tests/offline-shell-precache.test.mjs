import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../client/public/sw.js", import.meta.url), "utf8");

test("production build publishes the Vite asset manifest", () => {
  assert.match(vite, /manifest:\s*"asset-manifest\.json"/);
});

test("service worker install precaches every same-origin JavaScript and CSS build chunk", async () => {
  const listeners = new Map();
  const cached = [];
  let skippedWaiting = false;
  const cache = { addAll: async urls => cached.push(...urls) };
  const manifest = {
    "src/main.tsx": { file: "assets/main-a1.js", css: ["assets/main-a1.css"], isEntry: true },
    "src/pages/Attendance.tsx": { file: "assets/attendance-b2.js", css: ["assets/attendance-b2.css"], isDynamicEntry: true },
    "src/pages/Finance.tsx": { file: "assets/finance-c3.js", isDynamicEntry: true },
    "external.js": { file: "https://cdn.example.net/external.js" },
    "image.png": { file: "assets/large-image.png" },
  };
  const context = {
    URL,
    Set,
    Promise,
    caches: { open: async () => cache },
    fetch: async url => {
      assert.equal(url, "/asset-manifest.json");
      return { ok: true, json: async () => manifest };
    },
    self: {
      location: { origin: "https://quranos.example" },
      registration: { scope: "https://quranos.example/" },
      addEventListener: (name, callback) => listeners.set(name, callback),
      skipWaiting: async () => { skippedWaiting = true; },
    },
  };

  runInNewContext(worker, context);
  let installation;
  listeners.get("install")({ waitUntil: promise => { installation = promise; } });
  await installation;

  assert.deepEqual(cached.sort(), [
    "/.??",
    "https://quranos.example/assets/attendance-b2.css",
    "https://quranos.example/assets/attendance-b2.js",
    "https://quranos.example/assets/finance-c3.js",
    "https://quranos.example/assets/main-a1.css",
    "https://quranos.example/assets/main-a1.js",
  ].filter(value => value !== "/.??").sort());
  assert.equal(skippedWaiting, true);
  assert.equal(cached.some(url => url.includes("external.js")), false);
  assert.equal(cached.some(url => url.includes("large-image.png")), false);
});

test("large public documents are not forced into the install-time cache", () => {
  assert.match(worker, /large public files remain\s+runtime\/on-demand/);
  assert.doesNotMatch(worker, /\.pdf\$\//i);
});
