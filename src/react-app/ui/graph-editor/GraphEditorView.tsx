import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useEffect, type MutableRefObject } from "react";
import { AppMenu } from "../../components/AppMenu";
import { Note } from "../../components/Note";
import { NoteActionsProvider } from "../../components/NoteActions";
import { EDGE_MARKER } from "../../logic/graphEditorFlow";
import type { GraphEditorController } from "../../logic/useGraphEditor";
import { EditorHelpDialog, NodeSearchDialog } from "./EditorDialogs";
import { NodeInspector } from "./NodeInspector";

type Props = {
  controller: GraphEditorController;
  onBack: () => void;
  onLogout: () => void;
};

const nodeTypes = { note: Note };
const ariaLabelConfig = {
  "controls.ariaLabel": "表示操作",
  "controls.zoomIn.ariaLabel": "拡大",
  "controls.zoomOut.ariaLabel": "縮小",
  "controls.fitView.ariaLabel": "全体を表示",
  "controls.interactive.ariaLabel": "編集操作を切り替え",
  "minimap.ariaLabel": "ノート全体の地図",
  "handle.ariaLabel": "ノードをつなぐ",
} as const;

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

export function GraphEditorView({ controller, onBack, onLogout }: Props) {
  const { state, refs, actions, noteActions } = controller;
  const selectedNode = state.nodes.find((node) => node.selected);

  return (
    <div className="grid h-screen min-h-screen grid-rows-[auto_1fr] overflow-hidden">
      <header className="relative z-20 flex min-w-0 items-center gap-2 border-b border-line bg-canvas/90 px-2 py-2.5 backdrop-blur-[10px] md:gap-3 md:px-4 md:py-[0.85rem]">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <button
            className="btn btn-secondary shrink-0 px-2.5 md:px-[0.9rem]"
            type="button"
            onClick={onBack}
            title="⌘["
            aria-label="ノート一覧へ戻る"
          >
            <span aria-hidden="true" className="md:hidden">
              ←
            </span>
            <span className="hidden md:inline">ノート一覧</span>
          </button>
          <input
            aria-label="ノート名"
            value={state.titleDraft}
            onChange={(event) => actions.setTitleDraft(event.target.value)}
            onBlur={() => void actions.onRenameGraph()}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== "Escape") return;
              event.preventDefault();
              if (event.key === "Escape") {
                actions.setTitleDraft(state.graph?.title ?? state.titleDraft);
              }
              event.currentTarget.blur();
              refs.canvasRef.current?.focus();
            }}
            className="input-surface min-w-0 flex-1 px-2.5 py-[0.55rem] font-semibold md:min-w-64 md:px-3"
          />
          <button
            className="btn btn-accent shrink-0 px-2.5 md:px-[0.9rem]"
            type="button"
            aria-label="ノードを追加"
            disabled={state.busy}
            onClick={() => void actions.onAddNode({ focus: true })}
            title="N"
          >
            <span aria-hidden="true" className="md:hidden">
              ＋
            </span>
            <span className="hidden md:inline">ノードを追加</span>
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={state.busy || !state.activeParentId}
              onClick={() => void actions.addChildFromActiveParent()}
              title="Tab"
            >
              子ノードを追加
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={
                state.busy || (state.selectedNodeCount === 0 && state.selectedEdgeCount === 0)
              }
              onClick={() => void actions.onDeleteSelection(false)}
              title="⌫"
            >
              {state.selectedEdgeCount > 0 ? "つながりを削除" : "選択を削除"}
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={state.busy || state.selectedNodeCount === 0}
              onClick={() => void actions.onDeleteSelection(true)}
              title="⇧⌫"
            >
              下位ごと削除
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={state.busy || state.nodeCount === 0}
              onClick={() => void actions.onFmt()}
              title="A — ノードを自動整列"
            >
              自動整列
            </button>
            <button
              className="btn btn-secondary px-3"
              type="button"
              disabled={state.busy || !state.canUndo}
              onClick={() => void actions.undo()}
              title="⌘Z"
            >
              元に戻す
            </button>
            <button
              className="btn btn-secondary px-3"
              type="button"
              disabled={state.busy || !state.canRedo}
              onClick={() => void actions.redo()}
              title="⌘⇧Z"
            >
              やり直す
            </button>
          </div>
        </div>

        <AppMenu>
          {(close) => (
            <>
              <button
                className="btn btn-ghost flex w-full justify-start"
                type="button"
                onClick={() => {
                  close();
                  actions.openSearch();
                }}
              >
                ノードを検索
              </button>
              <button
                className="btn btn-ghost flex w-full justify-start"
                type="button"
                onClick={() => {
                  close();
                  actions.openHelp();
                }}
              >
                操作ヘルプ
              </button>
              <div className="mx-2 border-t border-line lg:hidden" />
              <button
                className="btn btn-ghost flex w-full justify-start lg:hidden"
                type="button"
                disabled={state.busy || !state.activeParentId}
                onClick={() => {
                  close();
                  void actions.addChildFromActiveParent();
                }}
              >
                子ノードを追加
              </button>
              <button
                className="btn btn-ghost flex w-full justify-start lg:hidden"
                type="button"
                disabled={
                  state.busy || (state.selectedNodeCount === 0 && state.selectedEdgeCount === 0)
                }
                onClick={() => {
                  close();
                  void actions.onDeleteSelection(false);
                }}
              >
                {state.selectedEdgeCount > 0 ? "つながりを削除" : "選択を削除"}
              </button>
              <button
                className="btn btn-ghost flex w-full justify-start lg:hidden"
                type="button"
                disabled={state.busy || state.nodeCount === 0}
                onClick={() => {
                  close();
                  void actions.onFmt();
                }}
              >
                自動整列
              </button>
              <button
                className="btn btn-ghost flex w-full justify-start lg:hidden"
                type="button"
                disabled={state.busy || !state.canUndo}
                onClick={() => {
                  close();
                  void actions.undo();
                }}
              >
                元に戻す
              </button>
              <button
                className="btn btn-ghost flex w-full justify-start lg:hidden"
                type="button"
                disabled={state.busy || !state.canRedo}
                onClick={() => {
                  close();
                  void actions.redo();
                }}
              >
                やり直す
              </button>
              <button
                className="btn btn-ghost flex w-full justify-start text-danger lg:hidden"
                type="button"
                disabled={state.busy || state.selectedNodeCount === 0}
                onClick={() => {
                  close();
                  void actions.onDeleteSelection(true);
                }}
              >
                下位ごと削除
              </button>
              <div className="mx-2 border-t border-line" />
              <button
                className="btn btn-ghost flex w-full justify-start"
                type="button"
                disabled={state.busy}
                onClick={() => {
                  close();
                  void actions.onExport();
                }}
              >
                ダウンロード
              </button>
              <div className="mx-2 border-t border-line" />
              <button
                className="btn btn-ghost flex w-full justify-start text-danger"
                type="button"
                onClick={() => {
                  close();
                  onLogout();
                }}
              >
                ログアウト
              </button>
            </>
          )}
        </AppMenu>
      </header>

      <div className="relative flex h-full min-h-0">
        <div className="relative min-w-0 flex-1">
          <div
            ref={refs.canvasRef}
            role="application"
            aria-label="ノート編集キャンバス"
            tabIndex={0}
            className="h-full min-h-0 outline-none"
            onMouseDown={() => refs.canvasRef.current?.focus()}
            onDoubleClick={(event) => {
              if (!(event.target as HTMLElement).classList.contains("react-flow__pane")) return;
              void actions.onAddNode({
                focus: true,
                at: refs.flowRef.current?.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                }),
              });
            }}
          >
            {/* onSelectionDragStop is intentionally NOT wired: React Flow
                already calls onNodeDragStop with all dragged nodes for a
                selection-rect drag, so wiring both would double every PATCH. */}
            <NoteActionsProvider value={noteActions}>
              <ReactFlow
                nodes={state.nodes}
                edges={state.edges}
                nodeTypes={nodeTypes}
                onNodesChange={actions.onNodesChange}
                onEdgesChange={actions.onEdgesChange}
                onConnect={(connection) => void actions.onConnect(connection)}
                isValidConnection={actions.isValidConnection}
                connectionMode={ConnectionMode.Loose}
                connectionRadius={45}
                nodeDragThreshold={4}
                nodeClickDistance={4}
                onNodeDragStart={actions.onNodeDragStart}
                onNodeDragStop={(event, node, nodes) =>
                  void actions.onNodeDragStop(event, node, nodes)
                }
                onNodeMouseEnter={(_, node) => actions.onNodeMouseEnter(node.id)}
                onNodeMouseLeave={(_, node) => actions.onNodeMouseLeave(node.id)}
                onNodeClick={(_, node) => actions.focusParent(node.id)}
                onSelectionChange={actions.onSelectionChange}
                onInit={actions.onFlowInit}
                defaultEdgeOptions={{ type: "default", markerEnd: EDGE_MARKER }}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                onlyRenderVisibleElements={false}
                zoomOnDoubleClick={false}
                deleteKeyCode={null}
                multiSelectionKeyCode="Shift"
                ariaLabelConfig={ariaLabelConfig}
              >
                <NodeInternalsBridge apiRef={refs.updateInternalsRef} />
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
          {state.graph && state.nodeCount === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center p-6">
              <div className="panel pointer-events-auto max-w-sm px-6 py-6 text-center shadow-2xl">
                <p className="m-0 font-brand text-xl font-bold">最初のアイデアを置く</p>
                <p className="mt-2 mb-5 text-sm leading-relaxed text-muted">
                  ノードを作ると、ここから考えをつないでいけます。Nキーやキャンバスのダブルクリックでも追加できます。
                </p>
                <button
                  className="btn btn-accent"
                  type="button"
                  disabled={state.busy}
                  onClick={() => void actions.onAddNode({ focus: true })}
                >
                  最初のノードを追加
                </button>
              </div>
            </div>
          ) : null}
          {/* Stacked, click-through container: only the dismiss button takes
              pointer events, so a lingering toast never blocks the canvas. */}
          <div className="pointer-events-none absolute top-4 left-1/2 z-10 flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2">
            {state.error ? (
              <div
                role="alert"
                className="panel flex items-start gap-3 px-4 py-3 text-sm text-danger shadow-lg"
              >
                <p className="m-0 min-w-0 flex-1">{state.error}</p>
                <button
                  type="button"
                  className="btn btn-ghost pointer-events-auto -my-1 px-2 py-1"
                  aria-label="エラーを閉じる"
                  onClick={actions.dismissError}
                >
                  ×
                </button>
              </div>
            ) : null}
            {state.notice ? (
              <p role="status" className="panel m-0 px-4 py-3 text-sm shadow-lg">
                {state.notice}
              </p>
            ) : null}
          </div>
        </div>
        <NodeInspector
          node={selectedNode}
          onReturnToCanvas={() => refs.canvasRef.current?.focus()}
        />
      </div>
      {state.dialog === "help" ? <EditorHelpDialog onClose={actions.closeDialog} /> : null}
      {state.dialog === "search" ? (
        <NodeSearchDialog
          nodes={state.nodeRecords}
          onSelect={actions.focusNodeInView}
          onClose={actions.closeDialog}
        />
      ) : null}
    </div>
  );
}
