import assert from "node:assert/strict";
import test from "node:test";
import {
  getQuranDivisionBoundaries,
  getQuranDivisionForAyah,
  getQuranDivisionsForRange,
} from "../client/src/lib/quran-divisions.ts";

test("ships complete, contiguous juz and hizb metadata sets", () => {
  assert.equal(getQuranDivisionBoundaries("juz").length, 30);
  assert.equal(getQuranDivisionBoundaries("hizb").length, 60);
  assert.deepEqual(getQuranDivisionForAyah("juz", 1, 1), 1);
  assert.deepEqual(getQuranDivisionForAyah("hizb", 1, 1), 1);
  assert.deepEqual(getQuranDivisionForAyah("juz", 2, 142), 2);
  assert.deepEqual(getQuranDivisionForAyah("hizb", 2, 75), 2);
});

test("splits a memorization range across the actual juz and hizb boundaries", () => {
  assert.deepEqual(getQuranDivisionsForRange("juz", 2, 140, 145), [1, 2]);
  assert.deepEqual(getQuranDivisionsForRange("hizb", 2, 73, 77), [1, 2]);
});

test("rejects invalid surah and ayah ranges without inventing a division", () => {
  assert.equal(getQuranDivisionForAyah("juz", 115, 1), null);
  assert.deepEqual(getQuranDivisionsForRange("hizb", 2, 0, 4), []);
});
