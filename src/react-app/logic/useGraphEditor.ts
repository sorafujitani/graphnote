import {
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { computeCascade } from "../../shared/cascade";
import type { EdgeRecord, Graph, NodeRecord } from "../../shared/types";
import { estimateNoteHeight } from "../../shared/estimateNoteHeight";
import { placeChildPosition } from "../../shared/placeChild";
import { clampNoteHeight, clampNoteWidth } from "../../shared/noteSize";
import { reflowAroundNode } from "../../shared/reflowTree";
import { toggleTask } from "../../shared/taskList";
import { isEditableTarget, isInteractiveTarget, nearestNodeId } from "../lib/keyboard";
import { userMessage } from "../lib/userMessage";
import { ApiError, ConflictError, api, type ExportEntry } from "../server/api";
import {
  EMPTY_HISTORY,
  historyStep,
  makeHistoryEntry,
  makePresenceEntry,
  recordHistory,
  versionPatch,
  type EditorHistory,
  type HistoryEntry,
} from "./editorHistory";
import { presentEdges, presentNodes, type Visibility } from "./graphEditorFlow";
import type { AppNode, EditRequest } from "./graphEditorTypes";

export type UseGraphEditorOptions = {
  graphId: string;
  /** Card to select and center once the note has loaded (deep link / search hit). */
  focusNodeId?: string | null;
  onBack: () => void;
};

export type EditorDialog =
  | { name: "help" }
  | { name: "search" }
  | { name: "edgeLabel"; edgeId: string }
  | { name: "restore" }
  | {
      name: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    };

export type EditorNotice = { message: string; action?: { label: string; run: () => void } };

/** An edit the server refused; the text stays on screen until the user decides. */
export type FailedSave = {
  nodeId: string;
  patch: { title?: string; body?: string };
  message: string;
  /** Set on a version conflict: what the server holds now. */
  current: NodeRecord | null;
  /** The record before the optimistic edit, for "discard". */
  before: NodeRecord;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function waitFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (n: number) => {
      if (n <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(n - 1));
    };
    step(count);
  });
}

function sameIds(previous: string[], next: string[]) {
  return previous.length === next.length && previous.every((id, index) => id === next[index]);
}

function exportFileName(title: string, exportedAt: string): string {
  const slug =
    title
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "graphnote";
  return `graphnote-${slug}-${exportedAt.replace(/[:.]/g, "-")}.json`;
}

/** Cards hidden by collapsed branches, and how many each collapsed card hides. */
function computeVisibility(
  collapsedIds: Set<string>,
  nodeRecords: NodeRecord[],
  edgeRecords: EdgeRecord[],
): Visibility {
  const hidden = new Set<string>();
  const collapsedCounts = new Map<string, number>();
  if (collapsedIds.size === 0) return { hidden, collapsedCounts };
  const live = new Set(nodeRecords.map((node) => node.id));
  for (const id of collapsedIds) {
    if (!live.has(id)) continue;
    const descendants = computeCascade(edgeRecords, [id], "outgoing").nodeIds.filter(
      (nodeId) => nodeId !== id,
    );
    for (const nodeId of descendants) hidden.add(nodeId);
    collapsedCounts.set(id, descendants.length);
  }
  // A collapsed card inside another collapsed branch stays hidden itself.
  for (const id of collapsedIds) if (hidden.has(id)) collapsedCounts.delete(id);
  return { hidden, collapsedCounts };
}

