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
  useMemo,
  useRef,
  useState,
} from "react";
import type { EdgeRecord, Graph, NodeRecord } from "../../shared/types";
import { placeChildPosition } from "../../shared/placeChild";
import { isEditableTarget, nearestNodeId } from "../lib/keyboard";
import { userMessage } from "../lib/userMessage";
import { ApiError, api } from "../server/api";
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

export function useGraphEditor({ graphId, onBack }: UseGraphEditorOptions) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [nodeRecords, setNodeRecords] = useState<NodeRecord[]>([]);
  const [edgeRecords, setEdgeRecords] = useState<EdgeRecord[]>([]);
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  /** keyboard stand-in for hover — can be set without a mouse */
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<AppNode, Edge> | null>(null);
  const updateInternalsRef = useRef<((ids: string[]) => void) | null>(null);
  const creatingChildRef = useRef(false);

  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const selectedEdgeIdsRef = useRef(selectedEdgeIds);
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  const focusNodeIdRef = useRef(focusNodeId);
  const nodeRecordsRef = useRef(nodeRecords);
  const edgeRecordsRef = useRef(edgeRecords);
  const busyRef = useRef(busy);
  const linkSourceIdRef = useRef(linkSourceId);
  selectedNodeIdsRef.current = selectedNodeIds;
  selectedEdgeIdsRef.current = selectedEdgeIds;
  hoveredNodeIdRef.current = hoveredNodeId;
  focusNodeIdRef.current = focusNodeId;
  nodeRecordsRef.current = nodeRecords;
  edgeRecordsRef.current = edgeRecords;
  busyRef.current = busy;
  linkSourceIdRef.current = linkSourceId;

  const activeParentId = hoveredNodeId ?? focusNodeId ?? selectedNodeIds[0] ?? null;

  /** Asks a note to open one of its editors; the note focuses it as it mounts. */
  const requestEdit = useCallback((nodeId: string, field: "title" | "body") => {
    setEditRequest((prev) => ({ nodeId, field, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const persistNode = useCallback(
    (nodeId: string, patch: { title?: string; body?: string }) => {
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
        })
        .catch((err) => {
          setError(userMessage(err, "ノードを保存できませんでした。もう一度お試しください。"));
        });
    },
    [graphId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void (async () => {
      try {
        const detail = await api.getGraph(graphId);
        if (controller.signal.aborted) return;
        setGraph(detail.graph);
        setTitleDraft(detail.graph.title);
        setNodeRecords(detail.nodes);
        setEdgeRecords(detail.edges);
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
        setHoveredNodeId(null);
        setFocusNodeId(null);
        setNodes(presentNodes(detail.nodes, [], null, null, []));
        requestAnimationFrame(() => {
          void flowRef.current?.fitView({ padding: 0.25 });
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(userMessage(err, "ノートを読み込めませんでした。もう一度お試しください。"));
      }
    })();
    return () => controller.abort();
  }, [graphId]);

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
    setSelectedNodeIds(ids);
    setSelectedEdgeIds([]);
    if (ids[0]) setFocusNodeId(ids[0]);
  }, []);

  const focusParent = useCallback((id: string | null) => {
    if (!id) {
      setFocusNodeId(null);
      return;
    }
    setFocusNodeId(id);
    setSelectedNodeIds([id]);
    setSelectedEdgeIds([]);
  }, []);

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

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const ids = params.nodes.map((node) => node.id);
    const edgeIds = params.edges.map((edge) => edge.id);
    startTransition(() => {
      setSelectedNodeIds(ids);
      setSelectedEdgeIds(edgeIds);
      if (ids[0]) setFocusNodeId(ids[0]);
    });
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
          const { edge } = await api.createEdge(graphId, {
            source_id: parent.id,
            target_id: node.id,
          });
          if (!edge) {
            if (opts?.requireParent) {
              await api.deleteNodes(graphId, [node.id], false);
              setNodeRecords((prev) => prev.filter((item) => item.id !== node.id));
              setError("子ノードをつなげませんでした。もう一度お試しください。");
              return null;
            }
          } else {
            setEdgeRecords((prev) =>
              prev.some((item) => item.id === edge.id) ? prev : [...prev, edge],
            );
            await waitFrames(1);
            updateInternalsRef.current?.([parent.id, node.id]);
          }
        } else if (opts?.requireParent) {
          await api.deleteNodes(graphId, [node.id], false);
          setNodeRecords((prev) => prev.filter((item) => item.id !== node.id));
          setError("子ノードをつなげませんでした。もう一度お試しください。");
          return null;
        }

        selectNodes([node.id]);
        setFocusNodeId(node.id);
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
    const parentId =
      hoveredNodeIdRef.current ?? focusNodeIdRef.current ?? selectedNodeIdsRef.current[0] ?? null;
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
  }, [focusParent, onAddNode]);

  const onDeleteSelection = useCallback(
    async (cascade: boolean) => {
      const selected = selectedNodeIdsRef.current;
      const edgeIds = selectedEdgeIdsRef.current;
      // A selected connection wins over a selected card. This makes Delete and
      // the toolbar safe even if React Flow briefly keeps both selected.
      const ids = !cascade && edgeIds.length > 0 ? [] : selected;
      if (ids.length === 0 && edgeIds.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        const removedEdgeIds = new Set<string>();
        if (ids.length > 0) {
          const result = await api.deleteNodes(graphId, ids, cascade);
          const deletedNodes = new Set(result.deletedNodeIds);
          for (const edgeId of result.deletedEdgeIds) removedEdgeIds.add(edgeId);
          setNodeRecords((prev) => prev.filter((node) => !deletedNodes.has(node.id)));
          if (focusNodeIdRef.current && deletedNodes.has(focusNodeIdRef.current)) {
            setFocusNodeId(null);
          }
        }
        for (const edgeId of edgeIds) {
          if (removedEdgeIds.has(edgeId)) continue;
          try {
            await api.deleteEdge(graphId, edgeId);
            removedEdgeIds.add(edgeId);
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404)) throw err;
          }
        }
        if (removedEdgeIds.size > 0) {
          setEdgeRecords((prev) => prev.filter((edge) => !removedEdgeIds.has(edge.id)));
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
      URL.revokeObjectURL(url);
      alert("ダウンロードしました。アカウントにもコピーを保存しています。");
    } catch (err) {
      setError(userMessage(err, "ダウンロードできませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }, [graphId]);

  const onFmt = useCallback(async () => {
    if (nodeRecordsRef.current.length === 0 || busyRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await api.formatGraph(graphId);
      const byId = new Map(detail.nodes.map((node) => [node.id, node]));
      setNodeRecords(detail.nodes);
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
  }, [graphId, revealNodes]);

  const nudgeSelected = useCallback(
    async (dx: number, dy: number) => {
      const ids = selectedNodeIdsRef.current;
      if (ids.length === 0) return;
      const updates = nodeRecordsRef.current
        .filter((node) => ids.includes(node.id))
        .map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }));
      setNodeRecords((prev) =>
        prev.map((node) => updates.find((item) => item.id === node.id) ?? node),
      );
      setNodes((prev) =>
        prev.map((node) => {
          const next = updates.find((item) => item.id === node.id);
          return next ? { ...node, position: { x: next.x, y: next.y } } : node;
        }),
      );
      await Promise.all(
        updates.map((node) => api.updateNode(graphId, node.id, { x: node.x, y: node.y })),
      );
    },
    [graphId],
  );

  const onCanvasKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const editable = isEditableTarget(event.target);
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    // In-field Tab is handled by Note (creates linked child).
    if (editable) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur();
        canvasRef.current?.focus();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (linkSourceIdRef.current) {
        setLinkSourceId(null);
        setError(null);
        return;
      }
      setFocusNodeId(null);
      selectNodes([]);
      return;
    }

    // F / Space: focus first node or keep cycling focus without mouse
    if ((key === "f" || event.key === " ") && !mod) {
      event.preventDefault();
      const current =
        focusNodeIdRef.current ?? hoveredNodeIdRef.current ?? selectedNodeIdsRef.current[0];
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

    if (event.key === "Tab") {
      event.preventDefault();
      void addChildFromActiveParent();
      return;
    }

    if (event.key === "Enter" && !mod) {
      const id =
        selectedNodeIdsRef.current[0] ?? focusNodeIdRef.current ?? hoveredNodeIdRef.current;
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
      const current =
        focusNodeIdRef.current ?? hoveredNodeIdRef.current ?? selectedNodeIdsRef.current[0];

      if (event.shiftKey && current) {
        const step = event.altKey ? 10 : 40;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (!selectedNodeIdsRef.current.includes(current)) {
          selectNodes([current]);
        }
        void nudgeSelected(dx, dy);
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

  async function onNodeDragStop(_: unknown, node: AppNode) {
    try {
      const updated = await api.updateNode(graphId, node.id, {
        x: node.position.x,
        y: node.position.y,
      });
      setNodeRecords((prev) =>
        prev.map((item) => (item.id === updated.node.id ? updated.node : item)),
      );
    } catch (err) {
      setError(userMessage(err, "ノードの位置を保存できませんでした。もう一度お試しください。"));
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
      setNodeRecords((previous) =>
        previous.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
      );
      setNodes((previous) =>
        previous.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                position: { x: patch.x, y: patch.y },
                width: patch.width,
                height: patch.height,
                style: { ...node.style, width: patch.width, height: patch.height },
              }
            : node,
        ),
      );
      void api
        .updateNode(graphId, nodeId, patch)
        .then(({ node }) => {
          setNodeRecords((previous) =>
            previous.map((current) => (current.id === node.id ? node : current)),
          );
          updateInternalsRef.current?.([nodeId]);
        })
        .catch((err) => {
          setError(
            userMessage(err, "ノードの大きさを保存できませんでした。もう一度お試しください。"),
          );
        });
    },
    [graphId],
  );

  async function onRenameGraph() {
    const title = titleDraft.trim();
    if (!title) return;
    try {
      const { graph: next } = await api.renameGraph(graphId, title);
      setGraph(next);
    } catch (err) {
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
      setFocusNodeId(nodeId);
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

  return {
    state: {
      graph,
      titleDraft,
      busy,
      error,
      activeParentId,
      nodes,
      edges,
      nodeCount: nodeRecords.length,
      edgeCount: edgeRecords.length,
      selectedNodeCount: selectedNodeIds.length,
      selectedEdgeCount: selectedEdgeIds.length,
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
      onNodesChange,
      onEdgesChange,
      onConnect,
      isValidConnection,
      onNodeDragStop,
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
