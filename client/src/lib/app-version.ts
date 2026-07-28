declare const __APP_VERSION__: string;

export const APP_VERSION =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim()
    ? __APP_VERSION__.trim()
    : "unknown";

export class StaleAppVersionError extends Error {
  constructor() {
    super("STALE_APP_VERSION");
    this.name = "StaleAppVersionError";
  }
}

export function isStaleAppVersionError(
  error: unknown
): error is StaleAppVersionError {
  return error instanceof StaleAppVersionError;
}

function readVersionFromHtml(html: string): string | null {
  return (
    html.match(
      /<meta\s+name=["']app-version["']\s+content=["']([^"']+)["']/i
    )?.[1]?.trim() ?? null
  );
}

export async function assertCurrentAppVersion(
  fetcher: typeof fetch = fetch
): Promise<void> {
  if (APP_VERSION === "unknown") return;

  try {
    const response = await fetcher(
      `/?app-version-check=${encodeURIComponent(APP_VERSION)}-${Date.now()}`,
      {
        cache: "no-store",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
      }
    );
    if (!response.ok) return;

    const latestVersion = readVersionFromHtml(await response.text());
    if (
      latestVersion &&
      latestVersion !== "unknown" &&
      latestVersion !== APP_VERSION
    ) {
      throw new StaleAppVersionError();
    }
  } catch (error) {
    if (isStaleAppVersionError(error)) throw error;
    // Network failures must not block legitimate offline or unstable connections.
  }
}
