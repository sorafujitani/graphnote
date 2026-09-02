import type { EdgeRecord, NodeRecord } from "../../shared/types";

export type NodeVersion = Pick<
  NodeRecord,
  "id" | "title" | "body" | "x" | "y" | "width" | "height"
>;

/** Records that left or joined the canvas; the same set is trashed and restored. */
type PresenceEntry = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
};

export type HistoryEntry =
  | { kind: "update"; label: string; before: NodeVersion[]; after: NodeVersion[] }
  | ({ kind: "create"; label: string } & PresenceEntry)
  | ({ kind: "delete"; label: string } & PresenceEntry);

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
    kind: "update",
    label,
    before: pairs.map((pair) => nodeVersion(pair.before)),
    after: pairs.map((pair) => nodeVersion(pair.after)),
  };
}

export function makePresenceEntry(
  kind: "create" | "delete",
  label: string,
  nodes: NodeRecord[],
  edges: EdgeRecord[],
): HistoryEntry | null {
  if (nodes.length === 0 && edges.length === 0) return null;
  return { kind, label, nodes, edges };
}

export function recordHistory(history: EditorHistory, entry: HistoryEntry): EditorHistory {
  return { past: [...history.past.slice(-49), entry], future: [] };
}

/** What applying `entry` in `direction` must do to the canvas. */
export type HistoryOperation =
  | { type: "apply"; versions: NodeVersion[] }
  | ({ type: "restore" } & PresenceEntry)
  | ({ type: "trash" } & PresenceEntry);

function historyOperation(entry: HistoryEntry, direction: "undo" | "redo"): HistoryOperation {
  if (entry.kind === "update") {
    return { type: "apply", versions: direction === "undo" ? entry.before : entry.after };
  }
  const presence = { nodes: entry.nodes, edges: entry.edges };
  const bringBack = (entry.kind === "delete") === (direction === "undo");
  return bringBack ? { type: "restore", ...presence } : { type: "trash", ...presence };
}

export function historyStep(
  history: EditorHistory,
  direction: "undo" | "redo",
): { entry: HistoryEntry; operation: HistoryOperation; next: EditorHistory } | null {
  if (direction === "undo") {
    const entry = history.past.at(-1);
    if (!entry) return null;
    return {
      entry,
      operation: historyOperation(entry, "undo"),
      next: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    };
  }
  const entry = history.future[0];
  if (!entry) return null;
  return {
    entry,
    operation: historyOperation(entry, "redo"),
    next: { past: [...history.past, entry], future: history.future.slice(1) },
  };
}

export function versionPatch(version: NodeVersion): Omit<NodeVersion, "id"> {
  const { id: _id, ...patch } = version;
  return patch;
}
