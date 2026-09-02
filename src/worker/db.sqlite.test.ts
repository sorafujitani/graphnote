import { beforeEach, describe, expect, it } from "vite-plus/test";
import { QUOTA } from "../shared/quota";
import type { GraphDetail, GraphExport, NodeRecord } from "../shared/types";
import {
  countGraphs,
  createBatch,
  createEdge,
  createGraph,
  createNode,
  deleteEdge,
  deleteGraph,
  deleteNodes,
  getGraphDetail,
  listGraphs,
  ownsGraph,
  purgeExpiredTrash,
  replaceGraphContents,
  restoreGraph,
  restoreNodes,
  searchNodes,
  updateEdge,
  updateNode,
} from "./db";
import { migratedD1 } from "./test/sqliteD1";

const USER = "user-1";

async function seedGraph(db: D1Database): Promise<GraphDetail> {
  const created = await createGraph(db, USER, "Seed", { withRootNode: false });
  if ("error" in created) throw new Error(created.error);
  const a = (await createNode(db, USER, created.graph.id, {
    title: "Alpha",
    body: "",
  })) as NodeRecord;
  const b = (await createNode(db, USER, created.graph.id, {
    title: "Beta",
    body: "needle in body",
  })) as NodeRecord;
  await createEdge(db, USER, created.graph.id, { source_id: a.id, target_id: b.id });
  const detail = await getGraphDetail(db, USER, created.graph.id);
  if (!detail) throw new Error("seed failed");
  return detail;
}

