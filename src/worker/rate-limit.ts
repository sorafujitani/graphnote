import { RATE_LIMIT } from "../shared/quota";

const WINDOW_MS = 60_000;

export async function checkRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number = WINDOW_MS,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = Date.now();
  // Single atomic upsert: concurrent requests each get their own counted slot,
  // unlike a read-check-write sequence where they all observe the same count.
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
       RETURNING count, window_start`,
    )
    .bind(key, now, windowMs)
    .first<{ count: number; window_start: number }>();
  if (!row || row.count <= limit) return { ok: true };
  const retryAfterSec = Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000));
  return { ok: false, retryAfterSec };
}

export function authRateKey(ip: string): string {
  return `auth:${ip}`;
}

export function ipRateKey(ip: string): string {
  return `ip:${ip}`;
}

export function readRateKey(userId: string): string {
  return `read:${userId}`;
}

export function writeRateKey(userId: string): string {
  return `write:${userId}`;
}

export function exportRateKey(userId: string): string {
  return `export:${userId}`;
}

export function searchRateKey(userId: string): string {
  return `search:${userId}`;
}

export { RATE_LIMIT };
