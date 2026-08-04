import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useEffect, type MutableRefObject } from "react";
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

  return (
    <div className="grid h-screen min-h-screen grid-rows-[auto_1fr] overflow-hidden">
      <header className="flex items-center gap-3 overflow-x-auto border-b border-line bg-canvas/90 px-4 py-[0.85rem] backdrop-blur-[10px]">
        <button className="btn btn-secondary" type="button" onClick={onBack} title="⌘[">
          Notes
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
          Add note
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={state.busy || !state.activeParentId}
          onClick={() => void actions.addChildFromActiveParent()}
          title="Tab"
        >
          Link note
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={state.busy || state.selectedNodeCount === 0}
          onClick={() => void actions.onCascadeSelect()}
          title="C"
        >
          Select branch
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={state.busy || (state.selectedNodeCount === 0 && state.selectedEdgeCount === 0)}
          onClick={() => void actions.onDeleteSelection(false)}
          title="⌫"
        >
          Delete
        </button>
        <button
          className="btn btn-danger"
          type="button"
          disabled={state.busy || (state.selectedNodeCount === 0 && state.cascadeNodeCount === 0)}
          onClick={() => void actions.onDeleteSelection(true)}
          title="⇧⌫"
        >
          Delete branch
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={state.busy || state.nodeCount === 0}
          onClick={() => void actions.onFmt()}
          title="A — arrange notes"
        >
          Arrange
        </button>
        <button
          className="btn btn-accent"
          type="button"
          disabled={state.busy}
          onClick={() => void actions.onExport()}
          title="⌘E"
        >
          Download
        </button>
        <button className="btn btn-ghost" type="button" onClick={onLogout}>
          Log out
        </button>
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
            {state.graph ? `${state.nodeCount} notes · ${state.edgeCount} links` : "Loading…"}
          </p>
          {state.activeParentId ? (
            <p className="mt-0 mb-4 text-sm text-accent">Tab adds a linked note from here</p>
          ) : (
            <p className="mt-0 mb-4 text-sm text-muted">Focus a note to start linking</p>
          )}
          <p className="mt-0 mb-[0.35rem] text-[0.78rem] text-muted">Mouse</p>
          <div className="mb-4 text-[0.78rem] leading-[1.7] text-muted">
            <div>Drag a note · move it</div>
            <div>Double-click · edit the text</div>
            <div>Drag a side edge · link notes</div>
            <div>Double-click the canvas · new note</div>
          </div>
          <p className="mt-0 mb-[0.35rem] text-[0.78rem] text-muted">Shortcuts</p>
          <div className="text-[0.78rem] leading-[1.7] text-muted">
            <div>F / arrows · focus a note</div>
            <div>Tab · linked note</div>
            <div>N · standalone note</div>
            <div>Enter · edit · title → body</div>
            <div>Esc / ⌘Enter · save body</div>
            <div>Esc · clear canvas focus</div>
            <div>Shift + arrows · nudge</div>
            <div>L · connect notes</div>
            <div>C · select branch</div>
            <div>Delete · remove selection</div>
            <div>A · arrange notes</div>
            <div>⌘E · download backup</div>
            <div>⌘[ · back to notes</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