describe("db against real SQLite", () => {
  let db: D1Database;
  beforeEach(() => {
    db = migratedD1();
  });

  it("trashes nodes with their edges and restores both", async () => {
    const seed = await seedGraph(db);
    const [a, b] = seed.nodes.map((node) => node.id) as [string, string];

    const deleted = await deleteNodes(db, USER, seed.graph.id, [b], false);
    expect(deleted?.deletedNodeIds).toEqual([b]);
    expect(deleted?.deletedEdgeIds).toHaveLength(1);
    let detail = await getGraphDetail(db, USER, seed.graph.id);
    expect(detail?.nodes.map((node) => node.id)).toEqual([a]);
    expect(detail?.edges).toHaveLength(0);

    const restored = await restoreNodes(db, USER, seed.graph.id, [b], deleted!.deletedEdgeIds);
    expect(restored).not.toBeNull();
    if (!restored || "error" in restored) throw new Error("restore failed");
    expect(restored.nodes.map((node) => node.id)).toEqual([b]);
    expect(restored.edges).toHaveLength(1);
    detail = await getGraphDetail(db, USER, seed.graph.id);
    expect(detail?.nodes).toHaveLength(2);
    expect(detail?.edges).toHaveLength(1);
  });

  it("does not restore a link whose other card is still in the trash", async () => {
    const seed = await seedGraph(db);
    const [a, b] = seed.nodes.map((node) => node.id) as [string, string];
    const deleted = await deleteNodes(db, USER, seed.graph.id, [a, b], false);
    const restored = await restoreNodes(db, USER, seed.graph.id, [a], deleted!.deletedEdgeIds);
    if (!restored || "error" in restored) throw new Error("restore failed");
    expect(restored.edges).toHaveLength(0);
    const detail = await getGraphDetail(db, USER, seed.graph.id);
    expect(detail?.edges).toHaveLength(0);
  });

  it("revives a trashed link instead of tripping the UNIQUE constraint", async () => {
    const seed = await seedGraph(db);
    const [a, b] = seed.nodes.map((node) => node.id) as [string, string];
    const edgeId = seed.edges[0]!.id;
    expect(await deleteEdge(db, USER, seed.graph.id, edgeId)).toBe(true);
    const again = await createEdge(db, USER, seed.graph.id, {
      source_id: a,
      target_id: b,
      label: "again",
    });
    expect(again).toMatchObject({ id: edgeId, label: "again" });
    const dup = await createEdge(db, USER, seed.graph.id, { source_id: a, target_id: b });
    expect(dup).toEqual({ error: "nodes already linked" });
  });

  it("trashes a graph out of the list and quota, then restores or purges it", async () => {
    const seed = await seedGraph(db);
    expect((await deleteGraph(db, USER, seed.graph.id)).ok).toBe(true);
    expect(await listGraphs(db, USER)).toHaveLength(0);
    expect(await countGraphs(db, USER)).toBe(0);
    const trash = await listGraphs(db, USER, "trash");
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ node_count: 2, edge_count: 1 });
    expect(await getGraphDetail(db, USER, seed.graph.id)).toBeNull();

    const restored = await restoreGraph(db, USER, seed.graph.id);
    expect(restored).toMatchObject({ id: seed.graph.id });
    expect(await listGraphs(db, USER)).toHaveLength(1);
  });

  it("purges only trash older than the retention window", async () => {
    const seed = await seedGraph(db);
    await deleteGraph(db, USER, seed.graph.id);
    await purgeExpiredTrash(db);
    expect(await listGraphs(db, USER, "trash")).toHaveLength(1);

    const old = new Date(
      Date.now() - (QUOTA.trashRetentionDays + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    await db.prepare(`UPDATE graphs SET deleted_at = ?`).bind(old).run();
    await purgeExpiredTrash(db);
    expect(await listGraphs(db, USER, "trash")).toHaveLength(0);
    const orphans = await db.prepare(`SELECT COUNT(*) AS n FROM nodes`).first<{ n: number }>();
    expect(orphans?.n).toBe(0);
  });

  it("rejects a conditional update whose version is stale and returns the current card", async () => {
    const seed = await seedGraph(db);
    const node = seed.nodes[0]!;
    const first = await updateNode(
      db,
      USER,
      seed.graph.id,
      node.id,
      { title: "v2" },
      {
        ifMatch: node.updated_at,
      },
    );
    expect(first).toMatchObject({ title: "v2" });

    const stale = await updateNode(
      db,
      USER,
      seed.graph.id,
      node.id,
      { title: "v3" },
      {
        ifMatch: node.updated_at,
      },
    );
    expect(stale).toMatchObject({ conflict: true, current: { title: "v2" } });
    const detail = await getGraphDetail(db, USER, seed.graph.id);
    expect(detail?.nodes.find((item) => item.id === node.id)?.title).toBe("v2");
  });

  it("updates an edge label and ignores trashed edges", async () => {
    const seed = await seedGraph(db);
    const edgeId = seed.edges[0]!.id;
    expect(await updateEdge(db, USER, seed.graph.id, edgeId, { label: "why" })).toMatchObject({
      label: "why",
    });
    await deleteEdge(db, USER, seed.graph.id, edgeId);
    expect(await updateEdge(db, USER, seed.graph.id, edgeId, { label: "x" })).toBeNull();
  });

  it("creates a batch atomically with tempId references and auto placement", async () => {
    const seed = await seedGraph(db);
    const root = seed.nodes[0]!;
    const result = await createBatch(db, USER, seed.graph.id, {
      nodes: [
        { tempId: "c1", title: "Child 1" },
        { tempId: "c2", title: "Child 2" },
      ],
      edges: [
        { source: root.id, target: "c1" },
        { source: "c1", target: "c2", label: "then" },
      ],
    });
    if (!result || "error" in result) throw new Error(JSON.stringify(result));
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(2);
    expect(result.ids.c1).toBe(result.nodes[0]!.id);
    expect(result.nodes[0]!.x).toBeGreaterThan(root.x);
    expect(result.nodes[1]!.x).toBeGreaterThan(result.nodes[0]!.x);
    expect(result.edges[1]).toMatchObject({ label: "then", source_id: result.ids.c1 });

    const bad = await createBatch(db, USER, seed.graph.id, {
      nodes: [{ tempId: "x", title: "X" }],
      edges: [{ source: "x", target: "missing" }],
    });
    expect(bad).toEqual({ error: "unknown node: missing" });
    const detail = await getGraphDetail(db, USER, seed.graph.id);
    expect(detail?.nodes.some((node) => node.title === "X")).toBe(false);
  });

  it("searches titles and bodies across live graphs and escapes wildcards", async () => {
    const seed = await seedGraph(db);
    const hits = await searchNodes(db, USER, "needle");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ graph_id: seed.graph.id, title: "Beta" });
    expect(hits[0]!.snippet).toContain("needle");

    expect(await searchNodes(db, USER, "%")).toHaveLength(0);
    expect(await searchNodes(db, "someone-else", "needle")).toHaveLength(0);
    await deleteGraph(db, USER, seed.graph.id);
    expect(await searchNodes(db, USER, "needle")).toHaveLength(0);
  });

  it("replaces a graph's contents in place and reports skipped edges", async () => {
    const seed = await seedGraph(db);
    const payload: GraphExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      graph: { ...seed.graph, title: "Restored title" },
      nodes: [
        { ...seed.nodes[0]!, id: "n1", title: "One", created_at: "2020-01-02T03:04:05.000Z" },
        { ...seed.nodes[1]!, id: "n2", title: "Two" },
      ],
      edges: [
        { ...seed.edges[0]!, source_id: "n1", target_id: "n2" },
        { ...seed.edges[0]!, id: "dangling", source_id: "n1", target_id: "nope" },
      ],
    };
    const result = await replaceGraphContents(db, USER, seed.graph.id, payload);
    if (!result || "error" in result) throw new Error(JSON.stringify(result));
    expect(result.graph.id).toBe(seed.graph.id);
    expect(result.graph.title).toBe("Restored title");
    expect(result.nodes.map((node) => node.title).sort()).toEqual(["One", "Two"]);
    expect(result.nodes.find((node) => node.title === "One")?.created_at).toBe(
      "2020-01-02T03:04:05.000Z",
    );
    expect(result.edges).toHaveLength(1);
    expect(result.skippedEdges).toBe(1);
    expect(await listGraphs(db, USER)).toHaveLength(1);
  });
});