export function useGraphEditor({ graphId, focusNodeId, onBack }: UseGraphEditorOptions) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [nodeRecords, setNodeRecords] = useState<NodeRecord[]>([]);
  const [edgeRecords, setEdgeRecords] = useState<EdgeRecord[]>([]);
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  /** The note under the pointer; selection stands in for it without a mouse. */
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [dialog, setDialog] = useState<EditorDialog | null>(null);
  const [history, setHistory] = useState<EditorHistory>(EMPTY_HISTORY);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [pendingWrites, setPendingWrites] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);
  const [failedSaves, setFailedSaves] = useState<Map<string, FailedSave>>(() => new Map());
  const [loadError, setLoadError] = useState<"notFound" | null>(null);
  const [exports, setExports] = useState<ExportEntry[] | null>(null);

  const noticeTimerRef = useRef<number | null>(null);
  const showNotice = useCallback((message: string, action?: EditorNotice["action"]) => {
    setNotice({ message, action });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), action ? 8000 : 4000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  // "保存済み" shows briefly after the last write lands, then the header goes quiet.
  const savedTimerRef = useRef<number | null>(null);
  const trackWrite = useCallback(<T>(work: Promise<T>): Promise<T> => {
    setPendingWrites((count) => count + 1);
    return work.finally(() => {
      setPendingWrites((count) => {
        const next = count - 1;
        if (next === 0) {
          setSavedFlash(true);
          if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
          savedTimerRef.current = window.setTimeout(() => setSavedFlash(false), 2000);
        }
        return next;
      });
    });
  }, []);
  useEffect(
    () => () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<AppNode, Edge> | null>(null);
  const updateInternalsRef = useRef<((ids: string[]) => void) | null>(null);
  const creatingChildRef = useRef(false);
  const cascadeSelectingRef = useRef(false);

  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const selectedEdgeIdsRef = useRef(selectedEdgeIds);
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  const nodeRecordsRef = useRef(nodeRecords);
  const edgeRecordsRef = useRef(edgeRecords);
  const busyRef = useRef(busy);
  const linkSourceIdRef = useRef(linkSourceId);
  const dialogRef = useRef(dialog);
  const historyRef = useRef(history);
  const pendingWritesRef = useRef(pendingWrites);
  const failedSavesRef = useRef(failedSaves);
  useLayoutEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
    selectedEdgeIdsRef.current = selectedEdgeIds;
    hoveredNodeIdRef.current = hoveredNodeId;
    nodeRecordsRef.current = nodeRecords;
    edgeRecordsRef.current = edgeRecords;
    busyRef.current = busy;
    linkSourceIdRef.current = linkSourceId;
    dialogRef.current = dialog;
    historyRef.current = history;
    pendingWritesRef.current = pendingWrites;
    failedSavesRef.current = failedSaves;
  }, [
    busy,
    edgeRecords,
    hoveredNodeId,
    linkSourceId,
    dialog,
    history,
    nodeRecords,
    selectedEdgeIds,
    selectedNodeIds,
    pendingWrites,
    failedSaves,
  ]);

  const pushEntry = useCallback((entry: HistoryEntry | null) => {
    if (!entry) return;
    setHistory((previous) => {
      const next = recordHistory(previous, entry);
      historyRef.current = next;
      return next;
    });
  }, []);

  const pushHistory = useCallback(
    (label: string, before: NodeRecord[], after: NodeRecord[]) => {
      pushEntry(makeHistoryEntry(label, before, after));
    },
    [pushEntry],
  );

  const activeParentId = hoveredNodeId ?? selectedNodeIds[0] ?? null;

  /** Same rule as `activeParentId`, for callbacks that only hold refs. */
  const currentParentId = useCallback(
    () => hoveredNodeIdRef.current ?? selectedNodeIdsRef.current[0] ?? null,
    [],
  );

  /** Asks a note to open one of its editors; the note focuses it as it mounts. */
  const requestEdit = useCallback((nodeId: string, field: "title" | "body") => {
    setEditRequest((prev) => ({ nodeId, field, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  /** In-app confirmation; resolves false when the dialog is dismissed. */
  const confirmAction = useCallback(
    (options: { title: string; message: string; confirmLabel: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setDialog({
          name: "confirm",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel,
          danger: options.danger ?? false,
          resolve: (ok) => {
            setDialog(null);
            requestAnimationFrame(() => canvasRef.current?.focus());
            resolve(ok);
          },
        });
      }),
    [],
  );

  /**
   * Slides neighbours out of the way when a card's content grew, exactly as a
   * manual resize does. Returns the y-patches it persisted.
   */
  const reflowAfterChange = useCallback(
    (nodeId: string, next: NodeRecord, before: NodeRecord | undefined) => {
      const records = nodeRecordsRef.current.map((node) => (node.id === nodeId ? next : node));
      const moved = reflowAroundNode(
        records.map((record) => ({
          id: record.id,
          x: record.x,
          width: record.width,
          y: record.y,
          height: record.height ?? estimateNoteHeight(record.title, record.body, record.width),
        })),
        edgeRecordsRef.current,
        nodeId,
        undefined,
        before && {
          y: before.y,
          height: before.height ?? estimateNoteHeight(before.title, before.body, before.width),
        },
      );
      if (moved.size === 0) return;
      setNodeRecords((previous) =>
        previous.map((node) => {
          const y = moved.get(node.id);
          return y === undefined ? node : { ...node, y };
        }),
      );
      setNodes((previous) =>
        previous.map((node) => {
          const y = moved.get(node.id);
          return y === undefined ? node : { ...node, position: { x: node.position.x, y } };
        }),
      );
      for (const [id, y] of moved) {
        void trackWrite(api.updateNode(graphId, id, { y }))
          .then(({ node }) =>
            setNodeRecords((previous) =>
              previous.map((item) => (item.id === node.id ? { ...item, ...node } : item)),
            ),
          )
          .catch(() => {
            // Neighbour nudges are cosmetic; the next Arrange repairs them.
          });
      }
    },
    [graphId, trackWrite],
  );

  // One PATCH in flight per card, each carrying the version the previous one
  // returned: a body commit can no longer be overtaken by a slower title commit,
  // and an edit made elsewhere (CLI, another tab) fails loudly instead of
  // silently losing to this one.
  const saveQueueRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const persistNode = useCallback(
    (
      nodeId: string,
      patch: { title?: string; body?: string },
      options: { force?: boolean } = {},
    ) => {
      const before = nodeRecordsRef.current.find((item) => item.id === nodeId);
      if (!before) return;
      const optimistic: NodeRecord = {
        ...before,
        title: patch.title ?? before.title,
        body: patch.body ?? before.body,
      };
      setNodeRecords((prev) => prev.map((item) => (item.id === nodeId ? optimistic : item)));
      setFailedSaves((prev) => {
        if (!prev.has(nodeId)) return prev;
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });
      reflowAfterChange(nodeId, optimistic, before);

      const previous = saveQueueRef.current.get(nodeId) ?? Promise.resolve();
      const run = previous
        .catch(() => {})
        .then(() => {
          const known = nodeRecordsRef.current.find((item) => item.id === nodeId);
          return api.updateNode(
            graphId,
            nodeId,
            patch,
            options.force ? {} : { ifMatch: known?.updated_at ?? before.updated_at },
          );
        })
        .then(({ node }) => {
          setNodeRecords((prev) => prev.map((item) => (item.id === node.id ? node : item)));
          pushHistory("テキスト編集", [before], [node]);
        })
        .catch((err: unknown) => {
          // Keep the text on screen: the user typed it and can retry or discard.
          const conflict = err instanceof ConflictError ? err.current : null;
          setFailedSaves((prev) => {
            const next = new Map(prev);
            next.set(nodeId, {
              nodeId,
              patch,
              before,
              current: conflict,
              message: conflict
                ? "このノードは別の場所で更新されています。"
                : userMessage(err, "ノードを保存できませんでした。"),
            });
            return next;
          });
        });
      saveQueueRef.current.set(nodeId, run);
      void trackWrite(run);
    },
    [graphId, pushHistory, reflowAfterChange, trackWrite],
  );

  /** Re-sends a refused edit, overwriting whatever the server holds now. */
  const retryFailedSave = useCallback(
    (nodeId: string) => {
      const failed = failedSavesRef.current.get(nodeId);
      if (!failed) return;
      persistNode(nodeId, failed.patch, { force: true });
    },
    [persistNode],
  );

  /** Drops the refused edit and shows the server's version of the card. */
  const discardFailedSave = useCallback((nodeId: string) => {
    const failed = failedSavesRef.current.get(nodeId);
    if (!failed) return;
    const restored = failed.current ?? failed.before;
    setNodeRecords((prev) => prev.map((item) => (item.id === nodeId ? restored : item)));
    setFailedSaves((prev) => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const loadGraph = useCallback(
    async (signal?: { ignore: boolean }) => {
      setError(null);
      setLoadError(null);
      try {
        const detail = await api.getGraph(graphId);
        if (signal?.ignore) return;
        setGraph(detail.graph);
        setTitleDraft(detail.graph.title);
        setNodeRecords(detail.nodes);
        setEdgeRecords(detail.edges);
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
        setHoveredNodeId(null);
        setHistory(EMPTY_HISTORY);
        historyRef.current = EMPTY_HISTORY;
        setFailedSaves(new Map());
        setCollapsedIds(new Set());
        setNodes(presentNodes(detail.nodes, [], null, null, []));
        requestAnimationFrame(() => {
          void flowRef.current?.fitView({ padding: 0.25 });
        });
      } catch (err) {
        if (signal?.ignore) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("notFound");
          return;
        }
        setError(userMessage(err, "ノートを読み込めませんでした。もう一度お試しください。"));
      }
    },
    [graphId],
  );

  useEffect(() => {
    const signal = { ignore: false };
    void loadGraph(signal);
    return () => {
      signal.ignore = true;
    };
  }, [loadGraph]);

  // A note that is deleted or replaced never fires mouseleave, so a stale hover
  // would keep offering Tab a parent that is no longer under the pointer.
  useEffect(() => {
    setHoveredNodeId((previous) =>
      previous && !nodeRecords.some((node) => node.id === previous) ? null : previous,
    );
  }, [nodeRecords]);

  const visibility = useMemo(
    () => computeVisibility(collapsedIds, nodeRecords, edgeRecords),
    [collapsedIds, nodeRecords, edgeRecords],
  );

  useEffect(() => {
    setNodes((prev) =>
      presentNodes(nodeRecords, selectedNodeIds, activeParentId, editRequest, prev, visibility),
    );
  }, [nodeRecords, selectedNodeIds, activeParentId, editRequest, visibility]);

  const edges = useMemo(
    () => presentEdges(edgeRecords, new Set(selectedEdgeIds), visibility.hidden),
    [edgeRecords, selectedEdgeIds, visibility],
  );

  // After edges appear/change, remeasure handles so RF doesn't keep a blank path.
  useEffect(() => {
    if (edgeRecords.length === 0) return;
    const ids = new Set<string>();
    for (const edge of edgeRecords) {
      ids.add(edge.source_id);
      ids.add(edge.target_id);
    }
    let cancelled = false;
    void waitFrames(2).then(() => {
      if (cancelled) return;
      updateInternalsRef.current?.([...ids]);
    });
    return () => {
      cancelled = true;
    };
  }, [edgeRecords]);

  // Closing the tab with a save in flight, a refused save, or an open text
  // editor would lose typed text; the browser's own prompt is the safety net.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const editorOpen = document.querySelector(".note-title-editor, .note-body-editor") !== null;
      if (pendingWritesRef.current === 0 && failedSavesRef.current.size === 0 && !editorOpen)
        return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const selectNodes = useCallback((ids: string[]) => {
    setSelectedNodeIds((previous) => (sameIds(previous, ids) ? previous : ids));
    setSelectedEdgeIds((previous) => (previous.length === 0 ? previous : []));
  }, []);

  /** Selection is the keyboard's stand-in for hover, so focusing is selecting. */
  const focusParent = useCallback(
    (id: string | null) => {
      selectNodes(id ? [id] : []);
    },
    [selectNodes],
  );

  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
    for (const change of changes) {
      if (change.type === "position" && change.position && change.dragging === false) {
        const position = change.position;
        setNodeRecords((prev) =>
          prev.map((item) =>
            item.id === change.id ? { ...item, x: position.x, y: position.y } : item,
          ),
        );
      }
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    const selectionChanges = changes.filter((change) => change.type === "select");
    if (selectionChanges.length === 0) return;
    setSelectedEdgeIds((previous) => {
      const next = new Set(previous);
      for (const change of selectionChanges) {
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }
      return [...next];
    });
  }, []);

  // Synchronous on purpose: Delete right after a rubber-band selection reads
  // these ids from refs, and a deferred commit would still hold the old set.
  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const ids = params.nodes.map((node) => node.id);
    const edgeIds = params.edges.map((edge) => edge.id);
    setSelectedNodeIds((previous) => (sameIds(previous, ids) ? previous : ids));
    setSelectedEdgeIds((previous) => (sameIds(previous, edgeIds) ? previous : edgeIds));
  }, []);

  // Generous drop targets mean self-drops and repeats are easy; reject them here
  // so the drag shows invalid instead of failing on the server (UNIQUE + no self).
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (connection.source === connection.target) return false;
    return !edgeRecordsRef.current.some(
      (edge) => edge.source_id === connection.source && edge.target_id === connection.target,
    );
  }, []);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      try {
        const { edge } = await trackWrite(
          api.createEdge(graphId, {
            source_id: connection.source,
            target_id: connection.target,
          }),
        );
        setEdgeRecords((prev) =>
          prev.some((item) => item.id === edge.id) ? prev : [...prev, edge],
        );
        pushEntry(makePresenceEntry("create", "つながりを追加", [], [edge]));
      } catch (err) {
        setError(userMessage(err, "ノードをつなげませんでした。もう一度お試しください。"));
      }
    },
    [graphId, pushEntry, trackWrite],
  );

  const revealNodes = useCallback(() => {
    requestAnimationFrame(() => {
      void flowRef.current?.fitView({ padding: 0.25, duration: 200 });
    });
  }, []);

  const onAddNode = useCallback(
    async (opts?: {
      parentId?: string;
      focus?: boolean;
      requireParent?: boolean;
      at?: XYPosition;
    }) => {
      if (busyRef.current || creatingChildRef.current) return null;
      creatingChildRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const parentId = opts?.parentId;
        const parent = parentId
          ? nodeRecordsRef.current.find((node) => node.id === parentId)
          : null;

        // Tab/child path must never create an unlinked node.
        if (opts?.requireParent) {
          if (!parentId || !parent) {
            setError("つなぎ元のノードが見つかりません。先にノードを1つ選んでください。");
            return null;
          }
        }

        const offset = nodeRecordsRef.current.length * 24;
        const occupiedNodes = parent
          ? nodeRecordsRef.current.filter((node) => node.id !== parent.id)
          : [];
        const pos =
          opts?.at ??
          (parent
            ? placeChildPosition(parent, occupiedNodes)
            : { x: 120 + offset, y: 120 + offset });
        const { node } = await trackWrite(
          api.createNode(graphId, {
            title: "新しいノード",
            x: pos.x,
            y: pos.y,
          }),
        );

        setNodeRecords((prev) =>
          prev.some((item) => item.id === node.id) ? prev : [...prev, node],
        );

        // Wait until the new node/handles are mounted before attaching the edge,
        // otherwise React Flow can keep a zero-length / invisible path.
        await waitFrames(2);
        updateInternalsRef.current?.(
          [node.id, parent?.id].filter((id): id is string => Boolean(id)),
        );

        let createdEdge: EdgeRecord | null = null;
        if (parent) {
          try {
            const { edge } = await trackWrite(
              api.createEdge(graphId, {
                source_id: parent.id,
                target_id: node.id,
              }),
            );
            createdEdge = edge;
            setEdgeRecords((prev) =>
              prev.some((item) => item.id === edge.id) ? prev : [...prev, edge],
            );
            // A collapsed parent would hide the child that was just asked for.
            setCollapsedIds((prev) => {
              if (!prev.has(parent.id)) return prev;
              const next = new Set(prev);
              next.delete(parent.id);
              return next;
            });
            await waitFrames(1);
            updateInternalsRef.current?.([parent.id, node.id]);
          } catch (err) {
            // Tab/child path must never leave an unlinked node behind.
            if (opts?.requireParent) {
              let cleaned = true;
              await api.deleteNodes(graphId, [node.id], false).catch(() => {
                cleaned = false;
              });
              // Drop the local record only when the server dropped it too;
              // otherwise the canvas would hide a node that still exists.
              if (cleaned) {
                setNodeRecords((prev) => prev.filter((item) => item.id !== node.id));
                setError(
                  userMessage(err, "子ノードをつなげませんでした。もう一度お試しください。"),
                );
              } else {
                setError(
                  userMessage(
                    err,
                    "子ノードをつなげませんでした。つながっていないノードが残っています。",
                  ),
                );
              }
              return null;
            }
            setError(userMessage(err, "ノードをつなげませんでした。もう一度お試しください。"));
          }
        } else if (opts?.requireParent) {
          await api.deleteNodes(graphId, [node.id], false);
          setNodeRecords((prev) => prev.filter((item) => item.id !== node.id));
          setError("子ノードをつなげませんでした。もう一度お試しください。");
          return null;
        }

        pushEntry(
          makePresenceEntry("create", "ノードを追加", [node], createdEdge ? [createdEdge] : []),
        );
        selectNodes([node.id]);
        revealNodes();
        if (opts?.focus !== false) {
          requestEdit(node.id, "title");
        }
        return node;
      } catch (err) {
        setError(userMessage(err, "ノードを追加できませんでした。もう一度お試しください。"));
        return null;
      } finally {
        setBusy(false);
        creatingChildRef.current = false;
      }
    },
    [graphId, pushEntry, requestEdit, revealNodes, selectNodes, trackWrite],
  );
  const addChildFromActiveParent = useCallback(async () => {
    const parentId = currentParentId();
    if (!parentId) {
      const first = nodeRecordsRef.current[0]?.id;
      if (first) {
        focusParent(first);
        setError("最初のノードを選びました。もう一度Tabを押すと子ノードを追加できます。");
      } else {
        setError("ノードがまだありません。Nを押すと追加できます。");
      }
      return;
    }
    await onAddNode({ parentId, focus: true, requireParent: true });
  }, [currentParentId, focusParent, onAddNode]);

  /** Copies the selected cards (text and size, no links) next to the originals. */
  const duplicateSelection = useCallback(async () => {
    if (busyRef.current) return;
    const ids = new Set(selectedNodeIdsRef.current);
    const sources = nodeRecordsRef.current.filter((node) => ids.has(node.id));
    if (sources.length === 0) {
      setError("複製するノードを選んでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await trackWrite(
        api.createBatch(graphId, {
          nodes: sources.map((node) => ({
            title: node.title,
            body: node.body,
            x: node.x + 40,
            y: node.y + 40,
          })),
          edges: [],
        }),
      );
      // The batch API does not take sizes; carry a manual size over afterwards.
      const sized = await Promise.all(
        result.nodes.map(async (node, index) => {
          const source = sources[index];
          if (!source || (source.width === null && source.height === null)) return node;
          try {
            const saved = await trackWrite(
              api.updateNode(graphId, node.id, { width: source.width, height: source.height }),
            );
            return saved.node;
          } catch {
            return node;
          }
        }),
      );
      setNodeRecords((prev) => [...prev, ...sized]);
      pushEntry(makePresenceEntry("create", "ノードを複製", sized, []));
      selectNodes(sized.map((node) => node.id));
      showNotice(`${sized.length}件のノードを複製しました。`);
    } catch (err) {
      setError(userMessage(err, "ノードを複製できませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }, [graphId, pushEntry, selectNodes, showNotice, trackWrite]);

  const toggleCollapse = useCallback(
    (nodeId?: string) => {
      const id = nodeId ?? currentParentId();
      if (!id) {
        setError("折りたたむノードを選んでください。");
        return;
      }
      const hasChildren = edgeRecordsRef.current.some((edge) => edge.source_id === id);
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (hasChildren) next.add(id);
        return next;
      });
      if (!hasChildren && !collapsedIds.has(id)) {
        setError("このノードには下位ノードがありません。");
        return;
      }
      selectNodes([id]);
    },
    [collapsedIds, currentParentId, selectNodes],
  );

  const moveHistory = useCallback(
    async (direction: "undo" | "redo") => {
      if (busyRef.current) return;
      const step = historyStep(historyRef.current, direction);
      if (!step) return;
      setBusy(true);
      setError(null);
      const verb = direction === "undo" ? "元に戻す" : "やり直す";
      let failure: unknown = null;
      try {
        const operation = step.operation;
        if (operation.type === "apply") {
          const settled = await Promise.allSettled(
            operation.versions.map((version) =>
              trackWrite(api.updateNode(graphId, version.id, versionPatch(version))),
            ),
          );
          const saved = new Map<string, NodeRecord>();
          settled.forEach((result) => {
            if (result.status === "fulfilled") saved.set(result.value.node.id, result.value.node);
            else failure = result.reason;
          });
          if (saved.size > 0) {
            setNodeRecords((previous) => previous.map((node) => saved.get(node.id) ?? node));
            setNodes((previous) =>
              previous.map((node) => {
                const record = saved.get(node.id);
                if (!record) return node;
                const next = {
                  ...node,
                  position: { x: record.x, y: record.y },
                  width: record.width ?? undefined,
                  height: record.height ?? undefined,
                };
                next.style = {
                  ...node.style,
                  width: record.width ?? undefined,
                  height: record.height ?? undefined,
                };
                return next;
              }),
            );
            updateInternalsRef.current?.([...saved.keys()]);
          }
        } else if (operation.type === "restore") {
          const result = await trackWrite(
            api.restoreNodes(
              graphId,
              operation.nodes.map((node) => node.id),
              operation.edges.map((edge) => edge.id),
            ),
          );
          const restoredNodes = new Map(result.nodes.map((node) => [node.id, node]));
          const restoredEdges = new Map(result.edges.map((edge) => [edge.id, edge]));
          setNodeRecords((prev) => [
            ...prev.filter((node) => !restoredNodes.has(node.id)),
            ...restoredNodes.values(),
          ]);
          setEdgeRecords((prev) => [
            ...prev.filter((edge) => !restoredEdges.has(edge.id)),
            ...restoredEdges.values(),
          ]);
          selectNodes([...restoredNodes.keys()]);
        } else {
          const nodeIds = operation.nodes.map((node) => node.id);
          const removedEdgeIds = new Set(operation.edges.map((edge) => edge.id));
          if (nodeIds.length > 0) {
            const result = await trackWrite(api.deleteNodes(graphId, nodeIds, false));
            for (const id of result.deletedEdgeIds) removedEdgeIds.add(id);
            const gone = new Set(result.deletedNodeIds);
            setNodeRecords((prev) => prev.filter((node) => !gone.has(node.id)));
          } else {
            await Promise.all(
              operation.edges.map((edge) =>
                trackWrite(api.deleteEdge(graphId, edge.id)).catch((err) => {
                  if (!(err instanceof ApiError && err.status === 404)) throw err;
                }),
              ),
            );
          }
          setEdgeRecords((prev) => prev.filter((edge) => !removedEdgeIds.has(edge.id)));
          selectNodes([]);
        }
      } catch (err) {
        failure = err;
      }
      if (failure) {
        setError(
          userMessage(failure, `${verb}操作を保存できませんでした。もう一度お試しください。`),
        );
      } else {
        setHistory(step.next);
        historyRef.current = step.next;
        showNotice(
          `${step.entry.label}を${direction === "undo" ? "元に戻しました" : "やり直しました"}。`,
        );
      }
      setBusy(false);
    },
    [graphId, selectNodes, showNotice, trackWrite],
  );

  const onDeleteSelection = useCallback(
    async (cascade: boolean) => {
      if (busyRef.current) return;
      const selected = selectedNodeIdsRef.current;
      const edgeIds = selectedEdgeIdsRef.current;
      // A selected connection wins over a selected card. This makes Delete and
      // the toolbar safe even if React Flow briefly keeps both selected.
      const ids = !cascade && edgeIds.length > 0 ? [] : selected;
      if (ids.length === 0 && edgeIds.length === 0) return;
      // Removing a whole branch needs explicit consent even though it can be
      // undone. Only when nodes are actually part of the deletion — an
      // edge-only selection must not show a branch warning.
      if (cascade && ids.length > 0) {
        const ok = await confirmAction({
          title: "下位ノードごと削除",
          message: "選択したノードと、その下位ノードをすべて削除します。あとから元に戻せます。",
          confirmLabel: "削除する",
          danger: true,
        });
        if (!ok) return;
      }
      setBusy(true);
      setError(null);
      try {
        const removedEdgeIds = new Set<string>();
        const removedNodeIds = new Set<string>();
        if (ids.length > 0) {
          const result = await trackWrite(api.deleteNodes(graphId, ids, cascade));
          for (const id of result.deletedNodeIds) removedNodeIds.add(id);
          for (const edgeId of result.deletedEdgeIds) removedEdgeIds.add(edgeId);
          setNodeRecords((prev) => prev.filter((node) => !removedNodeIds.has(node.id)));
        }
        const remainingEdgeIds = edgeIds.filter((edgeId) => !removedEdgeIds.has(edgeId));
        // Apply every edge that did get deleted even when another one fails,
        // or the canvas keeps lines the server no longer has.
        const settled = await Promise.allSettled(
          remainingEdgeIds.map(async (edgeId) => {
            try {
              await trackWrite(api.deleteEdge(graphId, edgeId));
            } catch (err) {
              if (!(err instanceof ApiError && err.status === 404)) throw err;
            }
            return edgeId;
          }),
        );
        let edgeFailure: unknown = null;
        for (const outcome of settled) {
          if (outcome.status === "fulfilled") removedEdgeIds.add(outcome.value);
          else edgeFailure = outcome.reason;
        }
        if (removedEdgeIds.size > 0) {
          setEdgeRecords((prev) => prev.filter((edge) => !removedEdgeIds.has(edge.id)));
        }
        const removedNodes = nodeRecordsRef.current.filter((node) => removedNodeIds.has(node.id));
        const removedEdges = edgeRecordsRef.current.filter((edge) => removedEdgeIds.has(edge.id));
        const label =
          removedNodes.length === 0 ? "つながりを削除" : cascade ? "下位ごと削除" : "ノードを削除";
        pushEntry(makePresenceEntry("delete", label, removedNodes, removedEdges));
        if (edgeFailure) {
          setError(
            userMessage(
              edgeFailure,
              "一部のつながりを削除できませんでした。もう一度お試しください。",
            ),
          );
        } else {
          showNotice(
            removedNodes.length > 0
              ? `${removedNodes.length}件のノードを削除しました。`
              : "つながりを削除しました。",
            { label: "元に戻す", run: () => void moveHistory("undo") },
          );
        }
        selectNodes([]);
        setLinkSourceId(null);
        revealNodes();
      } catch (err) {
        setError(userMessage(err, "選択した項目を削除できませんでした。もう一度お試しください。"));
      } finally {
        setBusy(false);
      }
    },
    [
      confirmAction,
      graphId,
      moveHistory,
      pushEntry,
      revealNodes,
      selectNodes,
      showNotice,
      trackWrite,
    ],
  );

  const onExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { export: payload } = await api.exportGraph(graphId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(payload.graph.title, payload.exportedAt);
      a.click();
      // Revoking synchronously can cancel the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showNotice("ダウンロードしました。アカウントにもコピーを保存しています。");
    } catch (err) {
      setError(userMessage(err, "ダウンロードできませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }, [graphId, showNotice]);

  const openRestore = useCallback(async () => {
    setDialog({ name: "restore" });
    setExports(null);
    try {
      const { exports: entries } = await api.listExports(graphId);
      setExports(entries);
    } catch (err) {
      setExports([]);
      setError(userMessage(err, "バックアップの一覧を取得できませんでした。"));
    }
  }, [graphId]);

  const restoreFromBackup = useCallback(
    async (name: string) => {
      setDialog(null);
      const ok = await confirmAction({
        title: "バックアップから復元",
        message:
          "このノートの内容を選んだバックアップで置き換えます。現在のノードとつながりは削除済みとして扱われ、30日以内なら元に戻せません。",
        confirmLabel: "復元する",
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      setError(null);
      try {
        const payload = await api.getExport(graphId, name);
        const result = await trackWrite(api.replaceGraph(graphId, payload));
        await loadGraph();
        showNotice(
          result.skippedEdges > 0
            ? `復元しました。${result.skippedEdges}件のつながりは対象ノードがなく省かれました。`
            : "バックアップから復元しました。",
        );
      } catch (err) {
        setError(userMessage(err, "復元できませんでした。もう一度お試しください。"));
      } finally {
        setBusy(false);
      }
    },
    [confirmAction, graphId, loadGraph, showNotice, trackWrite],
  );

  const onFmt = useCallback(async () => {
    if (nodeRecordsRef.current.length === 0 || busyRef.current) return;
    const before = nodeRecordsRef.current;
    setBusy(true);
    setError(null);
    try {
      const detail = await trackWrite(api.formatGraph(graphId));
      const byId = new Map(detail.nodes.map((node) => [node.id, node]));
      setNodeRecords(detail.nodes);
      pushHistory("自動整列", before, detail.nodes);
      setNodes((prev) =>
        prev.map((node) => {
          const record = byId.get(node.id);
          return record ? { ...node, position: { x: record.x, y: record.y } } : node;
        }),
      );
      revealNodes();
      await waitFrames(2);
      updateInternalsRef.current?.(detail.nodes.map((node) => node.id));
      void flowRef.current?.fitView({ padding: 0.25, duration: 300 });
    } catch (err) {
      setError(userMessage(err, "ノードを整理できませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }, [graphId, pushHistory, revealNodes, trackWrite]);

  // Nudges land per keystroke locally but reach the server once per pause:
  // a held arrow key must not turn into hundreds of PATCHes racing the
  // write rate limit. Originals are kept so a failed flush can roll back.
  const pendingNudgeRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const nudgeTimerRef = useRef<number | null>(null);

  const flushNudge = useCallback(async () => {
    if (nudgeTimerRef.current) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    const originals = pendingNudgeRef.current;
    pendingNudgeRef.current = null;
    if (!originals || originals.size === 0) return;
    const targets = nodeRecordsRef.current.filter((node) => originals.has(node.id));
    const beforeTargets = targets.map((node) => ({
      ...node,
      ...originals.get(node.id),
    }));
    const settled = await Promise.allSettled(
      targets.map((node) => trackWrite(api.updateNode(graphId, node.id, { x: node.x, y: node.y }))),
    );
    const saved = new Map<string, NodeRecord>();
    const revert = new Map<string, { x: number; y: number }>();
    let failure: unknown = null;
    settled.forEach((outcome, index) => {
      const target = targets[index] as NodeRecord;
      if (outcome.status === "fulfilled") {
        saved.set(outcome.value.node.id, outcome.value.node);
      } else {
        failure = outcome.reason;
        const original = originals.get(target.id);
        if (original) revert.set(target.id, original);
      }
    });
    setNodeRecords((prev) =>
      prev.map((node) => {
        const record = saved.get(node.id);
        if (record) return record;
        const original = revert.get(node.id);
        return original ? { ...node, ...original } : node;
      }),
    );
    if (revert.size > 0) {
      setNodes((prev) =>
        prev.map((node) => {
          const original = revert.get(node.id);
          return original ? { ...node, position: { ...original } } : node;
        }),
      );
    }
    if (failure) {
      setError(
        userMessage(failure, "ノードの位置を保存できませんでした。もう一度お試しください。"),
      );
    }
    const savedNodes = [...saved.values()];
    if (savedNodes.length > 0) {
      const savedIds = new Set(savedNodes.map((node) => node.id));
      pushHistory(
        "ノードを移動",
        beforeTargets.filter((node) => savedIds.has(node.id)),
        savedNodes,
      );
    }
  }, [graphId, pushHistory, trackWrite]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      const ids = selectedNodeIdsRef.current;
      if (ids.length === 0) return;
      const selectedIds = new Set(ids);
      pendingNudgeRef.current ??= new Map();
      const originals = pendingNudgeRef.current;
      const updates = new Map<string, NodeRecord>();
      for (const node of nodeRecordsRef.current) {
        if (!selectedIds.has(node.id)) continue;
        if (!originals.has(node.id)) originals.set(node.id, { x: node.x, y: node.y });
        updates.set(node.id, { ...node, x: node.x + dx, y: node.y + dy });
      }
      setNodeRecords((prev) => prev.map((node) => updates.get(node.id) ?? node));
      setNodes((prev) =>
        prev.map((node) => {
          const next = updates.get(node.id);
          return next ? { ...node, position: { x: next.x, y: next.y } } : node;
        }),
      );
      if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = window.setTimeout(() => {
        void flushNudge();
      }, 300);
    },
    [flushNudge],
  );

  useEffect(
    () => () => {
      void flushNudge();
    },
    [flushNudge],
  );

  const undo = useCallback(async () => {
    await flushNudge();
    await moveHistory("undo");
  }, [flushNudge, moveHistory]);
  const redo = useCallback(async () => {
    await flushNudge();
    await moveHistory("redo");
  }, [flushNudge, moveHistory]);

  const closeDialog = useCallback(() => {
    const current = dialogRef.current;
    if (current?.name === "confirm") {
      current.resolve(false);
      return;
    }
    setDialog(null);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }, []);

  const focusNodeInView = useCallback(
    (nodeId: string) => {
      const node = nodeRecordsRef.current.find((record) => record.id === nodeId);
      if (!node) return;
      // A hit inside a collapsed branch has to be visible to be centered.
      setCollapsedIds((prev) => {
        if (prev.size === 0) return prev;
        const ancestors = computeCascade(edgeRecordsRef.current, [nodeId], "both").nodeIds;
        const next = new Set([...prev].filter((id) => !ancestors.includes(id) || id === nodeId));
        return next.size === prev.size ? prev : next;
      });
      selectNodes([nodeId]);
      setDialog(null);
      const width = node.width ?? 280;
      const height = node.height ?? estimateNoteHeight(node.title, node.body, node.width);
      requestAnimationFrame(() => {
        void flowRef.current?.setCenter(node.x + width / 2, node.y + height / 2, {
          zoom: Math.max(flowRef.current?.getZoom() ?? 1, 1),
          duration: 300,
        });
        canvasRef.current?.focus();
      });
    },
    [selectNodes],
  );

  // Deep link `/g/<id>?node=<nodeId>`: center that card once it exists.
  const focusedOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNodeId || !graph || focusedOnceRef.current === focusNodeId) return;
    if (!nodeRecords.some((node) => node.id === focusNodeId)) return;
    focusedOnceRef.current = focusNodeId;
    void waitFrames(2).then(() => focusNodeInView(focusNodeId));
  }, [focusNodeId, focusNodeInView, graph, nodeRecords]);

  const openEdgeLabel = useCallback((edgeId: string) => {
    setDialog({ name: "edgeLabel", edgeId });
  }, []);

  const saveEdgeLabel = useCallback(
    async (edgeId: string, label: string) => {
      setDialog(null);
      try {
        const { edge } = await trackWrite(api.updateEdge(graphId, edgeId, { label }));
        setEdgeRecords((prev) => prev.map((item) => (item.id === edge.id ? edge : item)));
      } catch (err) {
        setError(userMessage(err, "つながりのラベルを保存できませんでした。"));
      }
      requestAnimationFrame(() => canvasRef.current?.focus());
    },
    [graphId, trackWrite],
  );

  const onCanvasKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const editable = isEditableTarget(event.target);
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (dialogRef.current) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
      return;
    }

    // In-field Tab is handled by Note (creates linked child).
    if (editable) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur();
        canvasRef.current?.focus();
      }
      return;
    }

    if (mod && key === "k") {
      event.preventDefault();
      setDialog({ name: "search" });
      return;
    }

    if (event.key === "?" && !mod) {
      event.preventDefault();
      setDialog({ name: "help" });
      return;
    }

    if (mod && key === "z") {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
      return;
    }

    if (mod && key === "d") {
      event.preventDefault();
      void duplicateSelection();
      return;
    }

    // A focused button/menu owns its activation keys (Tab/Enter/Space) and a
    // separator owns the arrows — hijacking those would trap the keyboard
    // (WCAG 2.1.2). Other shortcuts (N, A, Delete…) stay global on purpose.
    const target = event.target;
    if (isInteractiveTarget(target)) {
      if (event.key === "Tab" || event.key === "Enter" || event.key === " ") return;
      if (
        event.key.startsWith("Arrow") &&
        target instanceof Element &&
        target.closest("[role='separator'], [role='menu'], [role='menuitem'], select")
      ) {
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (linkSourceIdRef.current) {
        setLinkSourceId(null);
        setError(null);
        return;
      }

      selectNodes([]);
      return;
    }

    // F: focus first node or keep cycling focus without mouse. Space is left
    // to the browser so it can never fight React Flow's pan gesture.
    if (key === "f" && !mod) {
      event.preventDefault();
      const current = currentParentId();
      if (current) {
        focusParent(current);
        return;
      }
      const first = nodeRecordsRef.current[0]?.id;
      if (first) focusParent(first);
      else setError("ノードがまだありません。Nを押すと追加できます。");
      return;
    }

    if (key === "n" && !mod) {
      event.preventDefault();
      void onAddNode({ focus: true });
      return;
    }

    if (key === "h" && !mod) {
      event.preventDefault();
      toggleCollapse();
      return;
    }

    // Shift+Tab keeps its browser meaning so focus can always move backwards.
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      void addChildFromActiveParent();
      return;
    }
    if (event.key === "Tab") return;

    if (key === "c" && !mod) {
      event.preventDefault();
      // POST counts against the write rate limit; holding the key must not
      // stack requests (same reason nudges are debounced).
      if (event.repeat || cascadeSelectingRef.current) return;
      const seed = selectedNodeIdsRef.current.length
        ? selectedNodeIdsRef.current
        : currentParentId()
          ? [currentParentId() as string]
          : [];
      if (seed.length === 0) {
        setError("先にノードを選んでください。");
        return;
      }
      cascadeSelectingRef.current = true;
      void api
        .cascadeSelect(graphId, seed)
        .then((result) => {
          selectNodes(result.nodeIds);
        })
        .catch((err) => {
          setError(userMessage(err, "下位ノードを選択できませんでした。もう一度お試しください。"));
        })
        .finally(() => {
          cascadeSelectingRef.current = false;
        });
      return;
    }

    if (event.key === "Enter" && !mod) {
      // A selected connection edits its label; a card edits its title.
      const edgeId = selectedEdgeIdsRef.current[0];
      if (edgeId && selectedNodeIdsRef.current.length === 0) {
        event.preventDefault();
        openEdgeLabel(edgeId);
        return;
      }
      const id = currentParentId();
      if (!id) {
        const first = nodeRecordsRef.current[0]?.id;
        if (first) {
          event.preventDefault();
          focusParent(first);
        }
        return;
      }
      event.preventDefault();
      focusParent(id);
      requestEdit(id, "title");
      return;
    }

    if ((event.key === "Backspace" || event.key === "Delete") && event.shiftKey) {
      event.preventDefault();
      void onDeleteSelection(true);
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      void onDeleteSelection(false);
      return;
    }

    if (key === "l" && !mod) {
      event.preventDefault();
      const ids = selectedNodeIdsRef.current;
      if (ids.length >= 2) {
        void onConnect({
          source: ids[0],
          target: ids[ids.length - 1],
          sourceHandle: null,
          targetHandle: null,
        });
        setLinkSourceId(null);
        setError(null);
        return;
      }
      if (ids.length === 1) {
        const current = ids[0];
        const prev = linkSourceIdRef.current;
        if (!prev) {
          setLinkSourceId(current);
          setError("つなぎ先のノードを選び、もう一度Lを押してください。");
          return;
        }
        if (prev !== current) {
          void onConnect({
            source: prev,
            target: current,
            sourceHandle: null,
            targetHandle: null,
          });
          setError(null);
        }
        setLinkSourceId(null);
      }
      return;
    }

    if (key === "e" && mod) {
      event.preventDefault();
      void onExport();
      return;
    }

    if (key === "a" && !mod) {
      event.preventDefault();
      void onFmt();
      return;
    }

    if (event.key === "[" && mod) {
      event.preventDefault();
      onBack();
      return;
    }

    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight"
    ) {
      event.preventDefault();
      // React Flow also handles arrows on a focused node (as a position
      // nudge). Keep one predictable owner for the graph's arrow shortcuts.
      event.stopPropagation();
      const current = currentParentId();
      // Once the keyboard takes over, a stationary pointer must not keep the
      // previous card highlighted as a second active parent.
      setHoveredNodeId(null);

      if (event.shiftKey && current) {
        const step = event.altKey ? 10 : 40;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (!selectedNodeIdsRef.current.includes(current)) {
          selectNodes([current]);
        }
        nudgeSelected(dx, dy);
        return;
      }

      const hidden = visibility.hidden;
      const points = nodeRecordsRef.current
        .filter((node) => !hidden.has(node.id))
        .map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
        }));
      if (!current) {
        if (points[0]) focusParent(points[0].id);
        return;
      }
      const direction =
        event.key === "ArrowUp"
          ? "up"
          : event.key === "ArrowDown"
            ? "down"
            : event.key === "ArrowLeft"
              ? "left"
              : "right";
      const next = nearestNodeId(points, current, direction);
      focusParent(next ?? current);
    }
  });

  useEffect(() => {
    // Capture before React Flow consumes arrow events on focused nodes.
    window.addEventListener("keydown", onCanvasKeyDown, true);
    return () => window.removeEventListener("keydown", onCanvasKeyDown, true);
  }, []);

  // Positions as they were when the drag began, for rollback on a failed save.
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  function onNodeDragStart(_: unknown, _node: AppNode, draggedNodes: AppNode[]) {
    dragStartPositionsRef.current = new Map(
      draggedNodes.map((item) => [item.id, { ...item.position }]),
    );
  }

  // React Flow passes every dragged node as the third argument; saving only
  // the grabbed one silently loses the rest of a multi-selection drag.
  async function onNodeDragStop(_: unknown, node: AppNode, draggedNodes?: AppNode[]) {
    const dragged = draggedNodes?.length ? draggedNodes : [node];
    // Capture now: another drag can replace the ref while the PATCHes run.
    const startPositions = new Map(
      dragged.map((item) => [
        item.id,
        dragStartPositionsRef.current.get(item.id) ?? { ...item.position },
      ]),
    );
    const settled = await Promise.allSettled(
      dragged.map((item) =>
        trackWrite(api.updateNode(graphId, item.id, { x: item.position.x, y: item.position.y })),
      ),
    );
    const saved = new Map<string, NodeRecord>();
    const failedIds: string[] = [];
    let failure: unknown = null;
    settled.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        saved.set(outcome.value.node.id, outcome.value.node);
      } else {
        failedIds.push((dragged[index] as AppNode).id);
        failure = outcome.reason;
      }
    });
    // Only failed nodes roll back; the rest ARE saved server-side and
    // reverting them would desync the canvas from the database.
    const revert = new Map(
      failedIds.map((id) => [id, startPositions.get(id)] as const).filter(([, v]) => v),
    );
    setNodeRecords((prev) =>
      prev.map((item) => {
        const record = saved.get(item.id);
        if (record) return record;
        const start = revert.get(item.id);
        return start ? { ...item, ...start } : item;
      }),
    );
    if (revert.size > 0) {
      setNodes((prev) =>
        prev.map((item) => {
          const start = revert.get(item.id);
          return start ? { ...item, position: { ...start } } : item;
        }),
      );
    }
    if (failure) {
      setError(
        userMessage(failure, "ノードの位置を保存できませんでした。もう一度お試しください。"),
      );
    }
    const savedNodes = [...saved.values()];
    if (savedNodes.length > 0) {
      const savedIds = new Set(savedNodes.map((item) => item.id));
      const before = dragged
        .filter((item) => savedIds.has(item.id))
        .map((item) => {
          const record = nodeRecordsRef.current.find((candidate) => candidate.id === item.id);
          const start = startPositions.get(item.id);
          return record && start ? { ...record, ...start } : record;
        })
        .filter((item): item is NodeRecord => Boolean(item));
      pushHistory("ノードを移動", before, savedNodes);
    }
  }

  const onNodeResize = useCallback(
    (nodeId: string, size: { x: number; y: number; width: number; height: number }) => {
      // NodeResizer reports a size below the minimum when a side handle drags a
      // card that renders shorter than NOTE_MIN_HEIGHT, and the API rejects it.
      const patch = {
        x: Math.round(size.x),
        y: Math.round(size.y),
        width: clampNoteWidth(Math.round(size.width)),
        height: clampNoteHeight(Math.round(size.height)),
      };
      // A hand-resized card must not bury its neighbours; slide them clear instead.
      const before = nodeRecordsRef.current.find((node) => node.id === nodeId);
      const moved = reflowAroundNode(
        nodeRecordsRef.current.map((node) => {
          const record = node.id === nodeId ? { ...node, ...patch } : node;
          return {
            id: record.id,
            x: record.x,
            width: record.width,
            y: record.y,
            height: record.height ?? estimateNoteHeight(record.title, record.body, record.width),
          };
        }),
        edgeRecordsRef.current,
        nodeId,
        undefined,
        before && {
          y: before.y,
          height: before.height ?? estimateNoteHeight(before.title, before.body, before.width),
        },
      );
      setNodeRecords((previous) =>
        previous.map((node) => {
          if (node.id === nodeId) return { ...node, ...patch };
          const y = moved.get(node.id);
          return y === undefined ? node : { ...node, y };
        }),
      );
      setNodes((previous) =>
        previous.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              position: { x: patch.x, y: patch.y },
              width: patch.width,
              height: patch.height,
              style: { ...node.style, width: patch.width, height: patch.height },
            };
          }
          const y = moved.get(node.id);
          return y === undefined ? node : { ...node, position: { x: node.position.x, y } };
        }),
      );
      const originals = new Map(
        nodeRecordsRef.current
          .filter((node) => node.id === nodeId || moved.has(node.id))
          .map((node) => [node.id, node]),
      );
      const patchTargets: Array<{ id: string; request: Promise<{ node: NodeRecord }> }> = [
        { id: nodeId, request: trackWrite(api.updateNode(graphId, nodeId, patch)) },
        ...[...moved].map(([id, y]) => ({
          id,
          request: trackWrite(api.updateNode(graphId, id, { y })),
        })),
      ];
      void Promise.allSettled(patchTargets.map((target) => target.request)).then((settled) => {
        const saved = new Map<string, NodeRecord>();
        const revert = new Map<string, NodeRecord>();
        let failure: unknown = null;
        settled.forEach((outcome, index) => {
          const id = (patchTargets[index] as { id: string }).id;
          if (outcome.status === "fulfilled") {
            saved.set(outcome.value.node.id, outcome.value.node);
          } else {
            failure = outcome.reason;
            const original = originals.get(id);
            if (original) revert.set(id, original);
          }
        });
        // Failed writes roll back; successful ones must stay — they are
        // already persisted server-side.
        setNodeRecords((previous) =>
          previous.map((node) => saved.get(node.id) ?? revert.get(node.id) ?? node),
        );
        if (revert.size > 0) {
          setNodes((previous) =>
            previous.map((node) => {
              const original = revert.get(node.id);
              if (!original) return node;
              const restored = {
                ...node,
                position: { x: original.x, y: original.y },
              };
              if (node.id === nodeId) {
                restored.width = original.width ?? undefined;
                restored.height = original.height ?? undefined;
                restored.style = {
                  ...node.style,
                  width: original.width ?? undefined,
                  height: original.height ?? undefined,
                };
              }
              return restored;
            }),
          );
        }
        if (saved.size > 0) updateInternalsRef.current?.([...saved.keys()]);
        if (failure) {
          setError(
            userMessage(failure, "ノードの大きさを保存できませんでした。もう一度お試しください。"),
          );
        }
        const savedNodes = [...saved.values()];
        if (savedNodes.length > 0) {
          const savedIds = new Set(savedNodes.map((node) => node.id));
          pushHistory(
            "ノードの大きさを変更",
            [...originals.values()].filter((node) => savedIds.has(node.id)),
            savedNodes,
          );
        }
      });
    },
    [graphId, pushHistory, trackWrite],
  );

  async function onRenameGraph() {
    const title = titleDraft.trim();
    if (!title || title === graph?.title) {
      // An empty draft is not a rename; put the saved name back instead of
      // showing a title the server never accepted.
      setTitleDraft(graph?.title ?? "");
      return;
    }
    try {
      const { graph: next } = await trackWrite(api.renameGraph(graphId, title));
      setGraph(next);
      setTitleDraft(next.title);
    } catch (err) {
      setTitleDraft(graph?.title ?? titleDraft);
      setError(userMessage(err, "ノート名を変更できませんでした。もう一度お試しください。"));
    }
  }

  const onToggleTask = useCallback(
    (nodeId: string, index: number) => {
      const node = nodeRecordsRef.current.find((item) => item.id === nodeId);
      if (!node) return;
      const body = toggleTask(node.body, index);
      if (body !== node.body) persistNode(nodeId, { body });
    },
    [persistNode],
  );

  const onRequestChild = useCallback(
    (nodeId: string) => {
      void onAddNode({ parentId: nodeId, focus: true, requireParent: true });
    },
    [onAddNode],
  );

  const onToggleCollapse = useCallback(
    (nodeId: string) => toggleCollapse(nodeId),
    [toggleCollapse],
  );

  // Stable identity: a new object per render would re-render every card.
  const noteActions = useMemo(
    () => ({
      onChange: persistNode,
      onResize: onNodeResize,
      onRequestChild,
      onToggleTask,
      onToggleCollapse,
    }),
    [onNodeResize, onRequestChild, onToggleCollapse, onToggleTask, persistNode],
  );

  const onNodeMouseEnter = useCallback((nodeId: string) => {
    startTransition(() => {
      setHoveredNodeId(nodeId);
    });
  }, []);

  const onNodeMouseLeave = useCallback((nodeId: string) => {
    startTransition(() => {
      setHoveredNodeId((previous) => (previous === nodeId ? null : previous));
    });
  }, []);

  const onFlowInit = useCallback((instance: ReactFlowInstance<AppNode, Edge>) => {
    flowRef.current = instance;
    requestAnimationFrame(() => {
      void instance.fitView({ padding: 0.25 });
    });
  }, []);

  const dismissError = useCallback(() => setError(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const saveState: SaveState =
    failedSaves.size > 0 ? "error" : pendingWrites > 0 ? "saving" : savedFlash ? "saved" : "idle";

  return {
    state: {
      graph,
      titleDraft,
      busy,
      error,
      notice,
      dialog,
      loadError,
      exports,
      saveState,
      failedSaves: [...failedSaves.values()],
      activeParentId,
      nodes,
      edges,
      nodeRecords,
      edgeRecords,
      nodeCount: nodeRecords.length,
      edgeCount: edgeRecords.length,
      hiddenCount: visibility.hidden.size,
      selectedNodeCount: selectedNodeIds.length,
      selectedEdgeCount: selectedEdgeIds.length,
      selectedEdgeId: selectedEdgeIds[0] ?? null,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    },
    refs: { canvasRef, flowRef, updateInternalsRef },
    actions: {
      setTitleDraft,
      onRenameGraph,
      onAddNode,
      addChildFromActiveParent,
      onDeleteSelection,
      onExport,
      openRestore,
      restoreFromBackup,
      onFmt,
      undo,
      redo,
      duplicateSelection,
      toggleCollapse,
      openHelp: () => setDialog({ name: "help" }),
      openSearch: () => setDialog({ name: "search" }),
      openEdgeLabel,
      saveEdgeLabel,
      closeDialog,
      focusNodeInView,
      onNodesChange,
      onEdgesChange,
      onConnect,
      isValidConnection,
      onNodeDragStart,
      onNodeDragStop,
      dismissError,
      dismissNotice,
      retryFailedSave,
      discardFailedSave,
      persistNode,
      onNodeMouseEnter,
      onNodeMouseLeave,
      focusParent,
      onSelectionChange,
      onFlowInit,
      reload: () => loadGraph(),
    },
    noteActions,
  };
}

export type GraphEditorController = ReturnType<typeof useGraphEditor>;
