import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig } from "vite";

function resolveAppVersion(): string {
  const rawVersion =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.VITE_APP_VERSION ??
    "unknown";
  const normalized = rawVersion.trim();
  return normalized === "unknown" ? normalized : normalized.slice(0, 7);
}

const V2_PREVIEW_SUPABASE_URL =
  "https://szwouadewolnctwfjwat.supabase.co";
// Supabase publishable keys are intentionally safe to embed in browser builds.
const V2_PREVIEW_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_YVj0Ud3Sy6JYE8XumCLonA_1vCLDUrF";

export default defineConfig(() => {
  const appVersion = resolveAppVersion();
  const isVercelPreview = process.env.VERCEL_ENV === "preview";

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      ...(isVercelPreview
        ? {
            "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
              V2_PREVIEW_SUPABASE_URL
            ),
            "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
              V2_PREVIEW_SUPABASE_PUBLISHABLE_KEY
            ),
          }
        : {}),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "inject-app-version",
        transformIndexHtml(html) {
          return html.replace(
            "</head>",
            `    <meta name="app-version" content="${appVersion}" />\n  </head>`
          );
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    publicDir: path.resolve(import.meta.dirname, "client", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
