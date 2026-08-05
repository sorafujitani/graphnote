import type { ApiTokenAccess, ApiTokenMeta, ApiTokenScope } from "../shared/types";
import { QUOTA } from "../shared/quota";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const TOKEN_SCOPES = new Set<ApiTokenScope>(["graph:read", "graph:write", "graph:export"]);

type ApiTokenRow = {
  id: string;
  user_id: string;
  name: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};

export type ApiTokenPrincipal = {
  tokenId: string;
  userId: string;
  scopes: ApiTokenScope[];
};

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

export function accessScopes(access: ApiTokenAccess): ApiTokenScope[] {
  return access === "read" ? ["graph:read"] : ["graph:read", "graph:write", "graph:export"];
}

export function parseTokenScopes(value: string): ApiTokenScope[] {
  return value
    .split(/\s+/)
    .filter((scope): scope is ApiTokenScope => TOKEN_SCOPES.has(scope as ApiTokenScope));
}

export function tokenIsExpired(expiresAt: string, now = Date.now()): boolean {
  const expires = Date.parse(expiresAt);
  return !Number.isFinite(expires) || expires <= now;
}

function toMeta(row: Omit<ApiTokenRow, "user_id">): ApiTokenMeta {
  return {
    id: row.id,
    name: row.name,
    scopes: parseTokenScopes(row.scopes),
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
  };
}

export async function listApiTokens(db: D1Database, userId: string): Promise<ApiTokenMeta[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, scopes, created_at, last_used_at, expires_at FROM api_tokens
       WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<Omit<ApiTokenRow, "user_id">>();
  return (results ?? []).map(toMeta);
}

export async function createApiToken(
  db: D1Database,
  userId: string,
  name: string,
  access: ApiTokenAccess,
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
  const scopes = accessScopes(access);
  const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO api_tokens
         (id, user_id, token_hash, name, scopes, created_at, last_used_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(id, userId, tokenHash, trimmed, scopes.join(" "), created_at, expires_at)
    .run();
  return {
    token,
    meta: { id, name: trimmed, scopes, created_at, last_used_at: null, expires_at },
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

export async function resolveApiToken(
  db: D1Database,
  bearer: string,
): Promise<ApiTokenPrincipal | null> {
  if (!bearer.startsWith("gqn_")) return null;
  const tokenHash = await sha256Hex(bearer);
  const row = await db
    .prepare(`SELECT id, user_id, scopes, expires_at FROM api_tokens WHERE token_hash = ?`)
    .bind(tokenHash)
    .first<Pick<ApiTokenRow, "id" | "user_id" | "scopes" | "expires_at">>();
  if (!row || tokenIsExpired(row.expires_at)) return null;
  const usedAt = nowIso();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db
    .prepare(
      `UPDATE api_tokens SET last_used_at = ?
       WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)`,
    )
    .bind(usedAt, row.id, staleBefore)
    .run();
  return { tokenId: row.id, userId: row.user_id, scopes: parseTokenScopes(row.scopes) };
}
