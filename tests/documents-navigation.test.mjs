import assert from "node:assert/strict";
import test from "node:test";
import { getAppNavigation } from "../client/src/lib/app-navigation.ts";

test("documents navigation follows exact access instead of role-name assumptions", () => {
  const customGrant = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["teacher"],
    canViewDocuments: true,
    locale: "en",
  });
  assert.equal(customGrant.some(item => item.id === "documents"), true);

  const revokedRegistrar = getAppNavigation({
    isSchoolAdmin: false,
    activeRoleCodes: ["registrar"],
    canViewDocuments: false,
  });
  assert.equal(revokedRegistrar.some(item => item.id === "documents"), false);
});
