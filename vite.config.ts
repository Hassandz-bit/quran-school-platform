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

export default defineConfig(() => {
  const appVersion = resolveAppVersion();

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
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
      outDir: path.resolve(import.meta.dirname, "client", "dist"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("/recharts/") || id.includes("/d3-")) {
              return "charts-vendor";
            }
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/") ||
              id.includes("/wouter/")
            ) {
              return "react-vendor";
            }
            if (
              id.includes("/@radix-ui/") ||
              id.includes("/lucide-react/") ||
              id.includes("/sonner/") ||
              id.includes("/cmdk/") ||
              id.includes("/vaul/") ||
              id.includes("/embla-carousel")
            ) {
              return "ui-vendor";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
