import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
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
import type { MutableRefObject } from "react";
import type { EdgeRecord, Graph, NodeRecord } from "../../shared/types";
import { ApiError, api } from "../api";
import { Note, type AppNode } from "../components/Note";
import { NoteActionsProvider, type NoteActions } from "../components/NoteActions";
import { focusNodeField, isEditableTarget, nearestNodeId } from "../lib/keyboard";

type Props = {
  graphId: string;
  onBack: () => void;
  onLogout: () => void;
};

const nodeTypes = { note: Note };

const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 12,
  height: 12,
  color: "#64748b",
};

function toFlowEdges(
  edges: EdgeRecord[],
  cascadeIds: Set<string>,
  selectedEdgeIds: Set<string>,
): Edge[] {
  return edges.map((edge) => {
    const hot = cascadeIds.has(edge.id) || selectedEdgeIds.has(edge.id);
    return {
      id: edge.id,
      source: edge.source_id,
      target: edge.target_id,
      label: edge.label || undefined,
      selected: selectedEdgeIds.has(edge.id),
      animated: false,
      type: "smoothstep",
      style: {
        stroke: hot ? "#60a5fa" : "#64748b",
        strokeWidth: hot ? 1.5 : 1,
      },
      markerEnd: {
        ...EDGE_MARKER,
        color: hot ? "#60a5fa" : "#64748b",
      },
    };
  });
}

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

function toFlowNodes(
  nextNodeRecords: NodeRecord[],
  selectedIds: string[],
  cascadeIds: string[],
  parentId: string | null,
  prevNodes: AppNode[],
): AppNode[] {
  const selectedSet = new Set(selectedIds);
  const cascadeSet = new Set(cascadeIds);
  const prevPos = new Map(prevNodes.map((node) => [node.id, node.position] as const));
  return nextNodeRecords.map((node) => ({
    id: node.id,
    type: "note" as const,
    position: prevPos.get(node.id) ?? { x: node.x, y: node.y },
    selected: selectedSet.has(node.id),
    data: {
      title: node.title,
      body: node.body,
      inCascade: cascadeSet.has(node.id),
      activeParent: parentId === node.id,
    },
  }));
}

function NodeInternalsBridge({
  apiRef,
}: {
  apiRef: MutableRefObject<((ids: string[]) => void) | null>;
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    apiRef.current = (ids) => {
      for (const id of ids) updateNodeInternals(id);
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, updateNodeInternals]);
  return null;
}

