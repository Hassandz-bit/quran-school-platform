const originalFetch = globalThis.fetch.bind(globalThis);

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isSupabaseTarget(value: string): boolean {
  try {
    const url = new URL(value);
    const configuredOrigin = import.meta.env.VITE_SUPABASE_URL
      ? new URL(import.meta.env.VITE_SUPABASE_URL).origin
      : null;

    return (
      url.origin === configuredOrigin ||
      url.hostname.endsWith(".supabase.co") ||
      url.hostname.endsWith(".supabase.net")
    );
  } catch {
    return false;
  }
}

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const target = getRequestUrl(input);

  if (isSupabaseTarget(target)) {
    return Promise.reject(
      new Error(
        `Vitest network isolation blocked a live Supabase request: ${target}`
      )
    );
  }

  return originalFetch(input, init);
}) as typeof globalThis.fetch;
