import { describe, expect, test } from "vitest";

describe("Vitest environment isolation", () => {
  test("forces a local Supabase endpoint and dummy key", () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(
      "test-publishable-key"
    );
  });

  test("never exposes the Production project ref through the test endpoint", () => {
    expect(import.meta.env.VITE_SUPABASE_URL).not.toContain(
      "dexquxtymmoyfzehjicf"
    );
  });
});
