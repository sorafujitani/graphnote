import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Note } from "../../components/Note";
import { NoteActionsProvider } from "../../components/NoteActions";
import { EDGE_MARKER } from "../../logic/graphEditorFlow";
import type { GraphEditorController } from "../../logic/useGraphEditor";

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
  "minimap.ariaLabel": "ボード全体の地図",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [menuOpen]);

  return (
    <div className="grid h-screen min-h-screen grid-rows-[auto_1fr] overflow-hidden">
      <header className="relative z-20 flex items-center gap-3 border-b border-line bg-canvas/90 px-4 py-[0.85rem] backdrop-blur-[10px]">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          <button className="btn btn-secondary" type="button" onClick={onBack} title="⌘[">
            ボード一覧
          </button>
          <input
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

        <div ref={menuRef} className="relative shrink-0">
          <button
            ref={menuButtonRef}
            className="btn btn-secondary grid size-10 place-items-center px-0 py-0"
            type="button"
            aria-label="メニュー"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5 fill-current">
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="panel absolute top-full right-0 mt-2 grid min-w-48 gap-1 p-2">
              <button
                className="btn btn-ghost flex w-full justify-start"
                type="button"
                disabled={state.busy}
                onClick={() => {
                  setMenuOpen(false);
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
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                ログアウト
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_260px]">
        <div
          ref={refs.canvasRef}
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

        <aside className="overflow-auto border-l border-line bg-surface p-4">
          {state.error ? <p className="m-0 text-danger">{state.error}</p> : null}
          <p className="mt-0 text-muted">
            {state.graph
              ? `ノード ${state.nodeCount}個 · つながり ${state.edgeCount}本`
              : "読み込んでいます…"}
          </p>
          {state.selectedEdgeCount > 0 ? (
            <p className="mt-0 mb-4 text-sm text-accent">
              つながりを選択中です。Deleteで削除できます
            </p>
          ) : state.activeParentId ? (
            <p className="mt-0 mb-4 text-sm text-accent">
              このノードからTabで子ノードを追加できます
            </p>
          ) : (
            <p className="mt-0 mb-4 text-sm text-muted">ノードを選ぶと操作を始められます</p>
          )}
          <p className="mt-0 mb-[0.35rem] text-[0.78rem] font-semibold text-muted">基本操作</p>
          <div className="mb-4 text-[0.78rem] leading-[1.7] text-muted">
            <div>ノードをドラッグ · 移動</div>
            <div>ノードをダブルクリック · 編集</div>
            <div>ノードの端からドラッグ · つなぐ</div>
            <div>つながりをクリック · 選択</div>
            <div>余白をダブルクリック · ノードを追加</div>
          </div>
          <details className="text-[0.78rem] text-muted">
            <summary className="cursor-pointer font-semibold">キーボード操作</summary>
            <div className="mt-2 leading-[1.7]">
              <div>F / 矢印 · ノードを選ぶ</div>
              <div>Tab · 子ノードを追加</div>
              <div>N · ノードを追加</div>
              <div>Enter · タイトルから本文を編集</div>
              <div>Esc / ⌘Enter · 本文を保存</div>
              <div>Esc · 選択を解除</div>
              <div>Shift + 矢印 · 少し移動</div>
              <div>L · ノードをつなぐ</div>
              <div>Delete · 選択を削除</div>
              <div>A · 自動整列</div>
              <div>⌘E · ダウンロード</div>
              <div>⌘[ · ボード一覧へ戻る</div>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
