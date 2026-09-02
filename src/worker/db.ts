import { layoutTree } from "../shared/layoutTree";
import { estimateNoteHeight } from "../shared/estimateNoteHeight";
import { placeChildPosition } from "../shared/placeChild";
import { QUOTA } from "../shared/quota";
import { isValidNoteHeight, isValidNoteWidth } from "../shared/noteSize";
import type {
  BatchInput,
  BatchResult,
  CascadeResult,
  EdgeRecord,
  Graph,
  GraphDetail,
  GraphExport,
  GraphSummary,
  ImportResult,
  NodeRecord,
  SearchHit,
} from "../shared/types";
import { computeCascade } from "../shared/cascade";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * `updated_at` doubles as the card's version for `If-Match`, so two writes in
 * the same millisecond must still produce distinct stamps.
 */
function nextVersion(previous: string): string {
  const now = Date.now();
  const before = Date.parse(previous);
  return new Date(Number.isNaN(before) || now > before ? now : before + 1).toISOString();
}

const GRAPH_COLUMNS = "id, owner_id, title, created_at, updated_at, deleted_at";
const NODE_COLUMNS = "id, graph_id, title, body, x, y, width, height, created_at, updated_at";
const EDGE_COLUMNS = "id, graph_id, source_id, target_id, label, created_at";

/** D1 allows at most 100 bound parameters per statement. */
const BIND_CHUNK = 90;

