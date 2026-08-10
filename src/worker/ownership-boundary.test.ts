import { describe, expect, it } from "vite-plus/test";
import {
  cascadeSelect,
  createEdge,
  createNode,
  deleteEdge,
  deleteGraph,
  deleteNodes,
  formatGraphLayout,
  getGraphDetail,
  renameGraph,
  updateNode,
} from "./db";

const OWNER = "owner-1";
const GRAPH = "graph-1";

/**
 * Minimal D1 stand-in: the graphs table has exactly one row (GRAPH owned by
 * OWNER), one node and no edges. Enough to prove every mutating function
 * refuses a caller who is not the owner.
 */
function fakeDb(): D1Database {
  const node = {
    id: "node-1",
    graph_id: GRAPH,
    title: "t",
    body: "",
    x: 0,
    y: 0,
    width: null,
    height: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM graphs WHERE id = ? AND owner_id = ?")) {
                return args[0] === GRAPH && args[1] === OWNER
                  ? {
                      id: GRAPH,
                      owner_id: OWNER,
                      title: "g",
                      created_at: node.created_at,
                      updated_at: node.updated_at,
                    }
                  : null;
              }
              if (sql.includes("COUNT(*)")) return { n: 1 };
              if (sql.includes("FROM nodes WHERE id = ? AND graph_id = ?")) {
                return args[0] === node.id && args[1] === GRAPH ? node : null;
              }
              return null;
            },
            async all() {
              if (sql.includes("FROM nodes WHERE graph_id = ?") && args[0] === GRAPH) {
                return { results: [node] };
              }
              if (sql.includes("SELECT id FROM nodes WHERE graph_id = ?") && args[0] === GRAPH) {
                return { results: [{ id: node.id }] };
              }
              return { results: [] };
            },
            async run() {
              // DELETE/UPDATE ... WHERE ... owner_id = ? must not report a
              // change for the wrong owner.
              if (sql.includes("owner_id = ?")) {
                const changed = args.includes(OWNER) && args.includes(GRAPH);
                return { meta: { changes: changed ? 1 : 0 } };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ results: [] }));
    },
  } as unknown as D1Database;
}

const STRANGER = "someone-else";

describe("ownership boundary: another user's graph is invisible", () => {
  it("getGraphDetail returns null", async () => {
    expect(await getGraphDetail(fakeDb(), STRANGER, GRAPH)).toBeNull();
    expect(await getGraphDetail(fakeDb(), OWNER, GRAPH)).not.toBeNull();
  });

  it("renameGraph returns null", async () => {
    expect(await renameGraph(fakeDb(), STRANGER, GRAPH, "hijack")).toBeNull();
  });

  it("deleteGraph returns false", async () => {
    expect(await deleteGraph(fakeDb(), STRANGER, GRAPH)).toBe(false);
  });

  it("createNode returns null", async () => {
    expect(await createNode(fakeDb(), STRANGER, GRAPH, { title: "x" })).toBeNull();
    expect(await createNode(fakeDb(), OWNER, GRAPH, { title: "x" })).not.toBeNull();
  });

  it("updateNode returns null", async () => {
    expect(await updateNode(fakeDb(), STRANGER, GRAPH, "node-1", { title: "x" })).toBeNull();
  });

  it("deleteNodes returns null", async () => {
    expect(await deleteNodes(fakeDb(), STRANGER, GRAPH, ["node-1"], false)).toBeNull();
    expect(await deleteNodes(fakeDb(), OWNER, GRAPH, ["node-1"], false)).not.toBeNull();
  });

  it("createEdge returns null", async () => {
    expect(
      await createEdge(fakeDb(), STRANGER, GRAPH, { source_id: "a", target_id: "b" }),
    ).toBeNull();
  });

  it("deleteEdge returns false", async () => {
    expect(await deleteEdge(fakeDb(), STRANGER, GRAPH, "edge-1")).toBe(false);
  });

  it("cascadeSelect returns null", async () => {
    expect(await cascadeSelect(fakeDb(), STRANGER, GRAPH, ["node-1"])).toBeNull();
  });

  it("formatGraphLayout returns null", async () => {
    expect(await formatGraphLayout(fakeDb(), STRANGER, GRAPH)).toBeNull();
  });
});

describe("node input validation at the db layer", () => {
  it("rejects non-finite coordinates", async () => {
    expect(await createNode(fakeDb(), OWNER, GRAPH, { x: Number.NaN })).toEqual({
      error: "x must be finite",
    });
    expect(
      await updateNode(fakeDb(), OWNER, GRAPH, "node-1", { y: Number.POSITIVE_INFINITY }),
    ).toEqual({ error: "y must be finite" });
  });
});
