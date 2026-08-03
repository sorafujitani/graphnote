import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { GraphExport } from "../shared/types";
import { QUOTA } from "../shared/quota";
import { requireUser, type AuthVariables } from "./auth";
import { createAuth } from "./better-auth";
import {
  cascadeSelect,
  createEdge,
  createGraph,
  createNode,
  deleteAllUserGraphs,
  deleteAuthUser,
  deleteEdge,
  deleteGraph,
  deleteNodes,
  formatGraphLayout,
  getGraphDetail,
  importGraph,
  listGraphs,
  renameGraph,
  updateNode,
} from "./db";
import type { Bindings } from "./env";
import { deleteUserExports, putGraphExport } from "./exports";
import { RATE_LIMIT, authRateKey, checkRateLimit, writeRateKey } from "./rate-limit";
import { createApiToken, deleteApiToken, listApiTokens } from "./tokens";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

const app = new Hono<AppEnv>();

function badRequest(
  c: { json: (data: unknown, status: ContentfulStatusCode) => Response },
  message: string,
) {
  return c.json({ error: message }, 400);
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/auth/*", async (c, next) => {
  const limited = await checkRateLimit(
    c.env.DB,
    authRateKey(clientIp(c)),
    RATE_LIMIT.authPerMinute,
  );
  if (!limited.ok) {
    return c.json({ error: "rate limited" }, 429);
  }
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

const api = new Hono<AppEnv>();
api.use("*", requireUser);
api.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") {
    await next();
    return;
  }
  const limited = await checkRateLimit(
    c.env.DB,
    writeRateKey(c.get("userId")),
    RATE_LIMIT.writePerMinute,
  );
  if (!limited.ok) {
    return c.json({ error: "rate limited" }, 429);
  }
  await next();
});

api.get("/me", async (c) => {
  const userId = c.get("userId");
  let user = c.get("user");
  if (!user) {
    const row = await c.env.DB.prepare(`SELECT id, name, email, image FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ id: string; name: string; email: string; image: string | null }>();
    if (!row) return c.json({ error: "unauthorized" }, 401);
    user = { ...row, image: row.image ?? null };
  }
  return c.json({ authenticated: true, user });
});

api.get("/graphs", async (c) => c.json({ graphs: await listGraphs(c.env.DB, c.get("userId")) }));

api.post("/graphs", async (c) => {
  const body = await c.req.json<{ title?: string }>().catch(() => null);
  const title = body?.title?.trim() || "Untitled note";
  const result = await createGraph(c.env.DB, c.get("userId"), title, { withRootNode: true });
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result, 201);
});

api.post("/graphs/import", async (c) => {
  const body = await c.req.json<GraphExport>().catch(() => null);
  if (!body) return badRequest(c, "invalid body");
  const result = await importGraph(c.env.DB, c.get("userId"), body);
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result, 201);
});

api.get("/graphs/:graphId", async (c) => {
  const detail = await getGraphDetail(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!detail) return c.json({ error: "not found" }, 404);
  return c.json(detail);
});

api.patch("/graphs/:graphId", async (c) => {
  const body = await c.req.json<{ title?: string }>().catch(() => null);
  const title = body?.title?.trim();
  if (!title) return badRequest(c, "title required");
  const graph = await renameGraph(c.env.DB, c.get("userId"), c.req.param("graphId"), title);
  if (!graph) return c.json({ error: "not found" }, 404);
  return c.json({ graph });
});

api.delete("/graphs/:graphId", async (c) => {
  const ok = await deleteGraph(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

api.post("/graphs/:graphId/nodes", async (c) => {
  const body = await c.req
    .json<{ title?: string; body?: string; x?: number; y?: number }>()
    .catch(() => null);
  const node = await createNode(c.env.DB, c.get("userId"), c.req.param("graphId"), body ?? {});
  if (!node) return c.json({ error: "not found" }, 404);
  if ("error" in node) return badRequest(c, node.error);
  return c.json({ node }, 201);
});

api.patch("/graphs/:graphId/nodes/:nodeId", async (c) => {
  const body = await c.req
    .json<{ title?: string; body?: string; x?: number; y?: number }>()
    .catch(() => null);
  if (!body) return badRequest(c, "invalid body");
  const node = await updateNode(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    c.req.param("nodeId"),
    body,
  );
  if (!node) return c.json({ error: "not found" }, 404);
  if ("error" in node) return badRequest(c, node.error);
  return c.json({ node });
});

api.post("/graphs/:graphId/nodes/delete", async (c) => {
  const body = await c.req.json<{ ids?: string[]; cascade?: boolean }>().catch(() => null);
  if (!body?.ids?.length) return badRequest(c, "ids required");
  const result = await deleteNodes(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    body.ids,
    Boolean(body.cascade),
  );
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

api.post("/graphs/:graphId/edges", async (c) => {
  const body = await c.req
    .json<{ source_id?: string; target_id?: string; label?: string }>()
    .catch(() => null);
  if (!body?.source_id || !body?.target_id) {
    return badRequest(c, "source_id and target_id required");
  }
  const edge = await createEdge(c.env.DB, c.get("userId"), c.req.param("graphId"), {
    source_id: body.source_id,
    target_id: body.target_id,
    label: body.label,
  });
  if (!edge) return badRequest(c, "could not create edge");
  return c.json({ edge }, 201);
});

api.delete("/graphs/:graphId/edges/:edgeId", async (c) => {
  const ok = await deleteEdge(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    c.req.param("edgeId"),
  );
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

api.post("/graphs/:graphId/cascade-select", async (c) => {
  const body = await c.req
    .json<{ nodeIds?: string[]; mode?: "outgoing" | "both" }>()
    .catch(() => null);
  if (!body?.nodeIds?.length) return badRequest(c, "nodeIds required");
  const result = await cascadeSelect(
    c.env.DB,
    c.get("userId"),
    c.req.param("graphId"),
    body.nodeIds,
    body.mode ?? "outgoing",
  );
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

api.post("/graphs/:graphId/fmt", async (c) => {
  const detail = await formatGraphLayout(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!detail) return c.json({ error: "not found" }, 404);
  return c.json(detail);
});

api.post("/graphs/:graphId/export", async (c) => {
  const detail = await getGraphDetail(c.env.DB, c.get("userId"), c.req.param("graphId"));
  if (!detail) return c.json({ error: "not found" }, 404);
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

api.get("/tokens", async (c) => c.json({ tokens: await listApiTokens(c.env.DB, c.get("userId")) }));

api.post("/tokens", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  const result = await createApiToken(c.env.DB, c.get("userId"), body?.name ?? "My device");
  if ("error" in result) return badRequest(c, result.error);
  return c.json(result, 201);
});

api.delete("/tokens/:tokenId", async (c) => {
  const ok = await deleteApiToken(c.env.DB, c.get("userId"), c.req.param("tokenId"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

api.delete("/account", async (c) => {
  const userId = c.get("userId");
  await deleteAllUserGraphs(c.env.DB, userId);
  await deleteUserExports(c.env.EXPORTS, userId);
  await deleteAuthUser(c.env.DB, userId);
  return c.json({ ok: true });
});

api.get("/quota", (c) => c.json({ quota: QUOTA }));

app.route("/api", api);
export default app;
