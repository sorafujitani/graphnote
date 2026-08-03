import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { GraphExport } from "../shared/types";
import {
	clearSessionCookie,
	createSessionToken,
	requireAuth,
	setSessionCookie,
	verifySessionToken,
} from "./auth";
import {
	cascadeSelect,
	createEdge,
	createGraph,
	createNode,
	deleteEdge,
	deleteGraph,
	deleteNodes,
	getGraphDetail,
	listGraphs,
	renameGraph,
	updateNode,
} from "./db";
import type { Bindings } from "./env";

const app = new Hono<{ Bindings: Bindings }>();

function badRequest(c: { json: (data: unknown, status: ContentfulStatusCode) => Response }, message: string) {
	return c.json({ error: message }, 400);
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/auth/me", async (c) => {
	const token = getCookie(c, "gn_session");
	const ok =
		!!token && (await verifySessionToken(c.env.SESSION_SECRET, token));
	return c.json({ authenticated: ok });
});

app.post("/api/auth/login", async (c) => {
	const body = await c.req.json<{ password?: string }>().catch(() => null);
	if (!body?.password) return badRequest(c, "password required");
	if (body.password !== c.env.APP_PASSWORD) {
		return c.json({ error: "invalid password" }, 401);
	}
	const token = await createSessionToken(c.env.SESSION_SECRET);
	setSessionCookie(c, token);
	return c.json({ ok: true });
});

app.post("/api/auth/logout", (c) => {
	clearSessionCookie(c);
	return c.json({ ok: true });
});

const api = new Hono<{ Bindings: Bindings }>();
api.use("*", requireAuth);

api.get("/graphs", async (c) => {
	const graphs = await listGraphs(c.env.DB);
	return c.json({ graphs });
});

api.post("/graphs", async (c) => {
	const body = await c.req.json<{ title?: string }>().catch(() => null);
	const title = body?.title?.trim() || "Untitled note";
	const graph = await createGraph(c.env.DB, title);
	return c.json({ graph }, 201);
});

api.get("/graphs/:graphId", async (c) => {
	const detail = await getGraphDetail(c.env.DB, c.req.param("graphId"));
	if (!detail) return c.json({ error: "not found" }, 404);
	return c.json(detail);
});

api.patch("/graphs/:graphId", async (c) => {
	const body = await c.req.json<{ title?: string }>().catch(() => null);
	const title = body?.title?.trim();
	if (!title) return badRequest(c, "title required");
	const graph = await renameGraph(c.env.DB, c.req.param("graphId"), title);
	if (!graph) return c.json({ error: "not found" }, 404);
	return c.json({ graph });
});

api.delete("/graphs/:graphId", async (c) => {
	const ok = await deleteGraph(c.env.DB, c.req.param("graphId"));
	if (!ok) return c.json({ error: "not found" }, 404);
	return c.json({ ok: true });
});

api.post("/graphs/:graphId/nodes", async (c) => {
	const body = await c.req
		.json<{ title?: string; body?: string; x?: number; y?: number }>()
		.catch(() => null);
	const node = await createNode(c.env.DB, c.req.param("graphId"), body ?? {});
	if (!node) return c.json({ error: "not found" }, 404);
	return c.json({ node }, 201);
});

api.patch("/graphs/:graphId/nodes/:nodeId", async (c) => {
	const body = await c.req
		.json<{ title?: string; body?: string; x?: number; y?: number }>()
		.catch(() => null);
	if (!body) return badRequest(c, "invalid body");
	const node = await updateNode(
		c.env.DB,
		c.req.param("graphId"),
		c.req.param("nodeId"),
		body,
	);
	if (!node) return c.json({ error: "not found" }, 404);
	return c.json({ node });
});

api.post("/graphs/:graphId/nodes/delete", async (c) => {
	const body = await c.req
		.json<{ ids?: string[]; cascade?: boolean }>()
		.catch(() => null);
	if (!body?.ids?.length) return badRequest(c, "ids required");
	const result = await deleteNodes(
		c.env.DB,
		c.req.param("graphId"),
		body.ids,
		Boolean(body.cascade),
	);
	return c.json(result);
});

api.post("/graphs/:graphId/edges", async (c) => {
	const body = await c.req
		.json<{ source_id?: string; target_id?: string; label?: string }>()
		.catch(() => null);
	if (!body?.source_id || !body?.target_id) {
		return badRequest(c, "source_id and target_id required");
	}
	const edge = await createEdge(c.env.DB, c.req.param("graphId"), {
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
		c.req.param("graphId"),
		body.nodeIds,
		body.mode ?? "outgoing",
	);
	return c.json(result);
});

api.post("/graphs/:graphId/export", async (c) => {
	const detail = await getGraphDetail(c.env.DB, c.req.param("graphId"));
	if (!detail) return c.json({ error: "not found" }, 404);

	const payload: GraphExport = {
		version: 1,
		exportedAt: new Date().toISOString(),
		graph: detail.graph,
		nodes: detail.nodes,
		edges: detail.edges,
	};
	const body = JSON.stringify(payload, null, 2);
	const key = `exports/${detail.graph.id}/${payload.exportedAt.replace(/[:.]/g, "-")}.json`;
	await c.env.EXPORTS.put(key, body, {
		httpMetadata: { contentType: "application/json" },
	});

	return c.json({
		export: payload,
		r2Key: key,
	});
});

app.route("/api", api);

export default app;
