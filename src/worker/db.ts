import type {
	CascadeResult,
	EdgeRecord,
	Graph,
	GraphDetail,
	NodeRecord,
} from "../shared/types";
import { computeCascade } from "./cascade";

export function nowIso(): string {
	return new Date().toISOString();
}

export async function listGraphs(db: D1Database): Promise<Graph[]> {
	const { results } = await db
		.prepare(
			`SELECT id, title, created_at, updated_at
       FROM graphs
       ORDER BY updated_at DESC`,
		)
		.all<Graph>();
	return results ?? [];
}

export async function getGraph(
	db: D1Database,
	graphId: string,
): Promise<Graph | null> {
	return (
		(await db
			.prepare(
				`SELECT id, title, created_at, updated_at FROM graphs WHERE id = ?`,
			)
			.bind(graphId)
			.first<Graph>()) ?? null
	);
}

export async function getGraphDetail(
	db: D1Database,
	graphId: string,
): Promise<GraphDetail | null> {
	const graph = await getGraph(db, graphId);
	if (!graph) return null;

	const nodes = await db
		.prepare(
			`SELECT id, graph_id, title, body, x, y, created_at, updated_at
       FROM nodes WHERE graph_id = ?`,
		)
		.bind(graphId)
		.all<NodeRecord>();

	const edges = await db
		.prepare(
			`SELECT id, graph_id, source_id, target_id, label, created_at
       FROM edges WHERE graph_id = ?`,
		)
		.bind(graphId)
		.all<EdgeRecord>();

	return {
		graph,
		nodes: nodes.results ?? [],
		edges: edges.results ?? [],
	};
}

