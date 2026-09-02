import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { GraphExport } from "../shared/types";
import { QUOTA } from "../shared/quota";
import {
  requireScope,
  requireSession,
  requireToken,
  requireUser,
  type AuthVariables,
} from "./auth";
import { createAuth } from "./better-auth";
import {
  cascadeSelect,
  createBatch,
  createEdge,
  createGraph,
  createNode,
  deleteEdge,
  deleteGraph,
  deleteNodes,
  deleteUserAccount,
  formatGraphLayout,
  getGraphDetail,
  getNode,
  importGraph,
  listGraphs,
  listGraphsUpdatedSince,
  ownsGraph,
  purgeExpiredTrash,
  purgeGraph,
  quotaUsage,
  renameGraph,
  replaceGraphContents,
  restoreGraph,
  restoreNodes,
  searchNodes,
  updateEdge,
  updateNode,
} from "./db";
import type { Bindings } from "./env";
import {
  deleteGraphExports,
  deleteUserExports,
  getGraphExport,
  listGraphExports,
  putGraphExport,
} from "./exports";
import {
  RATE_LIMIT,
  authRateKey,
  checkRateLimit,
  exportRateKey,
  ipRateKey,
  readRateKey,
  searchRateKey,
  writeRateKey,
} from "./rate-limit";
import { createApiToken, deleteApiToken, listApiTokens } from "./tokens";
import {
  parseBatchBody,
  parseCascadeSelectBody,
  parseCreateEdgeBody,
  parseCreateNodeBody,
  parseCreateTokenBody,
  parseDeleteNodesBody,
  parseGraphTitleBody,
  parseImportBody,
  parseRestoreNodesBody,
  parseSearchQuery,
  parseUpdateEdgeBody,
  parseUpdateNodeBody,
  readJsonBody,
  type ParseResult,
} from "./validate";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json({ error: "internal error" }, 500);
});

app.notFound((c) => c.json({ error: "not found" }, 404));

function badRequest(
  c: { json: (data: unknown, status: ContentfulStatusCode) => Response },
  message: string,
) {
  return c.json({ error: message }, 400);
}

function invalidBody(c: Context<AppEnv>, parsed: { error: string; status: 400 | 413 }) {
  return c.json({ error: parsed.error }, parsed.status);
}

/** Reads and validates the JSON body in one step; returns a Response on failure. */
async function parseBody<T>(
  c: Context<AppEnv>,
  parse: (raw: unknown) => ParseResult<T>,
  maxBytes?: number,
): Promise<{ value: T } | { response: Response }> {
  const raw = await readJsonBody(c.req, maxBytes);
  if (!raw.ok) return { response: invalidBody(c, raw) };
  const parsed = parse(raw.value);
  if (!parsed.ok) return { response: invalidBody(c, parsed) };
  return { value: parsed.value };
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
}

