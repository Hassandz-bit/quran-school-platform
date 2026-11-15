export function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const item of (value ?? "").split(",")) {
    const trimmed = item.trim();
    if (!trimmed || trimmed === "*") continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.origin === trimmed && !parsed.username && !parsed.password) origins.add(parsed.origin);
    } catch {
      // Invalid entries remain denied.
    }
  }
  return origins;
}

export function isAllowedOrigin(origin: string | null, allowedOrigins: Set<string>): boolean {
  return origin === null || allowedOrigins.has(origin);
}

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function getBearerToken(header: string | null): string {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new Error("not_authorized");
  return match[1];
}
