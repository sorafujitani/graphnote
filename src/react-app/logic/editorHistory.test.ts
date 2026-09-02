import { describe, expect, it } from "vite-plus/test";
import type { EdgeRecord, NodeRecord } from "../../shared/types";
import {
  EMPTY_HISTORY,
  historyStep,
  makeHistoryEntry,
  makePresenceEntry,
  recordHistory,
} from "./editorHistory";

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

const edge: EdgeRecord = {
  id: "e1",
  graph_id: "g1",
  source_id: "n1",
  target_id: "n2",
  label: "",
  created_at: "now",
};

describe("editor history", () => {
  it("keeps only changed nodes and clears redo after a new edit", () => {
    const entry = makeHistoryEntry(
      "移動",
      [node("n1", 0), node("n2", 10)],
      [node("n1", 20), node("n2", 10)],
    );
    if (entry?.kind !== "update") throw new Error("expected an update entry");
    expect(entry.before.map(({ id }) => id)).toEqual(["n1"]);
    const withFuture = { past: [], future: [entry] };
    expect(recordHistory(withFuture, entry).future).toEqual([]);
  });

  it("moves an entry between undo and redo stacks", () => {
    const entry = makeHistoryEntry("移動", [node("n1", 0)], [node("n1", 20)])!;
    const history = recordHistory(EMPTY_HISTORY, entry);
    const undone = historyStep(history, "undo")!;
    expect(undone.operation).toMatchObject({ type: "apply", versions: [{ x: 0 }] });
    const redone = historyStep(undone.next, "redo")!;
    expect(redone.operation).toMatchObject({ type: "apply", versions: [{ x: 20 }] });
  });

  it("undoes a deletion by restoring and redoes it by trashing again", () => {
    const entry = makePresenceEntry("delete", "削除", [node("n1", 0)], [edge])!;
    const history = recordHistory(EMPTY_HISTORY, entry);
    const undone = historyStep(history, "undo")!;
    expect(undone.operation).toMatchObject({ type: "restore", edges: [edge] });
    const redone = historyStep(undone.next, "redo")!;
    expect(redone.operation.type).toBe("trash");
  });

  it("undoes a creation by trashing and skips an empty presence entry", () => {
    const entry = makePresenceEntry("create", "追加", [node("n1", 0)], [])!;
    const undone = historyStep(recordHistory(EMPTY_HISTORY, entry), "undo")!;
    expect(undone.operation.type).toBe("trash");
    expect(makePresenceEntry("create", "追加", [], [])).toBeNull();
  });
});
