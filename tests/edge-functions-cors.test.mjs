import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [studentHandler, studentClient] = await Promise.all([
  read("supabase/functions/import-students/handler.ts"),
  read("client/src/lib/student-import.ts"),
]);

const assertBrowserCorsContract = (source, label) => {
  assert.match(
    source,
    /import \{ corsHeaders \} from "npm:@supabase\/supabase-js@2\.110\.7\/cors";/,
    `${label} must use the Supabase SDK browser CORS contract`,
  );
  assert.match(source, /request\.method === "OPTIONS"/, `${label} must answer browser preflight`);
  assert.match(source, /headers: corsHeaders/, `${label} preflight must return CORS headers`);
  assert.match(source, /\.\.\.corsHeaders/, `${label} JSON responses must retain CORS headers`);
};

test("the remaining browser-invoked Edge Function implements preflight and response CORS", () => {
  assert.match(studentClient, /functions\.invoke\("import-students"/);
  assertBrowserCorsContract(studentHandler, "import-students");
});
