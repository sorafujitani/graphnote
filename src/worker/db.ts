import { layoutTree } from "../shared/layoutTree";
import { estimateNoteHeight } from "../shared/estimateNoteHeight";
import { QUOTA } from "../shared/quota";
import { isValidNoteHeight, isValidNoteWidth } from "../shared/noteSize";
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
  const [nodes, edges] = await Promise.all([
    db
      .prepare(
        `SELECT id, graph_id, title, body, x, y, width, height, created_at, updated_at
         FROM nodes WHERE graph_id = ?`,
      )
      .bind(graphId)
      .all<NodeRecord>(),
    db
      .prepare(
        `SELECT id, graph_id, source_id, target_id, label, created_at
         FROM edges WHERE graph_id = ?`,
      )
      .bind(graphId)
      .all<EdgeRecord>(),
  ]);
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
  const statements = [
    db
      .prepare(
        `INSERT INTO graphs (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, userId, safeTitle, ts, ts),
  ];
  if (options.withRootNode !== false) {
    statements.push(
      nodeInsertStatement(db, {
        id: crypto.randomUUID(),
        graph_id: id,
        title: safeTitle,
        body: "",
        x: 80,
        y: 200,
        width: null,
        height: null,
        created_at: ts,
        updated_at: ts,
      }),
    );
  }
  await db.batch(statements);

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

/** Deletes the user's graphs and auth records in one transaction. */
export async function deleteUserAccount(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM graphs WHERE owner_id = ?`).bind(userId),
    db.prepare(`DELETE FROM api_tokens WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM session WHERE userId = ?`).bind(userId),
    db.prepare(`DELETE FROM account WHERE userId = ?`).bind(userId),
    db.prepare(`DELETE FROM user WHERE id = ?`).bind(userId),
  ]);
}

function touchGraphStatement(db: D1Database, graphId: string): D1PreparedStatement {
  return db.prepare(`UPDATE graphs SET updated_at = ? WHERE id = ?`).bind(nowIso(), graphId);
}

function nodeInsertStatement(db: D1Database, node: NodeRecord): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO nodes (id, graph_id, title, body, x, y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      node.id,
      node.graph_id,
      node.title,
      node.body,
      node.x,
      node.y,
      node.width,
      node.height,
      node.created_at,
      node.updated_at,
    );
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
  if (input.x !== undefined && !Number.isFinite(input.x)) return { error: "x must be finite" };
  if (input.y !== undefined && !Number.isFinite(input.y)) return { error: "y must be finite" };
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
    width: null,
    height: null,
    created_at: ts,
    updated_at: ts,
  };
  await db.batch([nodeInsertStatement(db, node), touchGraphStatement(db, graphId)]);
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
      width: node.width,
      y: node.y,
      height: node.height ?? estimateNoteHeight(node.title, node.body),
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
    statements.push(touchGraphStatement(db, graphId));
    await db.batch(statements);
  }
  return getGraphDetail(db, userId, graphId);
}

export async function updateNode(
  db: D1Database,
  userId: string,
  graphId: string,
  nodeId: string,
  input: Partial<Pick<NodeRecord, "title" | "body" | "x" | "y" | "width" | "height">>,
): Promise<NodeRecord | { error: string } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const existing = await db
    .prepare(
      `SELECT id, graph_id, title, body, x, y, width, height, created_at, updated_at
       FROM nodes WHERE id = ? AND graph_id = ?`,
    )
    .bind(nodeId, graphId)
    .first<NodeRecord>();
  if (!existing) return null;
  if (input.body !== undefined && input.body.length > QUOTA.maxBodyChars) {
    return { error: `body too long (max ${QUOTA.maxBodyChars})` };
  }
  if (input.width !== undefined && input.width !== null && !isValidNoteWidth(input.width)) {
    return { error: "invalid node width" };
  }
  if (input.height !== undefined && input.height !== null && !isValidNoteHeight(input.height)) {
    return { error: "invalid node height" };
  }
  for (const key of ["x", "y"] as const) {
    const value = input[key];
    if (value !== undefined && (value === null || !Number.isFinite(value))) {
      return { error: `${key} must be finite` };
    }
  }

  // Update only the provided columns so a concurrent PATCH of other fields
  // (e.g. a title commit racing a drag) is not rolled back by this write.
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  const next: NodeRecord = { ...existing };
  if (input.title !== undefined) {
    next.title = input.title.slice(0, QUOTA.maxTitleChars);
    sets.push("title = ?");
    binds.push(next.title);
  }
  if (input.body !== undefined) {
    next.body = input.body;
    sets.push("body = ?");
    binds.push(next.body);
  }
  for (const key of ["x", "y"] as const) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      next[key] = value;
      sets.push(`${key} = ?`);
      binds.push(value);
    }
  }
  for (const key of ["width", "height"] as const) {
    const value = input[key];
    if (value !== undefined) {
      next[key] = value;
      sets.push(`${key} = ?`);
      binds.push(value);
    }
  }
  if (sets.length === 0) return existing;
  next.updated_at = nowIso();
  sets.push("updated_at = ?");
  binds.push(next.updated_at);
  // RETURNING: the caller replaces its whole record with this response, so it
  // must reflect concurrent writes to other columns, not the pre-read snapshot.
  const results = await db.batch<NodeRecord>([
    db
      .prepare(
        `UPDATE nodes SET ${sets.join(", ")} WHERE id = ? AND graph_id = ?
         RETURNING id, graph_id, title, body, x, y, width, height, created_at, updated_at`,
      )
      .bind(...binds, nodeId, graphId),
    touchGraphStatement(db, graphId),
  ]);
  return results[0]?.results?.[0] ?? next;
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
  const requested = [...new Set(nodeIds)];
  // D1 allows at most 100 bound parameters per statement.
  let targets: string[] = [];
  for (let i = 0; i < requested.length; i += 90) {
    const chunk = requested.slice(i, i + 90);
    const rows = await db
      .prepare(
        `SELECT id FROM nodes WHERE graph_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`,
      )
      .bind(graphId, ...chunk)
      .all<{ id: string }>();
    targets = targets.concat((rows.results ?? []).map((row) => row.id));
  }
  let edgeIds: string[] = [];
  if (targets.length === 0) {
    return { deletedNodeIds: [], deletedEdgeIds: [] };
  }
  if (cascade) {
    const result = await cascadeSelect(db, userId, graphId, targets, "outgoing");
    if (!result) return null;
    targets = result.nodeIds;
    edgeIds = result.edgeIds;
  } else {
    const edges = await listEdges(db, graphId);
    const targetIds = new Set(targets);
    edgeIds = [];
    for (const edge of edges) {
      if (targetIds.has(edge.source_id) || targetIds.has(edge.target_id)) {
        edgeIds.push(edge.id);
      }
    }
  }
  const statements = [
    ...edgeIds.map((id) =>
      db.prepare(`DELETE FROM edges WHERE id = ? AND graph_id = ?`).bind(id, graphId),
    ),
    ...targets.map((id) =>
      db.prepare(`DELETE FROM nodes WHERE id = ? AND graph_id = ?`).bind(id, graphId),
    ),
    touchGraphStatement(db, graphId),
  ];
  await db.batch(statements);
  // Requested ids that no longer exist are reported as deleted too: the
  // caller needs them gone from its canvas either way.
  return { deletedNodeIds: [...new Set([...requested, ...targets])], deletedEdgeIds: edgeIds };
}

