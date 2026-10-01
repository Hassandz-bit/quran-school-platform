import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Vite never overrides the Supabase project for any Vercel environment", async () => {
  const config = await read("vite.config.ts");
  const supabase = await read("client/src/lib/supabase.ts");

  assert.doesNotMatch(config, /VERCEL_ENV/);
  assert.doesNotMatch(config, /supabase\.co/);
  assert.doesNotMatch(config, /dexquxtymmoyfzehjicf/);
  assert.doesNotMatch(config, /szwouadewolnctwfjwat/);
  assert.match(supabase, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(supabase, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});