export async function createGraph(
	db: D1Database,
	title: string,
): Promise<Graph> {
	const id = crypto.randomUUID();
	const ts = nowIso();
	await db
		.prepare(
			`INSERT INTO graphs (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		)
		.bind(id, title, ts, ts)
		.run();
	return { id, title, created_at: ts, updated_at: ts };
}

export async function renameGraph(
	db: D1Database,
	graphId: string,
	title: string,
): Promise<Graph | null> {
	const ts = nowIso();
	const result = await db
		.prepare(`UPDATE graphs SET title = ?, updated_at = ? WHERE id = ?`)
		.bind(title, ts, graphId)
		.run();
	if (!result.meta.changes) return null;
	return getGraph(db, graphId);
}

export async function deleteGraph(
	db: D1Database,
	graphId: string,
): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM graphs WHERE id = ?`)
		.bind(graphId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export async function touchGraph(
	db: D1Database,
	graphId: string,
): Promise<void> {
	await db
		.prepare(`UPDATE graphs SET updated_at = ? WHERE id = ?`)
		.bind(nowIso(), graphId)
		.run();
}

export async function createNode(
	db: D1Database,
	graphId: string,
	input: { title?: string; body?: string; x?: number; y?: number },
): Promise<NodeRecord | null> {
	if (!(await getGraph(db, graphId))) return null;
	const id = crypto.randomUUID();
	const ts = nowIso();
	const node: NodeRecord = {
		id,
		graph_id: graphId,
		title: input.title ?? "Untitled",
		body: input.body ?? "",
		x: input.x ?? 100,
		y: input.y ?? 100,
		created_at: ts,
		updated_at: ts,
	};
	await db
		.prepare(
			`INSERT INTO nodes (id, graph_id, title, body, x, y, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			node.id,
			node.graph_id,
			node.title,
			node.body,
			node.x,
			node.y,
			node.created_at,
			node.updated_at,
		)
		.run();
	await touchGraph(db, graphId);
	return node;
}

export async function updateNode(
	db: D1Database,
	graphId: string,
	nodeId: string,
	input: Partial<Pick<NodeRecord, "title" | "body" | "x" | "y">>,
): Promise<NodeRecord | null> {
	const existing = await db
		.prepare(
			`SELECT id, graph_id, title, body, x, y, created_at, updated_at
       FROM nodes WHERE id = ? AND graph_id = ?`,
		)
		.bind(nodeId, graphId)
		.first<NodeRecord>();
	if (!existing) return null;

	const next: NodeRecord = {
		...existing,
		title: input.title ?? existing.title,
		body: input.body ?? existing.body,
		x: input.x ?? existing.x,
		y: input.y ?? existing.y,
		updated_at: nowIso(),
	};

	await db
		.prepare(
			`UPDATE nodes SET title = ?, body = ?, x = ?, y = ?, updated_at = ?
       WHERE id = ? AND graph_id = ?`,
		)
		.bind(
			next.title,
			next.body,
			next.x,
			next.y,
			next.updated_at,
			nodeId,
			graphId,
		)
		.run();
	await touchGraph(db, graphId);
	return next;
}

export async function listEdges(
	db: D1Database,
	graphId: string,
): Promise<EdgeRecord[]> {
	const { results } = await db
		.prepare(
			`SELECT id, graph_id, source_id, target_id, label, created_at
       FROM edges WHERE graph_id = ?`,
		)
		.bind(graphId)
		.all<EdgeRecord>();
	return results ?? [];
}

export async function cascadeSelect(
	db: D1Database,
	graphId: string,
	seedNodeIds: string[],
	mode: "outgoing" | "both" = "outgoing",
): Promise<CascadeResult> {
	const edges = await listEdges(db, graphId);
	return computeCascade(edges, seedNodeIds, mode);
}

export async function deleteNodes(
	db: D1Database,
	graphId: string,
	nodeIds: string[],
	cascade: boolean,
): Promise<{ deletedNodeIds: string[]; deletedEdgeIds: string[] }> {
	if (nodeIds.length === 0) {
		return { deletedNodeIds: [], deletedEdgeIds: [] };
	}

	let targets = [...new Set(nodeIds)];
	let edgeIds: string[] = [];

	if (cascade) {
		const result = await cascadeSelect(db, graphId, targets, "outgoing");
		targets = result.nodeIds;
		edgeIds = result.edgeIds;
	} else {
		const edges = await listEdges(db, graphId);
		edgeIds = edges
			.filter(
				(edge) =>
					targets.includes(edge.source_id) || targets.includes(edge.target_id),
			)
			.map((edge) => edge.id);
	}

	const statements = [
		...edgeIds.map((id) =>
			db.prepare(`DELETE FROM edges WHERE id = ? AND graph_id = ?`).bind(id, graphId),
		),
		...targets.map((id) =>
			db.prepare(`DELETE FROM nodes WHERE id = ? AND graph_id = ?`).bind(id, graphId),
		),
	];

	if (statements.length > 0) {
		await db.batch(statements);
		await touchGraph(db, graphId);
	}

	return { deletedNodeIds: targets, deletedEdgeIds: edgeIds };
}

export async function createEdge(
	db: D1Database,
	graphId: string,
	input: { source_id: string; target_id: string; label?: string },
): Promise<EdgeRecord | null> {
	if (input.source_id === input.target_id) return null;

	const source = await db
		.prepare(`SELECT id FROM nodes WHERE id = ? AND graph_id = ?`)
		.bind(input.source_id, graphId)
		.first();
	const target = await db
		.prepare(`SELECT id FROM nodes WHERE id = ? AND graph_id = ?`)
		.bind(input.target_id, graphId)
		.first();
	if (!source || !target) return null;

	const id = crypto.randomUUID();
	const ts = nowIso();
	try {
		await db
			.prepare(
				`INSERT INTO edges (id, graph_id, source_id, target_id, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				graphId,
				input.source_id,
				input.target_id,
				input.label ?? "",
				ts,
			)
			.run();
	} catch {
		return null;
	}
	await touchGraph(db, graphId);
	return {
		id,
		graph_id: graphId,
		source_id: input.source_id,
		target_id: input.target_id,
		label: input.label ?? "",
		created_at: ts,
	};
}

export async function deleteEdge(
	db: D1Database,
	graphId: string,
	edgeId: string,
): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM edges WHERE id = ? AND graph_id = ?`)
		.bind(edgeId, graphId)
		.run();
	if ((result.meta.changes ?? 0) > 0) {
		await touchGraph(db, graphId);
		return true;
	}
	return false;
}