export async function createEdge(
  db: D1Database,
  userId: string,
  graphId: string,
  input: { source_id: string; target_id: string; label?: string },
): Promise<EdgeRecord | { error: string } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  if (input.source_id === input.target_id) {
    return { error: "cannot link a node to itself" };
  }
  const [source, target, edgeCount] = await Promise.all([
    db
      .prepare(`SELECT id FROM nodes WHERE id = ? AND graph_id = ?`)
      .bind(input.source_id, graphId)
      .first(),
    db
      .prepare(`SELECT id FROM nodes WHERE id = ? AND graph_id = ?`)
      .bind(input.target_id, graphId)
      .first(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM edges WHERE graph_id = ?`)
      .bind(graphId)
      .first<{ n: number }>(),
  ]);
  if (!source || !target) return { error: "node not found" };
  if ((edgeCount?.n ?? 0) >= QUOTA.maxEdgesPerGraph) {
    return { error: `edge limit (${QUOTA.maxEdgesPerGraph})` };
  }
  const id = crypto.randomUUID();
  const ts = nowIso();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO edges (id, graph_id, source_id, target_id, label, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, graphId, input.source_id, input.target_id, input.label ?? "", ts),
      touchGraphStatement(db, graphId),
    ]);
  } catch (err) {
    // Only the UNIQUE(graph_id, source_id, target_id) violation is a client
    // error; anything else (D1 outage, timeout) must surface as a 500.
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return { error: "nodes already linked" };
    }
    throw err;
  }
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
    await touchGraphStatement(db, graphId).run();
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
  if (payload.edges.length > QUOTA.maxEdgesPerGraph) {
    return { error: `edge limit (${QUOTA.maxEdgesPerGraph})` };
  }
  if (payload.nodes.some((node) => !node || typeof node.id !== "string" || !node.id)) {
    return { error: "invalid export payload" };
  }
  if (
    payload.edges.some(
      (edge) => !edge || typeof edge.source_id !== "string" || typeof edge.target_id !== "string",
    )
  ) {
    return { error: "invalid export payload" };
  }
  if ((await countGraphs(db, userId)) >= QUOTA.maxGraphsPerUser) {
    return { error: `graph limit (${QUOTA.maxGraphsPerUser})` };
  }

  const title = String(payload.graph.title).slice(0, QUOTA.maxTitleChars) || "Imported note";
  const graphId = crypto.randomUUID();
  const ts = nowIso();
  const idMap = new Map<string, string>();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO graphs (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(graphId, userId, title, ts, ts),
  ];

  for (const node of payload.nodes) {
    const newId = crypto.randomUUID();
    idMap.set(node.id, newId);
    statements.push(
      db
        .prepare(
          `INSERT INTO nodes (id, graph_id, title, body, x, y, width, height, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId,
          graphId,
          String(node.title ?? "").slice(0, QUOTA.maxTitleChars),
          String(node.body ?? "").slice(0, QUOTA.maxBodyChars),
          Number(node.x) || 0,
          Number(node.y) || 0,
          isValidNoteWidth(node.width) ? node.width : null,
          isValidNoteHeight(node.height) ? node.height : null,
          ts,
          ts,
        ),
    );
  }

  const edgeKeys = new Set<string>();
  for (const edge of payload.edges) {
    const source = idMap.get(edge.source_id);
    const target = idMap.get(edge.target_id);
    if (!source || !target || source === target) continue;
    const edgeKey = `${source}\0${target}`;
    if (edgeKeys.has(edgeKey)) continue;
    edgeKeys.add(edgeKey);
    statements.push(
      db
        .prepare(
          `INSERT INTO edges (id, graph_id, source_id, target_id, label, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), graphId, source, target, String(edge.label ?? ""), ts),
    );
  }
  await db.batch(statements);

  const detail = await getGraphDetail(db, userId, graphId);
  if (!detail) return { error: "import failed" };
  return detail;
}
