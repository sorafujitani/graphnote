import { layoutTree } from "../shared/layoutTree";
import { estimateNoteHeight } from "../shared/estimateNoteHeight";
import { QUOTA } from "../shared/quota";
import type {
  CascadeResult,
  EdgeRecord,
  Graph,
  GraphDetail,
  GraphExport,
  NodeRecord,
} from "../shared/types";
import { computeCascade } from "./cascade";

function nowIso(): string {
  return new Date().toISOString();
}

async function ownedGraph(db: D1Database, userId: string, graphId: string): Promise<Graph | null> {
  return (
    (await db
      .prepare(
        `SELECT id, owner_id, title, created_at, updated_at
         FROM graphs WHERE id = ? AND owner_id = ?`,
      )
      .bind(graphId, userId)
      .first<Graph>()) ?? null
  );
}

export async function listGraphs(db: D1Database, userId: string): Promise<Graph[]> {
  const { results } = await db
    .prepare(
      `SELECT id, owner_id, title, created_at, updated_at
       FROM graphs WHERE owner_id = ? ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<Graph>();
  return results ?? [];
}

async function countGraphs(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM graphs WHERE owner_id = ?`)
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function countNodes(db: D1Database, graphId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM nodes WHERE graph_id = ?`)
    .bind(graphId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getGraphDetail(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<GraphDetail | null> {
  const graph = await ownedGraph(db, userId, graphId);
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
  userId: string,
  title: string,
  options: { withRootNode?: boolean } = {},
): Promise<GraphDetail | { error: string }> {
  if ((await countGraphs(db, userId)) >= QUOTA.maxGraphsPerUser) {
    return { error: `graph limit (${QUOTA.maxGraphsPerUser})` };
  }
  const safeTitle = title.trim().slice(0, QUOTA.maxTitleChars) || "Untitled note";
  const id = crypto.randomUUID();
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO graphs (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, safeTitle, ts, ts)
    .run();

  if (options.withRootNode !== false) {
    await createNode(db, userId, id, {
      title: safeTitle,
      x: 80,
      y: 200,
    });
  }

  const detail = await getGraphDetail(db, userId, id);
  if (!detail) return { error: "create failed" };
  return detail;
}

export async function renameGraph(
  db: D1Database,
  userId: string,
  graphId: string,
  title: string,
): Promise<Graph | null> {
  const safeTitle = title.trim().slice(0, QUOTA.maxTitleChars);
  if (!safeTitle) return null;
  const ts = nowIso();
  const result = await db
    .prepare(`UPDATE graphs SET title = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
    .bind(safeTitle, ts, graphId, userId)
    .run();
  if (!result.meta.changes) return null;
  return ownedGraph(db, userId, graphId);
}

export async function deleteGraph(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM graphs WHERE id = ? AND owner_id = ?`)
    .bind(graphId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteAllUserGraphs(db: D1Database, userId: string): Promise<string[]> {
  const graphs = await listGraphs(db, userId);
  const ids = graphs.map((g) => g.id);
  if (ids.length === 0) return [];
  await db.prepare(`DELETE FROM graphs WHERE owner_id = ?`).bind(userId).run();
  return ids;
}

async function touchGraph(db: D1Database, graphId: string): Promise<void> {
  await db.prepare(`UPDATE graphs SET updated_at = ? WHERE id = ?`).bind(nowIso(), graphId).run();
}

export async function createNode(
  db: D1Database,
  userId: string,
  graphId: string,
  input: { title?: string; body?: string; x?: number; y?: number },
): Promise<NodeRecord | { error: string } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  if ((await countNodes(db, graphId)) >= QUOTA.maxNodesPerGraph) {
    return { error: `node limit (${QUOTA.maxNodesPerGraph})` };
  }
  const body = (input.body ?? "").slice(0, QUOTA.maxBodyChars);
  const title = (input.title ?? "Untitled").slice(0, QUOTA.maxTitleChars);
  const id = crypto.randomUUID();
  const ts = nowIso();
  const node: NodeRecord = {
    id,
    graph_id: graphId,
    title,
    body,
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

export async function formatGraphLayout(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<GraphDetail | null> {
  const detail = await getGraphDetail(db, userId, graphId);
  if (!detail) return null;
  if (detail.nodes.length === 0) return detail;

  const positions = layoutTree(
    detail.nodes.map((node) => ({
      id: node.id,
      height: estimateNoteHeight(node.title, node.body),
    })),
    detail.edges,
  );
  const ts = nowIso();
  const statements = detail.nodes.flatMap((node) => {
    const pos = positions.get(node.id);
    if (!pos) return [];
    if (pos.x === node.x && pos.y === node.y) return [];
    return [
      db
        .prepare(`UPDATE nodes SET x = ?, y = ?, updated_at = ? WHERE id = ? AND graph_id = ?`)
        .bind(pos.x, pos.y, ts, node.id, graphId),
    ];
  });
  if (statements.length > 0) {
    await db.batch(statements);
    await touchGraph(db, graphId);
  }
  return getGraphDetail(db, userId, graphId);
}

export async function updateNode(
  db: D1Database,
  userId: string,
  graphId: string,
  nodeId: string,
  input: Partial<Pick<NodeRecord, "title" | "body" | "x" | "y">>,
): Promise<NodeRecord | { error: string } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const existing = await db
    .prepare(
      `SELECT id, graph_id, title, body, x, y, created_at, updated_at
       FROM nodes WHERE id = ? AND graph_id = ?`,
    )
    .bind(nodeId, graphId)
    .first<NodeRecord>();
  if (!existing) return null;
  if (input.body !== undefined && input.body.length > QUOTA.maxBodyChars) {
    return { error: `body too long (max ${QUOTA.maxBodyChars})` };
  }
  const next: NodeRecord = {
    ...existing,
    title: input.title !== undefined ? input.title.slice(0, QUOTA.maxTitleChars) : existing.title,
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
    .bind(next.title, next.body, next.x, next.y, next.updated_at, nodeId, graphId)
    .run();
  await touchGraph(db, graphId);
  return next;
}

async function listEdges(db: D1Database, graphId: string): Promise<EdgeRecord[]> {
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
  userId: string,
  graphId: string,
  seedNodeIds: string[],
  mode: "outgoing" | "both" = "outgoing",
): Promise<CascadeResult | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const edges = await listEdges(db, graphId);
  return computeCascade(edges, seedNodeIds, mode);
}

export async function deleteNodes(
  db: D1Database,
  userId: string,
  graphId: string,
  nodeIds: string[],
  cascade: boolean,
): Promise<{ deletedNodeIds: string[]; deletedEdgeIds: string[] } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  if (nodeIds.length === 0) {
    return { deletedNodeIds: [], deletedEdgeIds: [] };
  }
  let targets = [...new Set(nodeIds)];
  let edgeIds: string[] = [];
  if (cascade) {
    const result = await cascadeSelect(db, userId, graphId, targets, "outgoing");
    if (!result) return null;
    targets = result.nodeIds;
    edgeIds = result.edgeIds;
  } else {
    const edges = await listEdges(db, graphId);
    edgeIds = edges
      .filter((edge) => targets.includes(edge.source_id) || targets.includes(edge.target_id))
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
  userId: string,
  graphId: string,
  input: { source_id: string; target_id: string; label?: string },
): Promise<EdgeRecord | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
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
      .bind(id, graphId, input.source_id, input.target_id, input.label ?? "", ts)
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
  userId: string,
  graphId: string,
  edgeId: string,
): Promise<boolean> {
  if (!(await ownedGraph(db, userId, graphId))) return false;
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

export async function importGraph(
  db: D1Database,
  userId: string,
  payload: GraphExport,
): Promise<GraphDetail | { error: string }> {
  if (payload.version !== 1) return { error: "unsupported export version" };
  if (!payload.graph?.title || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
    return { error: "invalid export payload" };
  }
  if (payload.nodes.length > QUOTA.maxNodesPerGraph) {
    return { error: `node limit (${QUOTA.maxNodesPerGraph})` };
  }
  if ((await countGraphs(db, userId)) >= QUOTA.maxGraphsPerUser) {
    return { error: `graph limit (${QUOTA.maxGraphsPerUser})` };
  }

  const title = String(payload.graph.title).slice(0, QUOTA.maxTitleChars) || "Imported note";
  const graphId = crypto.randomUUID();
  const ts = nowIso();
  const idMap = new Map<string, string>();

  await db
    .prepare(
      `INSERT INTO graphs (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(graphId, userId, title, ts, ts)
    .run();

  for (const node of payload.nodes) {
    const newId = crypto.randomUUID();
    idMap.set(node.id, newId);
    await db
      .prepare(
        `INSERT INTO nodes (id, graph_id, title, body, x, y, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId,
        graphId,
        String(node.title ?? "").slice(0, QUOTA.maxTitleChars),
        String(node.body ?? "").slice(0, QUOTA.maxBodyChars),
        Number(node.x) || 0,
        Number(node.y) || 0,
        ts,
        ts,
      )
      .run();
  }

  for (const edge of payload.edges) {
    const source = idMap.get(edge.source_id);
    const target = idMap.get(edge.target_id);
    if (!source || !target || source === target) continue;
    try {
      await db
        .prepare(
          `INSERT INTO edges (id, graph_id, source_id, target_id, label, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), graphId, source, target, String(edge.label ?? ""), ts)
        .run();
    } catch {
      /* skip duplicate / invalid */
    }
  }

  const detail = await getGraphDetail(db, userId, graphId);
  if (!detail) return { error: "import failed" };
  return detail;
}

export async function deleteAuthUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`DELETE FROM api_tokens WHERE user_id = ?`).bind(userId).run();
  await db.prepare(`DELETE FROM session WHERE userId = ?`).bind(userId).run();
  await db.prepare(`DELETE FROM account WHERE userId = ?`).bind(userId).run();
  await db.prepare(`DELETE FROM user WHERE id = ?`).bind(userId).run();
}
