import { RATE_LIMIT } from "../shared/quota";

const WINDOW_MS = 60_000;

export async function checkRateLimit(
  db: D1Database,
  key: string,
  limit: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = Date.now();
  const row = await db
    .prepare(`SELECT count, window_start FROM rate_limits WHERE key = ?`)
    .bind(key)
    .first<{ count: number; window_start: number }>();

  if (!row || now - row.window_start >= WINDOW_MS) {
    await db
      .prepare(
        `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      )
      .bind(key, now)
      .run();
    return { ok: true };
  }

  if (row.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((row.window_start + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  await db.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).bind(key).run();
  return { ok: true };
}

export function authRateKey(ip: string): string {
  return `auth:${ip}`;
}

export function readRateKey(userId: string): string {
  return `read:${userId}`;
}

export function writeRateKey(userId: string): string {
  return `write:${userId}`;
}

export { RATE_LIMIT };
