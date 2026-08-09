import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../client/src/pages/ResetPassword.tsx", import.meta.url),
  "utf8"
);

test("successful password recovery returns through role-aware post-login routing", () => {
  assert.match(source, /clearPasswordRecovery\(\);\s*setLocation\("\/post-login"\);/s);
  assert.doesNotMatch(
    source,
    /clearPasswordRecovery\(\);\s*setLocation\("\/dashboard"\);/s
  );
});
