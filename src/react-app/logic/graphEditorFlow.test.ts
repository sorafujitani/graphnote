import { describe, expect, it } from "vite-plus/test";
import type { NodeRecord } from "../../shared/types";
import type { AppNode } from "./graphEditorTypes";
import { presentNodes } from "./graphEditorFlow";

function record(id: string, overrides: Partial<NodeRecord> = {}): NodeRecord {
  return {
    id,
    graph_id: "g1",
    title: "t",
    body: "",
    x: 0,
    y: 0,
    width: null,
    height: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("presentNodes reference identity", () => {
  it("returns the same array when nothing changed", () => {
    const records = [record("a"), record("b")];
    const first = presentNodes(records, [], null, null, []);
    const second = presentNodes(records, [], null, null, first);
    expect(second).toBe(first);
  });

  it("keeps unchanged node objects identical so React Flow skips re-adoption", () => {
    const records = [record("a"), record("b")];
    const first = presentNodes(records, [], null, null, []);
    const second = presentNodes(records, ["b"], null, null, first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
  });

  it("preserves React Flow's measured data when patching a node", () => {
    const records = [record("a")];
    const first = presentNodes(records, [], null, null, []);
    const measured = { ...(first[0] as AppNode), measured: { width: 280, height: 120 } };
    const second = presentNodes(records, ["a"], null, null, [measured]);
    expect((second[0] as AppNode & { measured?: object }).measured).toEqual({
      width: 280,
      height: 120,
    });
  });

  it("drops the style entirely when dimensions reset to null", () => {
    const sized = [record("a", { width: 300, height: 200 })];
    const first = presentNodes(sized, [], null, null, []);
    expect(first[0]?.style).toEqual({ width: 300, height: 200 });
    const reset = [record("a")];
    const second = presentNodes(reset, [], null, null, first);
    expect(second[0]?.style).toBeUndefined();
  });
});