function rateLimited(c: Context<AppEnv>, retryAfterSec: number) {
  c.header("Retry-After", String(retryAfterSec));
  return c.json({ error: "rate limited" }, 429);
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/auth/*", async (c, next) => {
  const limited = await checkRateLimit(
    c.env.DB,
    authRateKey(clientIp(c)),
    RATE_LIMIT.authPerMinute,
  );
  if (!limited.ok) {
    return rateLimited(c, limited.retryAfterSec);
  }
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

const api = new Hono<AppEnv>();
// IP throttle runs before authentication so unauthenticated floods cannot
// hammer session/token lookups without ever hitting a limit.
api.use("*", async (c, next) => {
  const limited = await checkRateLimit(
    c.env.DB,
    ipRateKey(clientIp(c)),
    RATE_LIMIT.requestsPerIpPerMinute,
  );
  if (!limited.ok) return rateLimited(c, limited.retryAfterSec);
  await next();
});
api.use("*", requireUser);
api.use("*", async (c, next) => {
  const read = c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS";
  const limited = await checkRateLimit(
    c.env.DB,
    read ? readRateKey(c.get("userId")) : writeRateKey(c.get("userId")),
    read ? RATE_LIMIT.readPerMinute : RATE_LIMIT.writePerMinute,
  );
  if (!limited.ok) return rateLimited(c, limited.retryAfterSec);
  await next();
});

api.get("/me", requireScope("graph:read"), async (c) => {
  const userId = c.get("userId");
  let user = c.get("user");
  if (!user) {
    const row = await c.env.DB.prepare(`SELECT id, name, email, image FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ id: string; name: string; email: string; image: string | null }>();
    if (!row) return c.json({ error: "unauthorized" }, 401);
    user = { ...row, image: row.image ?? null };
  }
  // Token callers learn their scopes here instead of discovering a read-only
  // key through a 403 on their first write.
  const token = c.get("authMethod") === "token" ? { scopes: c.get("tokenScopes") } : undefined;
  return c.json({ authenticated: true, user, ...(token ? { token } : {}) });
});

api.get("/graphs", requireScope("graph:read"), async (c) => {
  const scope = c.req.query("trash") === "1" ? "trash" : "live";
  return c.json({ graphs: await listGraphs(c.env.DB, c.get("userId"), scope) });
});

api.get("/search", requireScope("graph:read"), async (c) => {
  const query = parseSearchQuery(c.req.query("q"));
  if (!query.ok) return invalidBody(c, query);
  // Every search scans the user's cards; its own budget keeps a busy search
  // box from starving ordinary reads.
  const limited = await checkRateLimit(
    c.env.DB,
    searchRateKey(c.get("userId")),
    RATE_LIMIT.searchPerMinute,
  );
  if (!limited.ok) return rateLimited(c, limited.retryAfterSec);
  return c.json({ hits: await searchNodes(c.env.DB, c.get("userId"), query.value) });
});

api.post("/graphs", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseGraphTitleBody);
  if ("response" in body) return body.response;
  const title = body.value.title?.trim() || "Untitled note";
  const result = await createGraph(c.env.DB, c.get("userId"), title, { withRootNode: true });
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result, 201);
});

api.post("/graphs/import", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseImportBody, QUOTA.maxImportBytes);
  if ("response" in body) return body.response;
  const result = await importGraph(c.env.DB, c.get("userId"), body.value);
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result, 201);
});

api.get("/graphs/:graphId", requireScope("graph:read"), async (c) => {
  const detail = await getGraphDetail(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!detail) return c.json({ error: "not found" }, 404);
  return c.json(detail);
});

api.patch("/graphs/:graphId", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseGraphTitleBody);
  if ("response" in body) return body.response;
  const title = body.value.title?.trim();
  if (!title) return badRequest(c, "title required");
  const graph = await renameGraph(c.env.DB, c.get("userId"), c.req.param("graphId"), title);
  if (!graph) return c.json({ error: "not found" }, 404);
  return c.json({ graph });
});

api.delete("/graphs/:graphId", requireScope("graph:write"), async (c) => {
  const userId = c.get("userId");
  const graphId = c.req.param("graphId");
  if (c.req.query("purge") === "1") {
    const ok = await purgeGraph(c.env.DB, userId, graphId);
    if (!ok) return c.json({ error: "not found" }, 404);
    await deleteGraphExports(c.env.EXPORTS, userId, graphId);
    return c.json({ ok: true });
  }
  const result = await deleteGraph(c.env.DB, userId, graphId);
  if (!result.ok) return c.json({ error: "not found" }, 404);
  for (const evicted of result.evicted) {
    await deleteGraphExports(c.env.EXPORTS, evicted.owner_id, evicted.id);
  }
  return c.json({ ok: true });
});

api.post("/graphs/:graphId/restore", requireScope("graph:write"), async (c) => {
  const graph = await restoreGraph(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!graph) return c.json({ error: "not found" }, 404);
  if ("error" in graph) return badRequest(c, graph.error);
  return c.json({ graph });
});

api.post("/graphs/:graphId/import", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseImportBody, QUOTA.maxImportBytes);
  if ("response" in body) return body.response;
  const result = await replaceGraphContents(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    body.value,
  );
  if (!result) return c.json({ error: "not found" }, 404);
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result);
});

api.post("/graphs/:graphId/batch", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseBatchBody, QUOTA.maxBatchBytes);
  if ("response" in body) return body.response;
  const result = await createBatch(c.env.DB, c.get("userId"), c.req.param("graphId"), body.value);
  if (!result) return c.json({ error: "not found" }, 404);
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result, 201);
});

api.post("/graphs/:graphId/nodes", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseCreateNodeBody);
  if ("response" in body) return body.response;
  const node = await createNode(c.env.DB, c.get("userId"), c.req.param("graphId"), body.value);
  if (!node) return c.json({ error: "not found" }, 404);
  if ("error" in node) return badRequest(c, node.error);
  return c.json({ node }, 201);
});

api.get("/graphs/:graphId/nodes/:nodeId", requireScope("graph:read"), async (c) => {
  const node = await getNode(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    c.req.param("nodeId"),
  );
  if (!node) return c.json({ error: "not found" }, 404);
  return c.json({ node });
});

api.patch("/graphs/:graphId/nodes/:nodeId", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseUpdateNodeBody);
  if ("response" in body) return body.response;
  // `If-Match: <updated_at>` makes the write conditional: a card edited
  // elsewhere since the client last read it comes back as 412 with the
  // current record instead of being overwritten. `*` and weak tags mean
  // "whatever is there", i.e. unconditional.
  const rawIfMatch = c.req.header("if-match")?.trim();
  const ifMatch =
    rawIfMatch && rawIfMatch !== "*"
      ? rawIfMatch.replace(/^W\//i, "").replace(/^"|"$/g, "")
      : undefined;
  const node = await updateNode(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    c.req.param("nodeId"),
    body.value,
    ifMatch ? { ifMatch } : {},
  );
  if (!node) return c.json({ error: "not found" }, 404);
  if ("conflict" in node) return c.json({ error: "conflict", node: node.current }, 412);
  if ("error" in node) return badRequest(c, node.error);
  return c.json({ node });
});

api.post("/graphs/:graphId/nodes/delete", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseDeleteNodesBody);
  if ("response" in body) return body.response;
  const result = await deleteNodes(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    body.value.ids,
    body.value.cascade,
  );
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

api.post("/graphs/:graphId/nodes/restore", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseRestoreNodesBody);
  if ("response" in body) return body.response;
  const result = await restoreNodes(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    body.value.nodeIds,
    body.value.edgeIds,
  );
  if (!result) return c.json({ error: "not found" }, 404);
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result);
});

api.patch("/graphs/:graphId/edges/:edgeId", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseUpdateEdgeBody);
  if ("response" in body) return body.response;
  const edge = await updateEdge(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    c.req.param("edgeId"),
    body.value,
  );
  if (!edge) return c.json({ error: "not found" }, 404);
  return c.json({ edge });
});

api.post("/graphs/:graphId/edges", requireScope("graph:write"), async (c) => {
  const body = await parseBody(c, parseCreateEdgeBody);
  if ("response" in body) return body.response;
  const edge = await createEdge(c.env.DB, c.get("userId"), c.req.param("graphId"), body.value);
  if (!edge) return c.json({ error: "not found" }, 404);
  if ("error" in edge) return badRequest(c, edge.error);
  return c.json({ edge }, 201);
});

api.delete("/graphs/:graphId/edges/:edgeId", requireScope("graph:write"), async (c) => {
  const ok = await deleteEdge(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    c.req.param("edgeId"),
  );
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

api.post("/graphs/:graphId/cascade-select", requireScope("graph:read"), async (c) => {
  const body = await parseBody(c, parseCascadeSelectBody);
  if ("response" in body) return body.response;
  const result = await cascadeSelect(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    body.value.nodeIds,
    body.value.mode,
  );
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

api.post("/graphs/:graphId/fmt", requireScope("graph:write"), async (c) => {
  const detail = await formatGraphLayout(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!detail) return c.json({ error: "not found" }, 404);
  return c.json(detail);
});

api.post("/graphs/:graphId/export", requireScope("graph:export"), async (c) => {
  const detail = await getGraphDetail(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!detail) return c.json({ error: "not found" }, 404);
  // After the ownership check, so 404s cannot burn the hourly budget.
  const limited = await checkRateLimit(
    c.env.DB,
    exportRateKey(c.get("userId")),
    QUOTA.maxExportsPerHour,
    60 * 60 * 1000,
  );
  if (!limited.ok) return rateLimited(c, limited.retryAfterSec);
  const payload: GraphExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    graph: detail.graph,
    nodes: detail.nodes,
    edges: detail.edges,
  };
  const r2Key = await putGraphExport(c.env.EXPORTS, c.get("userId"), payload);
  return c.json({ export: payload, r2Key });
});

// Backups stay reachable while the note sits in the trash, so restoring the
// note and then a backup is always possible.
api.get("/graphs/:graphId/exports", requireScope("graph:export"), async (c) => {
  if (!(await ownsGraph(c.env.DB, c.get("userId"), c.req.param("graphId")))) {
    return c.json({ error: "not found" }, 404);
  }
  const exports = await listGraphExports(c.env.EXPORTS, c.get("userId"), c.req.param("graphId"));
  return c.json({ exports });
});

api.get("/graphs/:graphId/exports/:name", requireScope("graph:export"), async (c) => {
  if (!(await ownsGraph(c.env.DB, c.get("userId"), c.req.param("graphId")))) {
    return c.json({ error: "not found" }, 404);
  }
  const body = await getGraphExport(
    c.env.EXPORTS,
    c.get("userId"),
    c.req.param("graphId"),
    c.req.param("name"),
  );
  if (body === null) return c.json({ error: "not found" }, 404);
  return c.body(body, 200, { "Content-Type": "application/json; charset=utf-8" });
});

api.get("/tokens", requireSession, async (c) =>
  c.json({ tokens: await listApiTokens(c.env.DB, c.get("userId")) }),
);

api.post("/tokens", requireSession, async (c) => {
  const body = await parseBody(c, parseCreateTokenBody);
  if ("response" in body) return body.response;
  const result = await createApiToken(
    c.env.DB,
    c.get("userId"),
    body.value.name ?? "My device",
    body.value.access,
  );
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result, 201);
});

api.delete("/tokens/:tokenId", requireSession, async (c) => {
  const ok = await deleteApiToken(c.env.DB, c.get("userId"), c.req.param("tokenId"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

api.delete("/token", requireToken, async (c) => {
  const tokenId = c.get("tokenId");
  if (!tokenId) return c.json({ error: "API token required" }, 403);
  const ok = await deleteApiToken(c.env.DB, c.get("userId"), tokenId);
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

api.delete("/account", requireSession, async (c) => {
  const raw = await readJsonBody(c.req);
  const confirmation =
    raw.ok && typeof raw.value === "object" && raw.value !== null
      ? (raw.value as { confirmation?: unknown }).confirmation
      : undefined;
  if (confirmation !== "DELETE MY ACCOUNT") {
    return badRequest(c, "account deletion confirmation required");
  }
  const userId = c.get("userId");
  // R2 first: if it fails the account is untouched and the user can retry.
  // D1 last and in one transaction, so a login can never survive with its
  // notes half-deleted, and no orphaned exports outlive the account.
  await deleteUserExports(c.env.EXPORTS, userId);
  await deleteUserAccount(c.env.DB, userId);
  return c.json({ ok: true });
});

api.get("/quota", requireScope("graph:read"), async (c) => {
  const userId = c.get("userId");
  const [usage, tokens] = await Promise.all([
    quotaUsage(c.env.DB, userId),
    listApiTokens(c.env.DB, userId),
  ]);
  return c.json({ quota: QUOTA, usage: { ...usage, tokens: tokens.length } });
});

app.route("/api", api);

/**
 * Snapshots notes edited since the previous run. One graph costs several
 * subrequests (D1 reads, R2 put, prune), so a run is capped well under the
 * Workers subrequest limit; a failing graph is logged and skipped rather than
 * aborting the rest of the night's backups.
 */
export const BACKUP_BATCH_LIMIT = 120;

export async function backupRecentGraphs(env: Bindings, now = Date.now()): Promise<number> {
  const since = new Date(now - 25 * 60 * 60 * 1000).toISOString();
  const graphs = await listGraphsUpdatedSince(env.DB, since, BACKUP_BATCH_LIMIT);
  let saved = 0;
  for (const { id, owner_id } of graphs) {
    try {
      const detail = await getGraphDetail(env.DB, owner_id, id);
      if (!detail) continue;
      await putGraphExport(
        env.EXPORTS,
        owner_id,
        {
          version: 1,
          exportedAt: new Date(now).toISOString(),
          graph: detail.graph,
          nodes: detail.nodes,
          edges: detail.edges,
        },
        "auto",
      );
      saved += 1;
    } catch (err) {
      console.error("backup failed", id, err);
    }
  }
  return saved;
}

async function scheduled(_event: ScheduledController, env: Bindings): Promise<void> {
  const staleWindowStart = Date.now() - 2 * 60 * 60 * 1000;
  await env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?`)
    .bind(staleWindowStart)
    .run();
  await env.DB.prepare(`DELETE FROM api_tokens WHERE expires_at < ?`)
    .bind(new Date().toISOString())
    .run();
  const purged = await purgeExpiredTrash(env.DB);
  for (const graph of purged) {
    await deleteGraphExports(env.EXPORTS, graph.owner_id, graph.id);
  }
  await backupRecentGraphs(env);
}

export { app };
export default { fetch: app.fetch, scheduled };
