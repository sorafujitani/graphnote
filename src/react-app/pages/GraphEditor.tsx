import {
	Background,
	Controls,
	MiniMap,
	ReactFlow,
	applyNodeChanges,
	type Connection,
	type Edge,
	type NodeChange,
	type OnSelectionChangeParams,
	type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EdgeRecord, Graph, NodeRecord } from "../../shared/types";
import { ApiError, api } from "../api";
import { NoteNode, type NoteFlowNode } from "../components/NoteNode";
import {
	focusNodeField,
	isEditableTarget,
	nearestNodeId,
} from "../lib/keyboard";

type Props = {
	graphId: string;
	onBack: () => void;
	onLogout: () => void;
};

const nodeTypes = { note: NoteNode };

function toFlowEdges(
	edges: EdgeRecord[],
	cascadeIds: Set<string>,
	selectedEdgeIds: Set<string>,
): Edge[] {
	return edges.map((edge) => ({
		id: edge.id,
		source: edge.source_id,
		target: edge.target_id,
		label: edge.label || undefined,
		selected: selectedEdgeIds.has(edge.id),
		style: cascadeIds.has(edge.id)
			? { stroke: "var(--accent)", strokeWidth: 2 }
			: undefined,
	}));
}

export function GraphEditor({ graphId, onBack, onLogout }: Props) {
	const [graph, setGraph] = useState<Graph | null>(null);
	const [records, setRecords] = useState<NodeRecord[]>([]);
	const [edgeRecords, setEdgeRecords] = useState<EdgeRecord[]>([]);
	const [nodes, setNodes] = useState<NoteFlowNode[]>([]);
	const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
	const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
	const [cascadeNodeIds, setCascadeNodeIds] = useState<string[]>([]);
	const [cascadeEdgeIds, setCascadeEdgeIds] = useState<string[]>([]);
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const canvasRef = useRef<HTMLDivElement>(null);
	const rfRef = useRef<ReactFlowInstance<NoteFlowNode, Edge> | null>(null);

	const selectedNodeIdsRef = useRef(selectedNodeIds);
	const selectedEdgeIdsRef = useRef(selectedEdgeIds);
	const hoveredNodeIdRef = useRef(hoveredNodeId);
	const recordsRef = useRef(records);
	const cascadeNodeIdsRef = useRef(cascadeNodeIds);
	const busyRef = useRef(busy);
	const linkSourceIdRef = useRef(linkSourceId);
	selectedNodeIdsRef.current = selectedNodeIds;
	selectedEdgeIdsRef.current = selectedEdgeIds;
	hoveredNodeIdRef.current = hoveredNodeId;
	recordsRef.current = records;
	cascadeNodeIdsRef.current = cascadeNodeIds;
	busyRef.current = busy;
	linkSourceIdRef.current = linkSourceId;

	const persistNode = useCallback(
		(nodeId: string, patch: { title?: string; body?: string }) => {
			setRecords((prev) =>
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
					setRecords((prev) =>
						prev.map((item) => (item.id === node.id ? node : item)),
					);
				})
				.catch((err) => {
					setError(err instanceof ApiError ? err.message : "save failed");
				});
		},
		[graphId],
	);

	const persistNodeRef = useRef(persistNode);
	persistNodeRef.current = persistNode;

	const rebuildNodes = useCallback(
		(
			nextRecords: NodeRecord[],
			selectedIds: string[],
			cascadeIds: string[],
			hoveredId: string | null,
			prevNodes: NoteFlowNode[],
		): NoteFlowNode[] => {
			const selectedSet = new Set(selectedIds);
			const cascadeSet = new Set(cascadeIds);
			const prevPos = new Map(
				prevNodes.map((node) => [node.id, node.position] as const),
			);
			return nextRecords.map((node) => ({
				id: node.id,
				type: "note" as const,
				position: prevPos.get(node.id) ?? { x: node.x, y: node.y },
				selected: selectedSet.has(node.id),
				data: {
					title: node.title,
					body: node.body,
					selectedCascade: cascadeSet.has(node.id),
					hovered: hoveredId === node.id,
					onChange: (patch) => persistNodeRef.current(node.id, patch),
					onRequestChild: () => {
						void onAddNodeRef.current?.({ parentId: node.id, focus: true });
					},
				},
			}));
		},
		[],
	);

	const onAddNodeRef = useRef<
		| ((opts?: { parentId?: string; focus?: boolean }) => Promise<NodeRecord | null>)
		| null
	>(null);

	useEffect(() => {
		void (async () => {
			setError(null);
			try {
				const detail = await api.getGraph(graphId);
				setGraph(detail.graph);
				setTitleDraft(detail.graph.title);
				setRecords(detail.nodes);
				setEdgeRecords(detail.edges);
				setSelectedNodeIds([]);
				setSelectedEdgeIds([]);
				setCascadeNodeIds([]);
				setCascadeEdgeIds([]);
				setHoveredNodeId(null);
				setNodes(
					rebuildNodes(detail.nodes, [], [], null, []),
				);
				requestAnimationFrame(() => {
					rfRef.current?.fitView({ padding: 0.25 });
				});
			} catch (err) {
				setError(err instanceof ApiError ? err.message : "failed to load graph");
			}
		})();
	}, [graphId, rebuildNodes]);

	useEffect(() => {
		setNodes((prev) =>
			rebuildNodes(
				records,
				selectedNodeIds,
				cascadeNodeIds,
				hoveredNodeId,
				prev,
			),
		);
	}, [
		records,
		selectedNodeIds,
		cascadeNodeIds,
		hoveredNodeId,
		rebuildNodes,
	]);

	const edges = useMemo(
		() =>
			toFlowEdges(
				edgeRecords,
				new Set(cascadeEdgeIds),
				new Set(selectedEdgeIds),
			),
		[cascadeEdgeIds, edgeRecords, selectedEdgeIds],
	);

	const selectNodes = useCallback((ids: string[]) => {
		setSelectedNodeIds(ids);
		setSelectedEdgeIds([]);
	}, []);

	const onNodesChange = useCallback((changes: NodeChange<NoteFlowNode>[]) => {
		setNodes((prev) => applyNodeChanges(changes, prev));
		for (const change of changes) {
			if (change.type === "position" && change.position && !change.dragging) {
				const position = change.position;
				setRecords((prev) =>
					prev.map((item) =>
						item.id === change.id
							? { ...item, x: position.x, y: position.y }
							: item,
					),
				);
			}
		}
	}, []);

	const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
		setSelectedNodeIds(params.nodes.map((node) => node.id));
		setSelectedEdgeIds(params.edges.map((edge) => edge.id));
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
			rfRef.current?.fitView({ padding: 0.25, duration: 200 });
		});
	}, []);

	const onAddNode = useCallback(
		async (opts?: { parentId?: string; focus?: boolean }) => {
			if (busyRef.current) return null;
			setBusy(true);
			setError(null);
			try {
				const parent = opts?.parentId
					? recordsRef.current.find((node) => node.id === opts.parentId)
					: null;
				const offset = recordsRef.current.length * 24;
				const { node } = await api.createNode(graphId, {
					title: "New node",
					x: parent ? parent.x + 260 : 120 + offset,
					y: parent ? parent.y + (recordsRef.current.length % 3) * 40 : 120 + offset,
				});

				setRecords((prev) =>
					prev.some((item) => item.id === node.id) ? prev : [...prev, node],
				);

				if (parent) {
					const { edge } = await api.createEdge(graphId, {
						source_id: parent.id,
						target_id: node.id,
					});
					setEdgeRecords((prev) =>
						prev.some((item) => item.id === edge.id) ? prev : [...prev, edge],
					);
				}

				selectNodes([node.id]);
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
			}
		},
		[graphId, revealNodes, selectNodes],
	);
	onAddNodeRef.current = onAddNode;

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
					setRecords((prev) => prev.filter((node) => !deletedNodes.has(node.id)));
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
					setEdgeRecords((prev) =>
						prev.filter((edge) => !removedEdgeIds.has(edge.id)),
					);
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
			const updates = recordsRef.current
				.filter((node) => ids.includes(node.id))
				.map((node) => ({
					...node,
					x: node.x + dx,
					y: node.y + dy,
				}));
			setRecords((prev) =>
				prev.map((node) => {
					const next = updates.find((item) => item.id === node.id);
					return next ?? node;
				}),
			);
			setNodes((prev) =>
				prev.map((node) => {
					const next = updates.find((item) => item.id === node.id);
					return next
						? { ...node, position: { x: next.x, y: next.y } }
						: node;
				}),
			);
			await Promise.all(
				updates.map((node) =>
					api.updateNode(graphId, node.id, { x: node.x, y: node.y }),
				),
			);
		},
		[graphId],
	);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented) return;

			const editable = isEditableTarget(event.target);
			const mod = event.metaKey || event.ctrlKey;
			const key = event.key.toLowerCase();

			if (editable) {
				if (event.key === "Escape") {
					(document.activeElement as HTMLElement | null)?.blur();
					canvasRef.current?.focus();
					return;
				}
				// Tab inside a node creates a child of that node (mind-map style).
				if (event.key === "Tab" && !event.shiftKey && !mod) {
					const field = event.target as HTMLElement;
					const parentId = field.getAttribute("data-node-id");
					if (parentId) {
						event.preventDefault();
						field.blur();
						void onAddNode({ parentId, focus: true });
						return;
					}
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
				selectNodes([]);
				return;
			}

			if (key === "n" && !mod) {
				event.preventDefault();
				void onAddNode({ focus: true });
				return;
			}

			if (event.key === "Tab") {
				event.preventDefault();
				const parentId =
					hoveredNodeIdRef.current ?? selectedNodeIdsRef.current[0];
				if (!parentId) {
					setError("Hover a node (or select one), then press Tab");
					return;
				}
				void onAddNode({ parentId, focus: true });
				return;
			}

			if (event.key === "Enter" && !mod) {
				const id = selectedNodeIdsRef.current[0] ?? hoveredNodeIdRef.current;
				if (!id) return;
				event.preventDefault();
				selectNodes([id]);
				focusNodeField(id, "title");
				return;
			}

			if (key === "c" && !mod) {
				event.preventDefault();
				void onCascadeSelect();
				return;
			}

			if (
				(event.key === "Backspace" || event.key === "Delete") &&
				event.shiftKey
			) {
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
					selectedNodeIdsRef.current[0] ?? hoveredNodeIdRef.current;
				if (event.shiftKey) {
					const step = event.altKey ? 10 : 40;
					const dx =
						event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
					const dy =
						event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
					void nudgeSelected(dx, dy);
					return;
				}

				const points = recordsRef.current.map((node) => ({
					id: node.id,
					x: node.x,
					y: node.y,
				}));
				if (!current) {
					if (points[0]) selectNodes([points[0].id]);
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
				if (next) selectNodes([next]);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		nudgeSelected,
		onAddNode,
		onBack,
		onCascadeSelect,
		onConnect,
		onDeleteSelection,
		onExport,
		selectNodes,
	]);

	async function onNodeDragStop(_: unknown, node: NoteFlowNode) {
		try {
			const updated = await api.updateNode(graphId, node.id, {
				x: node.position.x,
				y: node.position.y,
			});
			setRecords((prev) =>
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

	return (
		<div className="app-shell" style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
			<header
				style={{
					display: "flex",
					gap: "0.75rem",
					alignItems: "center",
					padding: "0.85rem 1rem",
					borderBottom: "1px solid var(--line)",
					background: "rgba(248, 250, 251, 0.92)",
					backdropFilter: "blur(8px)",
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
						if (e.key === "Enter") {
							e.preventDefault();
							(e.target as HTMLInputElement).blur();
							canvasRef.current?.focus();
						}
						if (e.key === "Escape") {
							e.preventDefault();
							setTitleDraft(graph?.title ?? titleDraft);
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
						background: "white",
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
					disabled={
						busy ||
						(selectedNodeIds.length === 0 && cascadeNodeIds.length === 0)
					}
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
					<ReactFlow
						nodes={nodes}
						edges={edges}
						nodeTypes={nodeTypes}
						onNodesChange={onNodesChange}
						onConnect={(connection) => void onConnect(connection)}
						onNodeDragStop={(event, node) => void onNodeDragStop(event, node)}
						onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
						onNodeMouseLeave={(_, node) =>
							setHoveredNodeId((prev) => (prev === node.id ? null : prev))
						}
						onSelectionChange={onSelectionChange}
						onInit={(instance) => {
							rfRef.current = instance;
							requestAnimationFrame(() => {
								instance.fitView({ padding: 0.25 });
							});
						}}
						fitView
						fitViewOptions={{ padding: 0.25 }}
						onlyRenderVisibleElements={false}
						deleteKeyCode={null}
						multiSelectionKeyCode="Shift"
						nodesConnectable
						elementsSelectable
						style={{ width: "100%", height: "100%" }}
					>
						<Background gap={18} color="#d5dde5" />
						<MiniMap pannable zoomable />
						<Controls />
					</ReactFlow>
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
						{graph ? `${records.length} nodes · ${edgeRecords.length} edges` : "Loading…"}
					</p>
					{cascadeNodeIds.length > 0 ? (
						<p className="mono" style={{ fontSize: "0.8rem" }}>
							Cascade: {cascadeNodeIds.length} nodes / {cascadeEdgeIds.length} edges
						</p>
					) : null}
					{linkSourceId ? (
						<p className="mono" style={{ fontSize: "0.8rem" }}>
							Link source armed
						</p>
					) : null}
					{hoveredNodeId ? (
						<p className="mono" style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
							Hover parent · Tab adds child
						</p>
					) : null}
					<div className="mono muted" style={{ fontSize: "0.78rem", lineHeight: 1.7 }}>
						<div>N · new node</div>
						<div>Hover + Tab · child from parent</div>
						<div>Tab · child from selection</div>
						<div>Enter · edit title</div>
						<div>Esc · blur / clear</div>
						<div>↑↓←→ · select neighbor</div>
						<div>⇧↑↓←→ · nudge</div>
						<div>L · link nodes</div>
						<div>C · cascade select</div>
						<div>⌫ · delete</div>
						<div>⇧⌫ · cascade delete</div>
						<div>⌘E · export</div>
						<div>⌘[ · notes list</div>
						<div style={{ marginTop: 8 }}>In field: Enter title→body</div>
						<div>In field: ⌘Enter done, Esc cancel</div>
					</div>
				</aside>
			</div>
		</div>
	);
}
