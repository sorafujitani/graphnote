import { describe, expect, it } from "vite-plus/test";
import { QUOTA } from "../shared/quota";
import type { GraphExport } from "../shared/types";
import { importGraph } from "./db";

type RecordedStatement = {
  sql: string;
  args: unknown[];
};

function mockDb(opts: { graphCount?: number; batches?: RecordedStatement[][] } = {}) {
  const graphCount = opts.graphCount ?? 0;
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            sql,
            args,
            async first<T>() {
              if (sql.includes("COUNT(*)") && sql.includes("FROM graphs")) {
                return { n: graphCount } as T;
              }
              if (sql.includes("FROM graphs WHERE id")) {
                return {
                  id: String(args[0]),
                  owner_id: String(args[1]),
                  title: "Imported note",
                  created_at: "",
                  updated_at: "",
                } as T;
              }
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(statements: RecordedStatement[]) {
      opts.batches?.push(statements);
      return [];
    },
  } as unknown as D1Database;
}

describe("ownership / import guards", () => {
  it("rejects unsupported export version without writing", async () => {
    const result = await importGraph(mockDb(), "user-a", {
      version: 2,
    } as unknown as GraphExport);
    expect(result).toEqual({ error: "unsupported export version" });
  });

  it("rejects when user is at graph quota", async () => {
    const payload: GraphExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      graph: {
        id: "g1",
        owner_id: "other",
        title: "Note",
        created_at: "",
        updated_at: "",
      },
      nodes: [],
      edges: [],
    };
    const result = await importGraph(
      mockDb({ graphCount: QUOTA.maxGraphsPerUser }),
      "user-a",
      payload,
    );
    expect(result).toEqual({ error: `graph limit (${QUOTA.maxGraphsPerUser})` });
  });

  it("imports a graph in one ordered batch and skips duplicate or invalid edges", async () => {
    const batches: RecordedStatement[][] = [];
    const payload: GraphExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      graph: {
        id: "source",
        owner_id: "other",
        title: "Imported note",
        created_at: "",
        updated_at: "",
      },
      nodes: [
        {
          id: "n1",
          graph_id: "source",
          title: "One",
          body: "",
          x: 0,
          y: 0,
          width: null,
          height: null,
          created_at: "",
          updated_at: "",
        },
        {
          id: "n2",
          graph_id: "source",
          title: "Two",
          body: "",
          x: 100,
          y: 0,
          width: null,
          height: null,
          created_at: "",
          updated_at: "",
        },
      ],
      edges: [
        {
          id: "e1",
          graph_id: "source",
          source_id: "n1",
          target_id: "n2",
          label: "",
          created_at: "",
        },
        {
          id: "duplicate",
          graph_id: "source",
          source_id: "n1",
          target_id: "n2",
          label: "",
          created_at: "",
        },
        {
          id: "missing",
          graph_id: "source",
          source_id: "n1",
          target_id: "unknown",
          label: "",
          created_at: "",
        },
      ],
    };

    const result = await importGraph(mockDb({ batches }), "user-a", payload);

    expect(result).toMatchObject({ graph: { owner_id: "user-a" } });
    expect(batches).toHaveLength(1);
    expect(batches[0].filter(({ sql }) => sql.includes("INSERT INTO graphs"))).toHaveLength(1);
    expect(batches[0].filter(({ sql }) => sql.includes("INSERT INTO nodes"))).toHaveLength(2);
    expect(batches[0].filter(({ sql }) => sql.includes("INSERT INTO edges"))).toHaveLength(1);
  });
});