export function GraphEditor({ graphId, onBack, onLogout }: Props) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [nodeRecords, setNodeRecords] = useState<NodeRecord[]>([]);
  const [edgeRecords, setEdgeRecords] = useState<EdgeRecord[]>([]);
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [cascadeNodeIds, setCascadeNodeIds] = useState<string[]>([]);
  const [cascadeEdgeIds, setCascadeEdgeIds] = useState<string[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  /** keyboard stand-in for hover — can be set without a mouse */
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
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
  const cascadeNodeIdsRef = useRef(cascadeNodeIds);
  const busyRef = useRef(busy);
  const linkSourceIdRef = useRef(linkSourceId);
  selectedNodeIdsRef.current = selectedNodeIds;
  selectedEdgeIdsRef.current = selectedEdgeIds;
  hoveredNodeIdRef.current = hoveredNodeId;
  focusNodeIdRef.current = focusNodeId;
  nodeRecordsRef.current = nodeRecords;
  edgeRecordsRef.current = edgeRecords;
  cascadeNodeIdsRef.current = cascadeNodeIds;
  busyRef.current = busy;
  linkSourceIdRef.current = linkSourceId;

  const activeParentId = hoveredNodeId ?? focusNodeId ?? selectedNodeIds[0] ?? null;

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
          setError(err instanceof ApiError ? err.message : "save failed");
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
        setCascadeNodeIds([]);
        setCascadeEdgeIds([]);
        setHoveredNodeId(null);
        setFocusNodeId(null);
        setNodes(toFlowNodes(detail.nodes, [], [], null, []));
        requestAnimationFrame(() => {
          void flowRef.current?.fitView({ padding: 0.25 });
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "failed to load graph");
      }
    })();
    return () => controller.abort();
  }, [graphId]);

  useEffect(() => {
    setNodes((prev) =>
      toFlowNodes(nodeRecords, selectedNodeIds, cascadeNodeIds, activeParentId, prev),
    );
  }, [nodeRecords, selectedNodeIds, cascadeNodeIds, activeParentId]);

  const edges = useMemo(
    () => toFlowEdges(edgeRecords, new Set(cascadeEdgeIds), new Set(selectedEdgeIds)),
    [cascadeEdgeIds, edgeRecords, selectedEdgeIds],
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
      if (change.type === "position" && change.position && !change.dragging) {
        const position = change.position;
        setNodeRecords((prev) =>
          prev.map((item) =>
            item.id === change.id ? { ...item, x: position.x, y: position.y } : item,
          ),
        );
      }
    }
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
        setError(err instanceof ApiError ? err.message : "edge create failed");
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
    async (opts?: { parentId?: string; focus?: boolean; requireParent?: boolean }) => {
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
            setError("Parent node not found — focus a node first (↑↓←→ or F)");
            return null;
          }
        }

        const offset = nodeRecordsRef.current.length * 24;
        const siblingCount = parent
          ? edgeRecordsRef.current.filter((edge) => edge.source_id === parent.id).length
          : 0;
        const { node } = await api.createNode(graphId, {
          title: "New node",
          x: parent ? parent.x + 280 : 120 + offset,
          y: parent ? parent.y + siblingCount * 150 : 120 + offset,
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
              setError("Failed to link child — try again");
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
          setError("Failed to link child — try again");
          return null;
        }

        selectNodes([node.id]);
        setFocusNodeId(node.id);
        revealNodes();
        if (opts?.focus !== false) {
          window.setTimeout(() => focusNodeField(node.id, "title"), 50);
        }
        return node;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "node create failed");
        return null;
      } finally {
        setBusy(false);
        creatingChildRef.current = false;
      }
    },
    [graphId, revealNodes, selectNodes],
  );
  const addChildFromActiveParent = useCallback(async () => {
    const parentId =
      hoveredNodeIdRef.current ?? focusNodeIdRef.current ?? selectedNodeIdsRef.current[0] ?? null;
    if (!parentId) {
      const first = nodeRecordsRef.current[0]?.id;
      if (first) {
        focusParent(first);
        setError("Focused first node — press Tab again to add a child");
      } else {
        setError("No nodes yet — press N to create one");
      }
      return;
    }
    await onAddNode({ parentId, focus: true, requireParent: true });
  }, [focusParent, onAddNode]);

  const onCascadeSelect = useCallback(async () => {
    const ids = selectedNodeIdsRef.current;
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const result = await api.cascadeSelect(graphId, ids, "outgoing");
      setCascadeNodeIds(result.nodeIds);
      setCascadeEdgeIds(result.edgeIds);
      selectNodes(result.nodeIds);
      revealNodes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "cascade select failed");
    } finally {
      setBusy(false);
    }
  }, [graphId, revealNodes, selectNodes]);

  const onDeleteSelection = useCallback(
    async (cascade: boolean) => {
      const selected = selectedNodeIdsRef.current;
      const cascadeIds = cascadeNodeIdsRef.current;
      const ids = cascade && cascadeIds.length > 0 ? cascadeIds : selected;
      const edgeIds = selectedEdgeIdsRef.current;
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
        setCascadeNodeIds([]);
        setCascadeEdgeIds([]);
        selectNodes([]);
        setLinkSourceId(null);
        revealNodes();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "delete failed");
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
      const { export: payload, r2Key } = await api.exportGraph(graphId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${payload.graph.title || "graphnote"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`Exported and saved to R2:\n${r2Key}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "export failed");
    } finally {
      setBusy(false);
    }
  }, [graphId]);

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
      if (cascadeNodeIdsRef.current.length > 0) {
        setCascadeNodeIds([]);
        setCascadeEdgeIds([]);
        return;
      }
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
      else setError("No nodes yet — press N to create one");
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
      focusNodeField(id, "title");
      return;
    }

    if (key === "c" && !mod) {
      event.preventDefault();
      void onCascadeSelect();
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
          setError("Link: select another node and press L");
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
    window.addEventListener("keydown", onCanvasKeyDown);
    return () => window.removeEventListener("keydown", onCanvasKeyDown);
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
      setError(err instanceof ApiError ? err.message : "position save failed");
    }
  }

  async function onRenameGraph() {
    const title = titleDraft.trim();
    if (!title) return;
    try {
      const { graph: next } = await api.renameGraph(graphId, title);
      setGraph(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "rename failed");
    }
  }

  const noteActions: NoteActions = {
    onChange: persistNode,
    onRequestChild: (nodeId) => {
      void onAddNode({ parentId: nodeId, focus: true, requireParent: true });
    },
  };

  return (
    <div
      className="app-shell"
      style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}
    >
      <header
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          padding: "0.85rem 1rem",
          borderBottom: "1px solid var(--line)",
          background: "rgba(11, 15, 21, 0.88)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button className="btn secondary" type="button" onClick={onBack} title="⌘[">
          Notes
        </button>
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => void onRenameGraph()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              if (e.key === "Escape") setTitleDraft(graph?.title ?? titleDraft);
              (e.target as HTMLInputElement).blur();
              canvasRef.current?.focus();
            }
          }}
          style={{
            flex: 1,
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "0.55rem 0.75rem",
            fontWeight: 600,
            background: "var(--bg-soft)",
            color: "var(--ink)",
          }}
        />
        <button
          className="btn secondary"
          type="button"
          disabled={busy}
          onClick={() => void onAddNode({ focus: true })}
          title="N"
        >
          Add node
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy || !activeParentId}
          onClick={() => void addChildFromActiveParent()}
          title="Tab"
        >
          Add child
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy || selectedNodeIds.length === 0}
          onClick={() => void onCascadeSelect()}
          title="C"
        >
          Cascade select
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy || (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0)}
          onClick={() => void onDeleteSelection(false)}
          title="⌫"
        >
          Delete
        </button>
        <button
          className="btn danger"
          type="button"
          disabled={busy || (selectedNodeIds.length === 0 && cascadeNodeIds.length === 0)}
          onClick={() => void onDeleteSelection(true)}
          title="⇧⌫"
        >
          Cascade delete
        </button>
        <button
          className="btn accent"
          type="button"
          disabled={busy}
          onClick={() => void onExport()}
          title="⌘E"
        >
          Export
        </button>
        <button className="btn ghost" type="button" onClick={onLogout}>
          Log out
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 260px",
          minHeight: 0,
          height: "100%",
        }}
      >
        <div
          ref={canvasRef}
          tabIndex={0}
          style={{ minHeight: 0, height: "100%", outline: "none" }}
          onMouseDown={() => canvasRef.current?.focus()}
        >
          <NoteActionsProvider value={noteActions}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onConnect={(connection) => void onConnect(connection)}
              onNodeDragStop={(event, node) => void onNodeDragStop(event, node)}
              onNodeMouseEnter={(_, node) => {
                startTransition(() => {
                  setHoveredNodeId(node.id);
                  setFocusNodeId(node.id);
                });
              }}
              onNodeMouseLeave={(_, node) => {
                startTransition(() => {
                  setHoveredNodeId((prev) => (prev === node.id ? null : prev));
                });
              }}
              onNodeClick={(_, node) => focusParent(node.id)}
              onSelectionChange={onSelectionChange}
              onInit={(instance) => {
                flowRef.current = instance;
                requestAnimationFrame(() => {
                  void instance.fitView({ padding: 0.25 });
                });
              }}
              defaultEdgeOptions={{
                type: "smoothstep",
                style: { stroke: "#64748b", strokeWidth: 1 },
                markerEnd: EDGE_MARKER,
              }}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              onlyRenderVisibleElements={false}
              deleteKeyCode={null}
              multiSelectionKeyCode="Shift"
              style={{ width: "100%", height: "100%" }}
            >
              <NodeInternalsBridge apiRef={updateInternalsRef} />
              <Background gap={18} color="#2a3442" />
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(8, 11, 16, 0.7)"
                nodeColor="#334155"
                nodeStrokeColor="#64748b"
              />
              <Controls />
            </ReactFlow>
          </NoteActionsProvider>
        </div>

        <aside
          style={{
            borderLeft: "1px solid var(--line)",
            padding: "1rem",
            background: "var(--bg-elevated)",
            overflow: "auto",
          }}
        >
          {error ? <p className="error-text">{error}</p> : null}
          <p className="muted" style={{ marginTop: 0 }}>
            {graph ? `${nodeRecords.length} nodes · ${edgeRecords.length} edges` : "Loading…"}
          </p>
          {activeParentId ? (
            <p className="mono" style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
              Parent ready · Tab adds child
            </p>
          ) : (
            <p className="mono" style={{ fontSize: "0.8rem" }}>
              F / ↑↓←→ to focus a parent
            </p>
          )}
          <div className="mono muted" style={{ fontSize: "0.78rem", lineHeight: 1.7 }}>
            <div>F / ↑↓←→ · focus parent</div>
            <div>Tab · linked child</div>
            <div>N · free node</div>
            <div>Enter · edit title</div>
            <div>Esc · clear focus</div>
            <div>⇧↑↓←→ · nudge</div>
            <div>L · link nodes</div>
            <div>C · cascade select</div>
            <div>⌫ / ⇧⌫ · delete</div>
            <div>⌘E · export</div>
            <div>⌘[ · notes list</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
