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
      <header className="relative z-20 flex items-center gap-3 border-b border-line bg-canvas/90 px-4 py-[0.85rem] backdrop-blur-[10px]">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          <button className="btn btn-secondary" type="button" onClick={onBack} title="⌘[">
            ノート一覧
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
            className="input-surface min-w-64 flex-1 px-3 py-[0.55rem] font-semibold"
          />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={state.busy}
            onClick={() => void actions.onAddNode({ focus: true })}
            title="N"
          >
            ノードを追加
          </button>
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
        </div>

        <AppMenu>
          {(close) => (
            <>
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
                onNodeDragStop={(event, node) => void actions.onNodeDragStop(event, node)}
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
          {state.error ? (
            <p
              role="status"
              className="panel pointer-events-none absolute top-4 left-1/2 z-10 m-0 max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 px-4 py-3 text-sm text-danger shadow-lg"
            >
              {state.error}
            </p>
          ) : null}
        </div>
        <NodeInspector node={selectedNode} />
      </div>
    </div>
  );
}
