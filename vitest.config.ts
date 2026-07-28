import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify("test123") },
  resolve: { alias: { "@": path.resolve(root, "client/src") } },
  test: { environment: "jsdom", globals: true },
});
