import { describe, expect, it } from "vite-plus/test";
import type { EdgeRecord, Graph, NodeRecord } from "../shared/types";
import { estimateNoteHeight } from "../shared/estimateNoteHeight";
import { formatGraphLayout } from "./db";

const GRAPH: Graph = {
  id: "g1",
  owner_id: "u1",
  title: "Canvas",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function node(overrides: Partial<NodeRecord> = {}): NodeRecord {
  return {
    id: "n1",
    graph_id: GRAPH.id,
    title: "長い本文",
    body: Array.from({ length: 10 }, (_, index) => `- 項目 ${index + 1}`).join("\n"),
    x: 0,
    y: 0,
    width: 420,
    height: 100,
    created_at: GRAPH.created_at,
    updated_at: GRAPH.updated_at,
    ...overrides,
  };
}

function database(initialNodes: NodeRecord[], initialEdges: EdgeRecord[] = []): D1Database {
  const nodes = initialNodes.map((item) => ({ ...item }));
  const edges = initialEdges.map((item) => ({ ...item }));

  const prepare = (sql: string) => ({
    bind(...args: unknown[]) {
      return {
        async first() {
          if (sql.includes("FROM graphs WHERE id = ? AND owner_id = ?")) {
            return args[0] === GRAPH.id && args[1] === GRAPH.owner_id ? GRAPH : null;
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM nodes WHERE graph_id = ?")) return { results: nodes };
          if (sql.includes("FROM edges WHERE graph_id = ?")) return { results: edges };
          return { results: [] };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        sql,
        args,
      };
    },
  });

  return {
    prepare,
    async batch(statements: Array<{ sql: string; args: unknown[] }>) {
      for (const statement of statements) {
        if (!statement.sql.startsWith("UPDATE nodes SET")) continue;
        const hasHeight = statement.sql.includes("height = ?");
        const nodeId = statement.args[hasHeight ? 4 : 3];
        const target = nodes.find((item) => item.id === nodeId);
        if (!target) continue;
        target.x = statement.args[0] as number;
        target.y = statement.args[1] as number;
        if (hasHeight) target.height = statement.args[2] as number;
      }
      return statements.map(() => ({ results: [] }));
    },
  } as unknown as D1Database;
}

describe("formatGraphLayout content sizing", () => {
  it("expands a saved height when the body would otherwise be clipped", async () => {
    const saved = node();
    const result = await formatGraphLayout(database([saved]), GRAPH.owner_id, GRAPH.id);

    const formatted = result?.nodes[0];
    expect(formatted?.height).toBeGreaterThan(saved.height as number);
    expect(formatted?.height).toBe(estimateNoteHeight(saved.title, saved.body, saved.width));
  });

  it("does not turn content-sized cards into fixed-size cards", async () => {
    const contentSized = node({ height: null });
    const result = await formatGraphLayout(database([contentSized]), GRAPH.owner_id, GRAPH.id);

    expect(result?.nodes[0]?.height).toBeNull();
  });
});
