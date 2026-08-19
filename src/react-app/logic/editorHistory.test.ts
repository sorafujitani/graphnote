import { describe, expect, it } from "vite-plus/test";
import type { NodeRecord } from "../../shared/types";
import { EMPTY_HISTORY, historyStep, makeHistoryEntry, recordHistory } from "./editorHistory";

const node = (id: string, x: number): NodeRecord => ({
  id,
  graph_id: "g1",
  title: id,
  body: "",
  x,
  y: 0,
  width: null,
  height: null,
  created_at: "now",
  updated_at: "now",
});

describe("editor history", () => {
  it("keeps only changed nodes and clears redo after a new edit", () => {
    const entry = makeHistoryEntry(
      "移動",
      [node("n1", 0), node("n2", 10)],
      [node("n1", 20), node("n2", 10)],
    );
    expect(entry?.before.map(({ id }) => id)).toEqual(["n1"]);
    const withFuture = { past: [], future: [entry!] };
    expect(recordHistory(withFuture, entry!).future).toEqual([]);
  });

  it("moves an entry between undo and redo stacks", () => {
    const entry = makeHistoryEntry("移動", [node("n1", 0)], [node("n1", 20)])!;
    const history = recordHistory(EMPTY_HISTORY, entry);
    const undone = historyStep(history, "undo")!;
    expect(undone.target[0]?.x).toBe(0);
    const redone = historyStep(undone.next, "redo")!;
    expect(redone.target[0]?.x).toBe(20);
  });
});
