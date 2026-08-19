import type { NodeRecord } from "../../shared/types";

export type NodeVersion = Pick<
  NodeRecord,
  "id" | "title" | "body" | "x" | "y" | "width" | "height"
>;

export type HistoryEntry = {
  label: string;
  before: NodeVersion[];
  after: NodeVersion[];
};

export type EditorHistory = {
  past: HistoryEntry[];
  future: HistoryEntry[];
};

export const EMPTY_HISTORY: EditorHistory = { past: [], future: [] };

function nodeVersion(node: NodeRecord): NodeVersion {
  const { id, title, body, x, y, width, height } = node;
  return { id, title, body, x, y, width, height };
}

function changed(before: NodeVersion, after: NodeVersion) {
  return (
    before.title !== after.title ||
    before.body !== after.body ||
    before.x !== after.x ||
    before.y !== after.y ||
    before.width !== after.width ||
    before.height !== after.height
  );
}

export function makeHistoryEntry(
  label: string,
  before: NodeRecord[],
  after: NodeRecord[],
): HistoryEntry | null {
  const beforeById = new Map(before.map((node) => [node.id, node]));
  const pairs = after
    .map((node) => ({ before: beforeById.get(node.id), after: node }))
    .filter((pair): pair is { before: NodeRecord; after: NodeRecord } =>
      Boolean(pair.before && changed(nodeVersion(pair.before), nodeVersion(pair.after))),
    );
  if (pairs.length === 0) return null;
  return {
    label,
    before: pairs.map((pair) => nodeVersion(pair.before)),
    after: pairs.map((pair) => nodeVersion(pair.after)),
  };
}

export function recordHistory(history: EditorHistory, entry: HistoryEntry): EditorHistory {
  return { past: [...history.past.slice(-49), entry], future: [] };
}

export function historyStep(
  history: EditorHistory,
  direction: "undo" | "redo",
): { entry: HistoryEntry; target: NodeVersion[]; next: EditorHistory } | null {
  if (direction === "undo") {
    const entry = history.past.at(-1);
    if (!entry) return null;
    return {
      entry,
      target: entry.before,
      next: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    };
  }
  const entry = history.future[0];
  if (!entry) return null;
  return {
    entry,
    target: entry.after,
    next: { past: [...history.past, entry], future: history.future.slice(1) },
  };
}

export function versionPatch(version: NodeVersion): Omit<NodeVersion, "id"> {
  const { id: _id, ...patch } = version;
  return patch;
}
