import { describe, expect, it } from "vitest";
import { QUOTA } from "../shared/quota";
import type { GraphExport } from "../shared/types";
import { importGraph } from "./db";

function mockDb(opts: { graphCount?: number } = {}) {
  const graphCount = opts.graphCount ?? 0;
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("COUNT(*)") && sql.includes("FROM graphs")) {
                return { n: graphCount } as T;
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
    async batch() {
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
});
