import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify("test123") },
  resolve: { alias: { "@": path.resolve(root, "client/src") } },
  test: {
    environment: "jsdom",
    globals: true,
    env: {
      // Never let Vitest inherit Vercel/CI Production Supabase credentials.
      // Runtime tests that need data must inject/mock their own client.
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
  },
});
