import { describe, expect, test } from "vitest";
import {
  APP_VERSION,
  StaleAppVersionError,
  assertCurrentAppVersion,
} from "@/lib/app-version";

const response = (version: string) =>
  Promise.resolve(
    new Response(
      `<html><head><meta name="app-version" content="${version}" /></head></html>`,
      { status: 200 }
    )
  );

describe("application version guard", () => {
  test("accepts the currently loaded build", async () => {
    expect(APP_VERSION).toBe("test123");
    await expect(
      assertCurrentAppVersion(() => response("test123"))
    ).resolves.toBeUndefined();
  });

  test("rejects a stale loaded build before a write", async () => {
    await expect(
      assertCurrentAppVersion(() => response("new4567"))
    ).rejects.toBeInstanceOf(StaleAppVersionError);
  });
});
