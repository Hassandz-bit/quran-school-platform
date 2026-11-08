import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pages = JSON.parse(readFileSync(new URL("../client/src/data/warsh-mushaf-pages.json", import.meta.url), "utf8"));

test("Warsh page index is complete and resolves verse ranges exactly", () => {
  assert.equal(pages.riwayah, "warsh");
  assert.equal(pages.totalPages, 604);
  assert.equal(pages.pages["1"]["1"], 1);
  assert.equal(pages.pages["2"]["255"], 42);
  assert.equal(pages.pages["35"]["19"], 437);
  assert.equal(pages.pages["114"]["6"], 604);
});

test("mushaf preview uses the item metadata endpoint and validates its PDF attachment", () => {
  const component = readFileSync(new URL("../client/src/components/MushafPreviewButton.tsx", import.meta.url), "utf8");
  const individual = readFileSync(new URL("../client/src/pages/Memorization.tsx", import.meta.url), "utf8");
  const group = readFileSync(new URL("../client/src/components/GroupMemorizationEntry.tsx", import.meta.url), "utf8");
  assert.match(component, /main\/get-item\/2790112\/ar\/json/);
  assert.match(component, /Array\.isArray\(item\?\.attachments\)/);
  assert.match(component, /extension_type.*pdf/i);
  assert.match(component, /iframe/);
  assert.match(component, /بتوسط البدل/);
  assert.doesNotMatch(component, /check-attachment/);
  assert.match(individual, /MushafPreviewButton/);
  assert.match(group, /MushafPreviewButton/);
  assert.match(component, /ayahStart/);
  assert.match(component, /ayahEnd/);
});
