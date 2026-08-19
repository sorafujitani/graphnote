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
import type { EdgeRecord, Graph, NodeRecord } from "../../shared/types";
import { estimateNoteHeight } from "../../shared/estimateNoteHeight";
import { placeChildPosition } from "../../shared/placeChild";
import { reflowAroundNode } from "../../shared/reflowTree";
import { isEditableTarget, isInteractiveTarget, nearestNodeId } from "../lib/keyboard";
import { userMessage } from "../lib/userMessage";
import { ApiError, api } from "../server/api";
import {
  EMPTY_HISTORY,
  historyStep,
  makeHistoryEntry,
  recordHistory,
  versionPatch,
  type EditorHistory,
} from "./editorHistory";
import { presentEdges, presentNodes } from "./graphEditorFlow";
import type { AppNode, EditRequest } from "./graphEditorTypes";

export type UseGraphEditorOptions = {
  graphId: string;
  onBack: () => void;
};

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

export function useGraphEditor({ graphId, onBack }: UseGraphEditorOptions) {
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
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [dialog, setDialog] = useState<"help" | "search" | null>(null);
  const [history, setHistory] = useState<EditorHistory>(EMPTY_HISTORY);

  const noticeTimerRef = useRef<number | null>(null);
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
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
  ]);

  const pushHistory = useCallback((label: string, before: NodeRecord[], after: NodeRecord[]) => {
    const entry = makeHistoryEntry(label, before, after);
    if (!entry) return;
    setHistory((previous) => {
      const next = recordHistory(previous, entry);
      historyRef.current = next;
      return next;
    });
  }, []);

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

  const persistNode = useCallback(
    (nodeId: string, patch: { title?: string; body?: string }) => {
      const before = nodeRecordsRef.current.find((item) => item.id === nodeId);
      setNodeRecords((prev) =>
        prev.map((item) =>
          item.id === nodeId
            ? {
                ...item,
                title: patch.title ?? item.title,
                body: patch.body ?? item.body,
              }
            : item,
        ),
      );
      void api
        .updateNode(graphId, nodeId, patch)
        .then(({ node }) => {
          setNodeRecords((prev) => prev.map((item) => (item.id === node.id ? node : item)));
          if (before) pushHistory("テキスト編集", [before], [node]);
        })
        .catch((err) => {
          // Roll the optimistic edit back: leaving unsaved text on screen makes
          // a permanent failure (e.g. body over the size limit) look saved.
          if (before) {
            setNodeRecords((prev) =>
              prev.map((item) =>
                item.id === nodeId ? { ...item, title: before.title, body: before.body } : item,
              ),
            );
          }
          setError(userMessage(err, "ノードを保存できませんでした。もう一度お試しください。"));
        });
    },
    [graphId, pushHistory],
  );

  useEffect(() => {
    let ignore = false;
    setError(null);
    void (async () => {
      try {
        const detail = await api.getGraph(graphId);
        if (ignore) return;
        setGraph(detail.graph);
        setTitleDraft(detail.graph.title);
        setNodeRecords(detail.nodes);
        setEdgeRecords(detail.edges);
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
        setHoveredNodeId(null);
        setHistory(EMPTY_HISTORY);
        historyRef.current = EMPTY_HISTORY;
        setNodes(presentNodes(detail.nodes, [], null, null, []));
        requestAnimationFrame(() => {
          void flowRef.current?.fitView({ padding: 0.25 });
        });
      } catch (err) {
        if (ignore) return;
        setError(userMessage(err, "ノートを読み込めませんでした。もう一度お試しください。"));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [graphId]);

  // A note that is deleted or replaced never fires mouseleave, so a stale hover
  // would keep offering Tab a parent that is no longer under the pointer.
  useEffect(() => {
    setHoveredNodeId((previous) =>
      previous && !nodeRecords.some((node) => node.id === previous) ? null : previous,
    );
  }, [nodeRecords]);

  useEffect(() => {
    setNodes((prev) =>
      presentNodes(nodeRecords, selectedNodeIds, activeParentId, editRequest, prev),
    );
  }, [nodeRecords, selectedNodeIds, activeParentId, editRequest]);

  const edges = useMemo(
    () => presentEdges(edgeRecords, new Set(selectedEdgeIds)),
    [edgeRecords, selectedEdgeIds],
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
        const { edge } = await api.createEdge(graphId, {
          source_id: connection.source,
          target_id: connection.target,
        });
        setEdgeRecords((prev) =>
          prev.some((item) => item.id === edge.id) ? prev : [...prev, edge],
        );
      } catch (err) {
        setError(userMessage(err, "ノードをつなげませんでした。もう一度お試しください。"));
      }
    },
    [graphId],
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
        const siblingNodes = parent
          ? nodeRecordsRef.current.filter((node) =>
              edgeRecordsRef.current.some(
                (edge) => edge.source_id === parent.id && edge.target_id === node.id,
              ),
            )
          : [];
        const pos =
          opts?.at ??
          (parent
            ? placeChildPosition(parent, siblingNodes)
            : { x: 120 + offset, y: 120 + offset });
        const { node } = await api.createNode(graphId, {
          title: "新しいノード",
          x: pos.x,
          y: pos.y,
        });

        setNodeRecords((prev) =>
          prev.some((item) => item.id === node.id) ? prev : [...prev, node],
        );

        // Wait until the new node/handles are mounted before attaching the edge,
        // otherwise React Flow can keep a zero-length / invisible path.
        await waitFrames(2);
        updateInternalsRef.current?.(
          [node.id, parent?.id].filter((id): id is string => Boolean(id)),
        );

        if (parent) {
          try {
            const { edge } = await api.createEdge(graphId, {
              source_id: parent.id,
              target_id: node.id,
            });
            setEdgeRecords((prev) =>
              prev.some((item) => item.id === edge.id) ? prev : [...prev, edge],
            );
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
              }
              setError(userMessage(err, "子ノードをつなげませんでした。もう一度お試しください。"));
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
    [graphId, requestEdit, revealNodes, selectNodes],
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

  const onDeleteSelection = useCallback(
    async (cascade: boolean) => {
      if (busyRef.current) return;
      const selected = selectedNodeIdsRef.current;
      const edgeIds = selectedEdgeIdsRef.current;
      // A selected connection wins over a selected card. This makes Delete and
      // the toolbar safe even if React Flow briefly keeps both selected.
      const ids = !cascade && edgeIds.length > 0 ? [] : selected;
      if (ids.length === 0 && edgeIds.length === 0) return;
      // There is no undo; removing a whole branch needs explicit consent.
      // Only when nodes are actually part of the deletion — an edge-only
      // selection must not show a branch warning.
      if (
        cascade &&
        ids.length > 0 &&
        !window.confirm("選択したノードを下位ノードごと削除しますか？この操作は元に戻せません。")
      ) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const removedEdgeIds = new Set<string>();
        if (ids.length > 0) {
          const result = await api.deleteNodes(graphId, ids, cascade);
          const deletedNodes = new Set(result.deletedNodeIds);
          for (const edgeId of result.deletedEdgeIds) removedEdgeIds.add(edgeId);
          setNodeRecords((prev) => prev.filter((node) => !deletedNodes.has(node.id)));
        }
        const remainingEdgeIds = edgeIds.filter((edgeId) => !removedEdgeIds.has(edgeId));
        // Apply every edge that did get deleted even when another one fails,
        // or the canvas keeps lines the server no longer has.
        const settled = await Promise.allSettled(
          remainingEdgeIds.map(async (edgeId) => {
            try {
              await api.deleteEdge(graphId, edgeId);
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
        if (edgeFailure) {
          setError(
            userMessage(
              edgeFailure,
              "一部のつながりを削除できませんでした。もう一度お試しください。",
            ),
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
    [graphId, revealNodes, selectNodes],
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
      a.download = `${payload.graph.title || "graphnote"}.json`;
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

  const onFmt = useCallback(async () => {
    if (nodeRecordsRef.current.length === 0 || busyRef.current) return;
    const before = nodeRecordsRef.current;
    setBusy(true);
    setError(null);
    try {
      const detail = await api.formatGraph(graphId);
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
  }, [graphId, pushHistory, revealNodes]);

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
      targets.map((node) => api.updateNode(graphId, node.id, { x: node.x, y: node.y })),
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
  }, [graphId, pushHistory]);

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

  const moveHistory = useCallback(
    async (direction: "undo" | "redo") => {
      if (busyRef.current) return;
      await flushNudge();
      const step = historyStep(historyRef.current, direction);
      if (!step) return;
      setBusy(true);
      setError(null);
      const settled = await Promise.allSettled(
        step.target.map((version) => api.updateNode(graphId, version.id, versionPatch(version))),
      );
      const saved = new Map<string, NodeRecord>();
      let failure: unknown = null;
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
      if (failure) {
        setError(
          userMessage(
            failure,
            `${direction === "undo" ? "元に戻す" : "やり直す"}操作を保存できませんでした。もう一度お試しください。`,
          ),
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
    [flushNudge, graphId, showNotice],
  );

  const closeDialog = useCallback(() => {
    setDialog(null);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }, []);

  const focusNodeInView = useCallback(
    (nodeId: string) => {
      const node = nodeRecordsRef.current.find((record) => record.id === nodeId);
      if (!node) return;
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
      setDialog("search");
      return;
    }

    if (event.key === "?" && !mod) {
      event.preventDefault();
      setDialog("help");
      return;
    }

    if (mod && key === "z") {
      event.preventDefault();
      void moveHistory(event.shiftKey ? "redo" : "undo");
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

    // F / Space: focus first node or keep cycling focus without mouse
    if ((key === "f" || event.key === " ") && !mod) {
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

    if ((key === "e" && mod) || (key === "e" && event.shiftKey)) {
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

      const points = nodeRecordsRef.current.map((node) => ({
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
        api.updateNode(graphId, item.id, { x: item.position.x, y: item.position.y }),
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
      const patch = {
        x: Math.round(size.x),
        y: Math.round(size.y),
        width: Math.round(size.width),
        height: Math.round(size.height),
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
        { id: nodeId, request: api.updateNode(graphId, nodeId, patch) },
        ...[...moved].map(([id, y]) => ({ id, request: api.updateNode(graphId, id, { y }) })),
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
    [graphId, pushHistory],
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
      const { graph: next } = await api.renameGraph(graphId, title);
      setGraph(next);
      setTitleDraft(next.title);
    } catch (err) {
      setTitleDraft(graph?.title ?? titleDraft);
      setError(userMessage(err, "ノート名を変更できませんでした。もう一度お試しください。"));
    }
  }

  const noteActions = {
    onChange: persistNode,
    onResize: onNodeResize,
    onRequestChild: (nodeId: string) => {
      void onAddNode({ parentId: nodeId, focus: true, requireParent: true });
    },
  };

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

  return {
    state: {
      graph,
      titleDraft,
      busy,
      error,
      notice,
      dialog,
      activeParentId,
      nodes,
      edges,
      nodeRecords,
      nodeCount: nodeRecords.length,
      edgeCount: edgeRecords.length,
      selectedNodeCount: selectedNodeIds.length,
      selectedEdgeCount: selectedEdgeIds.length,
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
      onFmt,
      undo: () => moveHistory("undo"),
      redo: () => moveHistory("redo"),
      openHelp: () => setDialog("help"),
      openSearch: () => setDialog("search"),
      closeDialog,
      focusNodeInView,
      onNodesChange,
      onEdgesChange,
      onConnect,
      isValidConnection,
      onNodeDragStart,
      onNodeDragStop,
      dismissError,
      onNodeMouseEnter,
      onNodeMouseLeave,
      focusParent,
      onSelectionChange,
      onFlowInit,
    },
    noteActions,
  };
}

export type GraphEditorController = ReturnType<typeof useGraphEditor>;
