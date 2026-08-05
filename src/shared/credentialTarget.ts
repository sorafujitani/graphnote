const PRODUCTION_ORIGINS = new Set([
  "https://graphnote.app",
  "https://graphnote.fujitanisora0414.workers.dev",
]);

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function credentialAudience(value: string): string | null {
  const url = parsedUrl(value);
  if (!url) return null;
  if (PRODUCTION_ORIGINS.has(url.origin)) return "graphnote:production";
  return `origin:${url.origin}`;
}

export function isAllowedCredentialTarget(value: string): boolean {
  const url = parsedUrl(value);
  if (!url) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}