function chunks<T>(items: T[], size = BIND_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function ownedGraph(db: D1Database, userId: string, graphId: string): Promise<Graph | null> {
  return (
    (await db
      .prepare(
        `SELECT ${GRAPH_COLUMNS}
         FROM graphs WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
      )
      .bind(graphId, userId)
      .first<Graph>()) ?? null
  );
}

async function ownedGraphInTrash(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<Graph | null> {
  return (
    (await db
      .prepare(
        `SELECT ${GRAPH_COLUMNS}
         FROM graphs WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`,
      )
      .bind(graphId, userId)
      .first<Graph>()) ?? null
  );
}

export async function listGraphs(
  db: D1Database,
  userId: string,
  scope: "live" | "trash" = "live",
): Promise<GraphSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.owner_id, g.title, g.created_at, g.updated_at, g.deleted_at,
         (SELECT COUNT(*) FROM nodes n WHERE n.graph_id = g.id AND n.deleted_at IS NULL) AS node_count,
         (SELECT COUNT(*) FROM edges e WHERE e.graph_id = g.id AND e.deleted_at IS NULL) AS edge_count
       FROM graphs g
       WHERE g.owner_id = ? AND g.deleted_at IS ${scope === "live" ? "NULL" : "NOT NULL"}
       ORDER BY ${scope === "live" ? "g.updated_at" : "g.deleted_at"} DESC`,
    )
    .bind(userId)
    .all<GraphSummary>();
  return results ?? [];
}

export async function countGraphs(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM graphs WHERE owner_id = ? AND deleted_at IS NULL`)
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function countNodes(db: D1Database, graphId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM nodes WHERE graph_id = ? AND deleted_at IS NULL`)
    .bind(graphId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function countEdges(db: D1Database, graphId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM edges WHERE graph_id = ? AND deleted_at IS NULL`)
    .bind(graphId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function listNodes(db: D1Database, graphId: string): Promise<NodeRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${NODE_COLUMNS} FROM nodes WHERE graph_id = ? AND deleted_at IS NULL`)
    .bind(graphId)
    .all<NodeRecord>();
  return results ?? [];
}

async function listEdges(db: D1Database, graphId: string): Promise<EdgeRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${EDGE_COLUMNS} FROM edges WHERE graph_id = ? AND deleted_at IS NULL`)
    .bind(graphId)
    .all<EdgeRecord>();
  return results ?? [];
}

type TrashableEdge = EdgeRecord & { deleted_at: string | null };

async function listEdgesIncludingTrash(db: D1Database, graphId: string): Promise<TrashableEdge[]> {
  const { results } = await db
    .prepare(`SELECT ${EDGE_COLUMNS}, deleted_at FROM edges WHERE graph_id = ?`)
    .bind(graphId)
    .all<TrashableEdge>();
  return results ?? [];
}

async function liveNodeIds(db: D1Database, graphId: string, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const chunk of chunks([...new Set(ids)])) {
    const rows = await db
      .prepare(
        `SELECT id FROM nodes WHERE graph_id = ? AND deleted_at IS NULL
         AND id IN (${placeholders(chunk.length)})`,
      )
      .bind(graphId, ...chunk)
      .all<{ id: string }>();
    for (const row of rows.results ?? []) found.add(row.id);
  }
  return found;
}

export async function getGraphDetail(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<GraphDetail | null> {
  const graph = await ownedGraph(db, userId, graphId);
  if (!graph) return null;
  const [nodes, edges] = await Promise.all([listNodes(db, graphId), listEdges(db, graphId)]);
  return { graph, nodes, edges };
}

export async function getNode(
  db: D1Database,
  userId: string,
  graphId: string,
  nodeId: string,
): Promise<NodeRecord | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  return (
    (await db
      .prepare(
        `SELECT ${NODE_COLUMNS} FROM nodes
         WHERE id = ? AND graph_id = ? AND deleted_at IS NULL`,
      )
      .bind(nodeId, graphId)
      .first<NodeRecord>()) ?? null
  );
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
    .prepare(
      `UPDATE graphs SET title = ?, updated_at = ?
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(safeTitle, ts, graphId, userId)
    .run();
  if (!result.meta.changes) return null;
  return ownedGraph(db, userId, graphId);
}

export type GraphRef = Pick<Graph, "id" | "owner_id">;

async function countTrashedGraphs(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM graphs WHERE owner_id = ? AND deleted_at IS NOT NULL`)
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Moves the note to the trash; `restoreGraph` brings it back until the purge.
 * The trash is capped so delete/create cycles cannot grow storage without bound;
 * returns the notes evicted from it so the caller can drop their backups.
 */
export async function deleteGraph(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<{ ok: boolean; evicted: GraphRef[] }> {
  const result = await db
    .prepare(
      `UPDATE graphs SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(nowIso(), graphId, userId)
    .run();
  if (!((result.meta.changes ?? 0) > 0)) return { ok: false, evicted: [] };
  const excess = (await countTrashedGraphs(db, userId)) - QUOTA.maxTrashedGraphsPerUser;
  if (excess <= 0) return { ok: true, evicted: [] };
  const { results } = await db
    .prepare(
      `SELECT id, owner_id FROM graphs WHERE owner_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at ASC LIMIT ?`,
    )
    .bind(userId, excess)
    .all<GraphRef>();
  const evicted = results ?? [];
  if (evicted.length > 0) {
    await db.batch(
      evicted.map((graph) =>
        db.prepare(`DELETE FROM graphs WHERE id = ? AND owner_id = ?`).bind(graph.id, userId),
      ),
    );
  }
  return { ok: true, evicted };
}

export async function restoreGraph(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<Graph | { error: string } | null> {
  if (!(await ownedGraphInTrash(db, userId, graphId))) return null;
  if ((await countGraphs(db, userId)) >= QUOTA.maxGraphsPerUser) {
    return { error: `graph limit (${QUOTA.maxGraphsPerUser})` };
  }
  await db
    .prepare(`UPDATE graphs SET deleted_at = NULL, updated_at = ? WHERE id = ? AND owner_id = ?`)
    .bind(nowIso(), graphId, userId)
    .run();
  return ownedGraph(db, userId, graphId);
}

/** Removes a trashed note for good. */
export async function purgeGraph(
  db: D1Database,
  userId: string,
  graphId: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM graphs WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`)
    .bind(graphId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Nightly: drops everything that has sat in the trash past the retention
 * window. Returns the notes removed so their backups can be removed too.
 */
export async function purgeExpiredTrash(db: D1Database): Promise<GraphRef[]> {
  const cutoff = new Date(
    Date.now() - QUOTA.trashRetentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { results } = await db
    .prepare(`SELECT id, owner_id FROM graphs WHERE deleted_at IS NOT NULL AND deleted_at < ?`)
    .bind(cutoff)
    .all<GraphRef>();
  await db.batch([
    db.prepare(`DELETE FROM graphs WHERE deleted_at IS NOT NULL AND deleted_at < ?`).bind(cutoff),
    db.prepare(`DELETE FROM nodes WHERE deleted_at IS NOT NULL AND deleted_at < ?`).bind(cutoff),
    db.prepare(`DELETE FROM edges WHERE deleted_at IS NOT NULL AND deleted_at < ?`).bind(cutoff),
  ]);
  return results ?? [];
}

/** True when the user owns the note, live or trashed (backups outlive the trash). */
export async function ownsGraph(db: D1Database, userId: string, graphId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT id FROM graphs WHERE id = ? AND owner_id = ?`)
    .bind(graphId, userId)
    .first();
  return row !== null;
}

export async function quotaUsage(
  db: D1Database,
  userId: string,
): Promise<{ graphs: number; trashedGraphs: number }> {
  const [graphs, trashedGraphs] = await Promise.all([
    countGraphs(db, userId),
    countTrashedGraphs(db, userId),
  ]);
  return { graphs, trashedGraphs };
}

/** Graphs touched since `sinceIso`, for the nightly backup. */
export async function listGraphsUpdatedSince(
  db: D1Database,
  sinceIso: string,
  limit: number,
): Promise<Array<Pick<Graph, "id" | "owner_id">>> {
  const { results } = await db
    .prepare(
      `SELECT id, owner_id FROM graphs
       WHERE deleted_at IS NULL AND updated_at > ? ORDER BY updated_at DESC LIMIT ?`,
    )
    .bind(sinceIso, limit)
    .all<Pick<Graph, "id" | "owner_id">>();
  return results ?? [];
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

function edgeInsertStatement(db: D1Database, edge: EdgeRecord): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO edges (id, graph_id, source_id, target_id, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(edge.id, edge.graph_id, edge.source_id, edge.target_id, edge.label, edge.created_at);
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

/**
 * Creates cards and links in one transaction. Edges may reference a `tempId`
 * from the same batch or an existing card; cards without coordinates are
 * placed beside their first in-batch parent so an agent can skip layout math.
 */
export async function createBatch(
  db: D1Database,
  userId: string,
  graphId: string,
  input: BatchInput,
): Promise<BatchResult | { error: string } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const [nodeCount, edgeCount, existingNodes, allEdges] = await Promise.all([
    countNodes(db, graphId),
    countEdges(db, graphId),
    listNodes(db, graphId),
    listEdgesIncludingTrash(db, graphId),
  ]);
  if (nodeCount + input.nodes.length > QUOTA.maxNodesPerGraph) {
    return { error: `node limit (${QUOTA.maxNodesPerGraph})` };
  }
  if (edgeCount + input.edges.length > QUOTA.maxEdgesPerGraph) {
    return { error: `edge limit (${QUOTA.maxEdgesPerGraph})` };
  }

  const ts = nowIso();
  // Maps, not plain objects: a tempId like "toString" must not hit the prototype.
  const ids = new Map<string, string>();
  const byId = new Map(existingNodes.map((node) => [node.id, node]));
  const created: NodeRecord[] = [];
  const parentOf = new Map<string, string>();
  for (const edge of input.edges) {
    if (!parentOf.has(edge.target)) parentOf.set(edge.target, edge.source);
  }

  for (const [index, item] of input.nodes.entries()) {
    const id = crypto.randomUUID();
    const ref = item.tempId ?? id;
    if (ids.has(ref) || byId.has(ref)) return { error: `duplicate tempId: ${ref}` };
    ids.set(ref, id);
    const node: NodeRecord = {
      id,
      graph_id: graphId,
      title: (item.title ?? "Untitled").slice(0, QUOTA.maxTitleChars),
      body: (item.body ?? "").slice(0, QUOTA.maxBodyChars),
      x: item.x ?? 100 + index * 24,
      y: item.y ?? 100 + index * 24,
      width: null,
      height: null,
      created_at: ts,
      updated_at: ts,
    };
    if (item.x === undefined && item.y === undefined) {
      const parentRef = parentOf.get(ref);
      const parent = parentRef ? byId.get(ids.get(parentRef) ?? parentRef) : undefined;
      if (parent) {
        const pos = placeChildPosition(parent, [...byId.values()]);
        node.x = pos.x;
        node.y = pos.y;
      }
    }
    byId.set(id, node);
    created.push(node);
  }

  const resolve = (ref: string) => ids.get(ref) ?? (byId.has(ref) ? ref : undefined);
  // UNIQUE(graph_id, source_id, target_id) also covers trashed links: those are
  // revived in place instead of inserted, mirroring `createEdge`.
  const previousByPair = new Map<string, TrashableEdge>(
    allEdges.map((edge) => [`${edge.source_id}\0${edge.target_id}`, edge]),
  );
  const seen = new Set<string>();
  const inserts: EdgeRecord[] = [];
  const revives: TrashableEdge[] = [];
  for (const item of input.edges) {
    const source = resolve(item.source);
    const target = resolve(item.target);
    if (!source || !target)
      return { error: `unknown node: ${!source ? item.source : item.target}` };
    if (source === target) return { error: "cannot link a node to itself" };
    const key = `${source}\0${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = (item.label ?? "").slice(0, QUOTA.maxTitleChars);
    const previous = previousByPair.get(key);
    if (previous && previous.deleted_at === null) continue;
    if (previous) {
      revives.push({ ...previous, label, created_at: ts });
      continue;
    }
    inserts.push({
      id: crypto.randomUUID(),
      graph_id: graphId,
      source_id: source,
      target_id: target,
      label,
      created_at: ts,
    });
  }

  await db.batch([
    ...created.map((node) => nodeInsertStatement(db, node)),
    ...inserts.map((edge) => edgeInsertStatement(db, edge)),
    ...revives.map((edge) =>
      db
        .prepare(`UPDATE edges SET deleted_at = NULL, label = ?, created_at = ? WHERE id = ?`)
        .bind(edge.label, edge.created_at, edge.id),
    ),
    touchGraphStatement(db, graphId),
  ]);
  return {
    nodes: created,
    edges: [...inserts, ...revives.map(({ deleted_at: _trash, ...edge }) => edge)],
    ids: Object.fromEntries(ids),
  };
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
      // Arrange must reserve enough room for the actual body even when an old
      // manual height is now too small. The persisted height is expanded below
      // so the card and the layout use the same geometry.
      height: Math.max(node.height ?? 0, estimateNoteHeight(node.title, node.body, node.width)),
    })),
    detail.edges,
  );
  const ts = nowIso();
  const statements = detail.nodes.flatMap((node) => {
    const pos = positions.get(node.id);
    if (!pos) return [];
    const estimatedHeight = estimateNoteHeight(node.title, node.body, node.width);
    // A null height means the card is content-sized; keep it null so future
    // edits remain responsive. Only repair a saved manual height when it clips
    // the current content, and never shrink a deliberate larger size.
    const nextHeight = node.height === null ? null : Math.max(node.height, estimatedHeight);
    const heightChanged = nextHeight !== node.height;
    if (pos.x === node.x && pos.y === node.y && !heightChanged) return [];
    const columns = ["x = ?", "y = ?"];
    const binds: (number | string | null)[] = [pos.x, pos.y];
    if (heightChanged) {
      columns.push("height = ?");
      binds.push(nextHeight);
    }
    columns.push("updated_at = ?");
    binds.push(ts, node.id, graphId);
    return [
      db
        .prepare(
          `UPDATE nodes SET ${columns.join(", ")} WHERE id = ? AND graph_id = ? AND deleted_at IS NULL`,
        )
        .bind(...binds),
    ];
  });
  if (statements.length > 0) {
    statements.push(touchGraphStatement(db, graphId));
    await db.batch(statements);
  }
  return getGraphDetail(db, userId, graphId);
}

export type UpdateNodeOutcome =
  | NodeRecord
  | { error: string }
  /** The card changed since the caller last saw it; `current` is what is stored now. */
  | { conflict: true; current: NodeRecord }
  | null;

export async function updateNode(
  db: D1Database,
  userId: string,
  graphId: string,
  nodeId: string,
  input: Partial<Pick<NodeRecord, "title" | "body" | "x" | "y" | "width" | "height">>,
  options: { ifMatch?: string } = {},
): Promise<UpdateNodeOutcome> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const existing = await db
    .prepare(
      `SELECT ${NODE_COLUMNS} FROM nodes WHERE id = ? AND graph_id = ? AND deleted_at IS NULL`,
    )
    .bind(nodeId, graphId)
    .first<NodeRecord>();
  if (!existing) return null;
  if (options.ifMatch !== undefined && options.ifMatch !== existing.updated_at) {
    return { conflict: true, current: existing };
  }
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
  next.updated_at = nextVersion(existing.updated_at);
  sets.push("updated_at = ?");
  binds.push(next.updated_at);
  // The version check is repeated in the WHERE clause so two writers that both
  // read the same `updated_at` cannot both succeed.
  const guard = options.ifMatch !== undefined ? " AND updated_at = ?" : "";
  if (options.ifMatch !== undefined) binds.push(nodeId, graphId, options.ifMatch);
  else binds.push(nodeId, graphId);
  // RETURNING: the caller replaces its whole record with this response, so it
  // must reflect concurrent writes to other columns, not the pre-read snapshot.
  const results = await db.batch<NodeRecord>([
    db
      .prepare(
        `UPDATE nodes SET ${sets.join(", ")} WHERE id = ? AND graph_id = ? AND deleted_at IS NULL${guard}
         RETURNING ${NODE_COLUMNS}`,
      )
      .bind(...binds),
    touchGraphStatement(db, graphId),
  ]);
  const written = results[0]?.results?.[0];
  if (written) return written;
  // No row came back: either the guard failed, the card was trashed meanwhile,
  // or the driver returned nothing for RETURNING. Re-read and decide from the
  // stamp we just tried to write.
  const current = await db
    .prepare(
      `SELECT ${NODE_COLUMNS} FROM nodes WHERE id = ? AND graph_id = ? AND deleted_at IS NULL`,
    )
    .bind(nodeId, graphId)
    .first<NodeRecord>();
  if (!current) return null;
  if (current.updated_at === next.updated_at) return current;
  return options.ifMatch !== undefined ? { conflict: true, current } : current;
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

/** Marks cards (and the links touching them) deleted; `restoreNodes` undoes it. */
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
  let targets = [...(await liveNodeIds(db, graphId, requested))];
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
  const ts = nowIso();
  const statements = [
    ...chunks(edgeIds).map((chunk) =>
      db
        .prepare(
          `UPDATE edges SET deleted_at = ? WHERE graph_id = ? AND deleted_at IS NULL
           AND id IN (${placeholders(chunk.length)})`,
        )
        .bind(ts, graphId, ...chunk),
    ),
    ...chunks(targets).map((chunk) =>
      db
        .prepare(
          `UPDATE nodes SET deleted_at = ? WHERE graph_id = ? AND deleted_at IS NULL
           AND id IN (${placeholders(chunk.length)})`,
        )
        .bind(ts, graphId, ...chunk),
    ),
    touchGraphStatement(db, graphId),
  ];
  await db.batch(statements);
  // Requested ids that no longer exist are reported as deleted too: the
  // caller needs them gone from its canvas either way.
  return { deletedNodeIds: [...new Set([...requested, ...targets])], deletedEdgeIds: edgeIds };
}

/**
 * Brings trashed cards and links back. Links come back only when both of
 * their cards are live afterwards, so the graph never shows a dangling line.
 */
export async function restoreNodes(
  db: D1Database,
  userId: string,
  graphId: string,
  nodeIds: string[],
  edgeIds: string[],
): Promise<{ nodes: NodeRecord[]; edges: EdgeRecord[] } | { error: string } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const wantedNodes = [...new Set(nodeIds)];
  const wantedEdges = [...new Set(edgeIds)];
  const trashedNodes: NodeRecord[] = [];
  for (const chunk of chunks(wantedNodes)) {
    const rows = await db
      .prepare(
        `SELECT ${NODE_COLUMNS} FROM nodes WHERE graph_id = ? AND deleted_at IS NOT NULL
         AND id IN (${placeholders(chunk.length)})`,
      )
      .bind(graphId, ...chunk)
      .all<NodeRecord>();
    trashedNodes.push(...(rows.results ?? []));
  }
  if ((await countNodes(db, graphId)) + trashedNodes.length > QUOTA.maxNodesPerGraph) {
    return { error: `node limit (${QUOTA.maxNodesPerGraph})` };
  }
  const trashedEdges: EdgeRecord[] = [];
  for (const chunk of chunks(wantedEdges)) {
    const rows = await db
      .prepare(
        `SELECT ${EDGE_COLUMNS} FROM edges WHERE graph_id = ? AND deleted_at IS NOT NULL
         AND id IN (${placeholders(chunk.length)})`,
      )
      .bind(graphId, ...chunk)
      .all<EdgeRecord>();
    trashedEdges.push(...(rows.results ?? []));
  }
  const liveAfter = new Set([
    ...(await liveNodeIds(db, graphId, [
      ...new Set(trashedEdges.flatMap((edge) => [edge.source_id, edge.target_id])),
    ])),
    ...trashedNodes.map((node) => node.id),
  ]);
  const edges = trashedEdges.filter(
    (edge) => liveAfter.has(edge.source_id) && liveAfter.has(edge.target_id),
  );
  if ((await countEdges(db, graphId)) + edges.length > QUOTA.maxEdgesPerGraph) {
    return { error: `edge limit (${QUOTA.maxEdgesPerGraph})` };
  }
  const ts = nowIso();
  const nodes = trashedNodes.map((node) => ({ ...node, updated_at: ts }));
  if (nodes.length + edges.length > 0) {
    await db.batch([
      ...chunks(nodes.map((node) => node.id)).map((chunk) =>
        db
          .prepare(
            `UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE graph_id = ?
             AND id IN (${placeholders(chunk.length)})`,
          )
          .bind(ts, graphId, ...chunk),
      ),
      ...chunks(edges.map((edge) => edge.id)).map((chunk) =>
        db
          .prepare(
            `UPDATE edges SET deleted_at = NULL WHERE graph_id = ?
             AND id IN (${placeholders(chunk.length)})`,
          )
          .bind(graphId, ...chunk),
      ),
      touchGraphStatement(db, graphId),
    ]);
  }
  return { nodes, edges };
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
  const [endpoints, edgeCount, previous] = await Promise.all([
    liveNodeIds(db, graphId, [input.source_id, input.target_id]),
    countEdges(db, graphId),
    // UNIQUE(graph_id, source_id, target_id) also covers trashed links, so a
    // re-link revives the old row instead of failing on the constraint.
    db
      .prepare(
        `SELECT ${EDGE_COLUMNS}, deleted_at FROM edges
         WHERE graph_id = ? AND source_id = ? AND target_id = ?`,
      )
      .bind(graphId, input.source_id, input.target_id)
      .first<EdgeRecord & { deleted_at: string | null }>(),
  ]);
  if (!endpoints.has(input.source_id) || !endpoints.has(input.target_id)) {
    return { error: "node not found" };
  }
  if (previous && previous.deleted_at === null) return { error: "nodes already linked" };
  if (edgeCount >= QUOTA.maxEdgesPerGraph) {
    return { error: `edge limit (${QUOTA.maxEdgesPerGraph})` };
  }
  const label = (input.label ?? "").slice(0, QUOTA.maxTitleChars);
  const ts = nowIso();
  if (previous) {
    await db.batch([
      db
        .prepare(`UPDATE edges SET deleted_at = NULL, label = ?, created_at = ? WHERE id = ?`)
        .bind(label, ts, previous.id),
      touchGraphStatement(db, graphId),
    ]);
    return {
      id: previous.id,
      graph_id: graphId,
      source_id: input.source_id,
      target_id: input.target_id,
      label,
      created_at: ts,
    };
  }
  const edge: EdgeRecord = {
    id: crypto.randomUUID(),
    graph_id: graphId,
    source_id: input.source_id,
    target_id: input.target_id,
    label,
    created_at: ts,
  };
  try {
    await db.batch([edgeInsertStatement(db, edge), touchGraphStatement(db, graphId)]);
  } catch (err) {
    // Only the UNIQUE(graph_id, source_id, target_id) violation is a client
    // error; anything else (D1 outage, timeout) must surface as a 500.
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return { error: "nodes already linked" };
    }
    throw err;
  }
  return edge;
}

export async function updateEdge(
  db: D1Database,
  userId: string,
  graphId: string,
  edgeId: string,
  input: { label: string },
): Promise<EdgeRecord | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const label = input.label.slice(0, QUOTA.maxTitleChars);
  const results = await db.batch<EdgeRecord>([
    db
      .prepare(
        `UPDATE edges SET label = ? WHERE id = ? AND graph_id = ? AND deleted_at IS NULL
         RETURNING ${EDGE_COLUMNS}`,
      )
      .bind(label, edgeId, graphId),
    touchGraphStatement(db, graphId),
  ]);
  return results[0]?.results?.[0] ?? null;
}

export async function deleteEdge(
  db: D1Database,
  userId: string,
  graphId: string,
  edgeId: string,
): Promise<boolean> {
  if (!(await ownedGraph(db, userId, graphId))) return false;
  const result = await db
    .prepare(`UPDATE edges SET deleted_at = ? WHERE id = ? AND graph_id = ? AND deleted_at IS NULL`)
    .bind(nowIso(), edgeId, graphId)
    .run();
  if ((result.meta.changes ?? 0) > 0) {
    await touchGraphStatement(db, graphId).run();
    return true;
  }
  return false;
}

const LIKE_ESCAPE = /[%_\\]/g;

function snippetAround(body: string, query: string): string {
  const index = body.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return body.slice(0, 120).replace(/\s+/g, " ").trim();
  const start = Math.max(0, index - 40);
  const end = Math.min(body.length, index + query.length + 80);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).replace(/\s+/g, " ").trim()}${
    end < body.length ? "…" : ""
  }`;
}

/** Case-insensitive substring search over every live card the user owns. */
export async function searchNodes(
  db: D1Database,
  userId: string,
  query: string,
  limit: number = QUOTA.maxSearchHits,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = `%${trimmed.replace(LIKE_ESCAPE, (char) => `\\${char}`)}%`;
  const { results } = await db
    .prepare(
      `SELECT n.graph_id, g.title AS graph_title, n.id AS node_id, n.title,
         substr(n.body, 1, 4000) AS body
       FROM nodes n JOIN graphs g ON g.id = n.graph_id
       WHERE g.owner_id = ? AND g.deleted_at IS NULL AND n.deleted_at IS NULL
         AND (n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\')
       ORDER BY n.updated_at DESC LIMIT ?`,
    )
    .bind(userId, pattern, pattern, limit)
    .all<{ graph_id: string; graph_title: string; node_id: string; title: string; body: string }>();
  return (results ?? []).map((row) => ({
    graph_id: row.graph_id,
    graph_title: row.graph_title,
    node_id: row.node_id,
    title: row.title,
    snippet: snippetAround(row.body, trimmed),
  }));
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateImportPayload(payload: GraphExport): { error: string } | null {
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
  return null;
}

/** INSERT statements for a payload's cards and links under `graphId`, plus what was dropped. */
function importStatements(
  db: D1Database,
  graphId: string,
  payload: GraphExport,
  ts: string,
): { statements: D1PreparedStatement[]; skippedEdges: number } {
  const statements: D1PreparedStatement[] = [];
  const idMap = new Map<string, string>();
  for (const node of payload.nodes) {
    const newId = crypto.randomUUID();
    idMap.set(node.id, newId);
    statements.push(
      nodeInsertStatement(db, {
        id: newId,
        graph_id: graphId,
        title: String(node.title ?? "").slice(0, QUOTA.maxTitleChars),
        body: String(node.body ?? "").slice(0, QUOTA.maxBodyChars),
        x: Number(node.x) || 0,
        y: Number(node.y) || 0,
        width: isValidNoteWidth(node.width) ? node.width : null,
        height: isValidNoteHeight(node.height) ? node.height : null,
        // Authoring dates survive a restore; only the write itself is "now".
        created_at: isIsoTimestamp(node.created_at) ? node.created_at : ts,
        updated_at: ts,
      }),
    );
  }
  const edgeKeys = new Set<string>();
  let skippedEdges = 0;
  for (const edge of payload.edges) {
    const source = idMap.get(edge.source_id);
    const target = idMap.get(edge.target_id);
    const edgeKey = `${source}\0${target}`;
    if (!source || !target || source === target || edgeKeys.has(edgeKey)) {
      skippedEdges += 1;
      continue;
    }
    edgeKeys.add(edgeKey);
    statements.push(
      edgeInsertStatement(db, {
        id: crypto.randomUUID(),
        graph_id: graphId,
        source_id: source,
        target_id: target,
        label: String(edge.label ?? ""),
        created_at: isIsoTimestamp(edge.created_at) ? edge.created_at : ts,
      }),
    );
  }
  return { statements, skippedEdges };
}

export async function importGraph(
  db: D1Database,
  userId: string,
  payload: GraphExport,
): Promise<ImportResult | { error: string }> {
  const invalid = validateImportPayload(payload);
  if (invalid) return invalid;
  if ((await countGraphs(db, userId)) >= QUOTA.maxGraphsPerUser) {
    return { error: `graph limit (${QUOTA.maxGraphsPerUser})` };
  }

  const title = String(payload.graph.title).slice(0, QUOTA.maxTitleChars) || "Imported note";
  const graphId = crypto.randomUUID();
  const ts = nowIso();
  const created_at = isIsoTimestamp(payload.graph.created_at) ? payload.graph.created_at : ts;
  const { statements, skippedEdges } = importStatements(db, graphId, payload, ts);
  await db.batch([
    db
      .prepare(
        `INSERT INTO graphs (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(graphId, userId, title, created_at, ts),
    ...statements,
  ]);

  const detail = await getGraphDetail(db, userId, graphId);
  if (!detail) return { error: "import failed" };
  return { ...detail, skippedEdges };
}

/**
 * Replaces a note's cards and links with the payload's, keeping the note id so
 * deep links and CLI scripts stay valid. The old contents go to the trash.
 */
export async function replaceGraphContents(
  db: D1Database,
  userId: string,
  graphId: string,
  payload: GraphExport,
): Promise<ImportResult | { error: string } | null> {
  if (!(await ownedGraph(db, userId, graphId))) return null;
  const invalid = validateImportPayload(payload);
  if (invalid) return invalid;
  const ts = nowIso();
  const title = String(payload.graph.title).trim().slice(0, QUOTA.maxTitleChars);
  const { statements, skippedEdges } = importStatements(db, graphId, payload, ts);
  await db.batch([
    db
      .prepare(`UPDATE edges SET deleted_at = ? WHERE graph_id = ? AND deleted_at IS NULL`)
      .bind(ts, graphId),
    db
      .prepare(`UPDATE nodes SET deleted_at = ? WHERE graph_id = ? AND deleted_at IS NULL`)
      .bind(ts, graphId),
    ...statements,
    // A blank title in the backup keeps the current name.
    title
      ? db
          .prepare(`UPDATE graphs SET title = ?, updated_at = ? WHERE id = ?`)
          .bind(title, ts, graphId)
      : touchGraphStatement(db, graphId),
  ]);
  const detail = await getGraphDetail(db, userId, graphId);
  if (!detail) return { error: "import failed" };
  return { ...detail, skippedEdges };
}
