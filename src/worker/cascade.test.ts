import { describe, expect, it } from "vitest";
import type { EdgeRecord } from "../shared/types";
import { computeCascade } from "./cascade";

function edge(id: string, source_id: string, target_id: string): EdgeRecord {
  return {
    id,
    graph_id: "g1",
    source_id,
    target_id,
    label: "",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("computeCascade", () => {
  it("selects outgoing descendants and edges", () => {
    const edges = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "x", "y")];
    const result = computeCascade(edges, ["a"], "outgoing");
    expect(result.nodeIds.sort()).toEqual(["a", "b", "c"]);
    expect(result.edgeIds.sort()).toEqual(["e1", "e2"]);
  });

  it("includes both directions when mode is both", () => {
    const edges = [edge("e1", "a", "b"), edge("e2", "c", "b")];
    const result = computeCascade(edges, ["b"], "both");
    expect(result.nodeIds.sort()).toEqual(["a", "b", "c"]);
    expect(result.edgeIds.sort()).toEqual(["e1", "e2"]);
  });

  it("returns the seed alone when there are no edges", () => {
    const result = computeCascade([], ["root"], "outgoing");
    expect(result).toEqual({ nodeIds: ["root"], edgeIds: [] });
  });
});
