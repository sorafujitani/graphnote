import type { ApiTokenMeta } from "../shared/types";
import { QUOTA } from "../shared/quota";

function nowIso(): string {
  return new Date().toISOString();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `gqn_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function listApiTokens(db: D1Database, userId: string): Promise<ApiTokenMeta[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, created_at, last_used_at FROM api_tokens
       WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<ApiTokenMeta>();
  return results ?? [];
}

export async function createApiToken(
  db: D1Database,
  userId: string,
  name: string,
): Promise<{ token: string; meta: ApiTokenMeta } | { error: string }> {
  const trimmed = name.trim().slice(0, QUOTA.maxTokenNameChars) || "My device";
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?`)
    .bind(userId)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= QUOTA.maxApiTokensPerUser) {
    return { error: `token limit (${QUOTA.maxApiTokensPerUser})` };
  }
  const id = crypto.randomUUID();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const created_at = nowIso();
  await db
    .prepare(
      `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .bind(id, userId, tokenHash, trimmed, created_at)
    .run();
  return {
    token,
    meta: { id, name: trimmed, created_at, last_used_at: null },
  };
}

export async function deleteApiToken(
  db: D1Database,
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM api_tokens WHERE id = ? AND user_id = ?`)
    .bind(tokenId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function resolveApiTokenUserId(
  db: D1Database,
  bearer: string,
): Promise<string | null> {
  if (!bearer.startsWith("gqn_")) return null;
  const tokenHash = await sha256Hex(bearer);
  const row = await db
    .prepare(`SELECT id, user_id FROM api_tokens WHERE token_hash = ?`)
    .bind(tokenHash)
    .first<{ id: string; user_id: string }>();
  if (!row) return null;
  await db
    .prepare(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`)
    .bind(nowIso(), row.id)
    .run();
  return row.user_id;
}