describe("review follow-ups against real SQLite", () => {
  let db: D1Database;
  beforeEach(() => {
    db = migratedD1();
  });

  it("revives a trashed link inside a batch instead of failing on UNIQUE", async () => {
    const seed = await seedGraph(db);
    const [a, b] = seed.nodes.map((node) => node.id) as [string, string];
    const edgeId = seed.edges[0]!.id;
    await deleteEdge(db, USER, seed.graph.id, edgeId);
    const result = await createBatch(db, USER, seed.graph.id, {
      nodes: [{ tempId: "toString", title: "Proto-safe" }],
      edges: [
        { source: a, target: b, label: "again" },
        { source: a, target: "toString" },
      ],
    });
    if (!result || "error" in result) throw new Error(JSON.stringify(result));
    expect(result.edges.map((edge) => edge.id)).toContain(edgeId);
    expect(result.edges.find((edge) => edge.id === edgeId)?.label).toBe("again");
    expect(result.ids["toString"]).toBe(result.nodes[0]!.id);
    const detail = await getGraphDetail(db, USER, seed.graph.id);
    expect(detail?.edges).toHaveLength(2);
  });

  it("evicts the oldest trashed notes past the trash cap", async () => {
    const ids: string[] = [];
    for (let i = 0; i < QUOTA.maxTrashedGraphsPerUser + 1; i += 1) {
      const created = await createGraph(db, USER, `Note ${i}`, { withRootNode: false });
      if ("error" in created) throw new Error(created.error);
      ids.push(created.graph.id);
      await db
        .prepare(`UPDATE graphs SET deleted_at = ? WHERE id = ?`)
        .bind(new Date(2020, 0, 1, 0, 0, i).toISOString(), created.graph.id)
        .run();
    }
    const extra = await createGraph(db, USER, "Newest", { withRootNode: false });
    if ("error" in extra) throw new Error(extra.error);
    const result = await deleteGraph(db, USER, extra.graph.id);
    expect(result.ok).toBe(true);
    expect(result.evicted.map((graph) => graph.id)).toEqual([ids[0], ids[1]]);
    expect(await listGraphs(db, USER, "trash")).toHaveLength(QUOTA.maxTrashedGraphsPerUser);
  });

  it("refuses to restore a note when the live quota is full", async () => {
    const seed = await seedGraph(db);
    await deleteGraph(db, USER, seed.graph.id);
    for (let i = 0; i < QUOTA.maxGraphsPerUser; i += 1) {
      const created = await createGraph(db, USER, `Fill ${i}`, { withRootNode: false });
      if ("error" in created) throw new Error(created.error);
    }
    expect(await restoreGraph(db, USER, seed.graph.id)).toEqual({
      error: `graph limit (${QUOTA.maxGraphsPerUser})`,
    });
  });

  it("returns 'not found' when a card is trashed between read and write", async () => {
    const seed = await seedGraph(db);
    const node = seed.nodes[0]!;
    await deleteNodes(db, USER, seed.graph.id, [node.id], false);
    expect(await updateNode(db, USER, seed.graph.id, node.id, { title: "ghost" })).toBeNull();
    const trashed = await db
      .prepare(`SELECT title FROM nodes WHERE id = ?`)
      .bind(node.id)
      .first<{ title: string }>();
    expect(trashed?.title).toBe("Alpha");
  });

  it("keeps the current title when a backup's title is blank", async () => {
    const seed = await seedGraph(db);
    const result = await replaceGraphContents(db, USER, seed.graph.id, {
      version: 1,
      exportedAt: new Date().toISOString(),
      graph: { ...seed.graph, title: "   " },
      nodes: [],
      edges: [],
    });
    if (!result || "error" in result) throw new Error(JSON.stringify(result));
    expect(result.graph.title).toBe("Seed");
  });

  it("hides every mutating function from a stranger", async () => {
    const seed = await seedGraph(db);
    const stranger = "someone-else";
    const [a] = seed.nodes.map((node) => node.id) as [string];
    expect(await getGraphDetail(db, stranger, seed.graph.id)).toBeNull();
    expect(await updateNode(db, stranger, seed.graph.id, a, { title: "x" })).toBeNull();
    expect(await deleteNodes(db, stranger, seed.graph.id, [a], false)).toBeNull();
    expect(await restoreNodes(db, stranger, seed.graph.id, [a], [])).toBeNull();
    expect(await createBatch(db, stranger, seed.graph.id, { nodes: [{}], edges: [] })).toBeNull();
    expect(
      await updateEdge(db, stranger, seed.graph.id, seed.edges[0]!.id, { label: "x" }),
    ).toBeNull();
    expect((await deleteGraph(db, stranger, seed.graph.id)).ok).toBe(false);
    expect(await restoreGraph(db, stranger, seed.graph.id)).toBeNull();
    expect(await ownsGraph(db, stranger, seed.graph.id)).toBe(false);
    expect(await ownsGraph(db, USER, seed.graph.id)).toBe(true);
    expect((await getGraphDetail(db, USER, seed.graph.id))?.nodes).toHaveLength(2);
  });

  it("stays under D1's bind limit when deleting and restoring many cards", async () => {
    const created = await createGraph(db, USER, "Many", { withRootNode: false });
    if ("error" in created) throw new Error(created.error);
    const batch = await createBatch(db, USER, created.graph.id, {
      nodes: Array.from({ length: 150 }, (_, i) => ({ tempId: `t${i}`, title: `n${i}` })),
      edges: Array.from({ length: 149 }, (_, i) => ({ source: `t${i}`, target: `t${i + 1}` })),
    });
    if (!batch || "error" in batch) throw new Error(JSON.stringify(batch));
    const ids = batch.nodes.map((node) => node.id);
    const deleted = await deleteNodes(db, USER, created.graph.id, ids, false);
    expect(deleted?.deletedNodeIds).toHaveLength(150);
    const restored = await restoreNodes(db, USER, created.graph.id, ids, deleted!.deletedEdgeIds);
    if (!restored || "error" in restored) throw new Error("restore failed");
    expect(restored.nodes).toHaveLength(150);
    expect(restored.edges).toHaveLength(149);
  });
});
