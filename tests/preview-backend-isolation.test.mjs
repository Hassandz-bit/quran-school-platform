import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Vercel Preview is pinned to the V2-compatible staging backend", async () => {
  const config = await read("vite.config.ts");

  assert.match(config, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(config, /szwouadewolnctwfjwat\.supabase\.co/);
  assert.match(
    config,
    /"import\.meta\.env\.VITE_SUPABASE_URL"/
  );
  assert.match(
    config,
    /"import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY"/
  );
});

test("Production routing remains controlled by Production environment variables", async () => {
  const config = await read("vite.config.ts");

  assert.doesNotMatch(config, /dexquxtymmoyfzehjicf/);
  assert.match(config, /\.\.\.\(isVercelPreview/);
});
