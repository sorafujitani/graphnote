import type { Edge, ReactFlowInstance } from "@xyflow/react";
import { createRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { Graph, EdgeRecord, NodeRecord } from "../../../shared/types";
import type { AppNode } from "../../logic/graphEditorTypes";
import type { FailedSave, GraphEditorController } from "../../logic/useGraphEditor";
import { GraphEditorView } from "./GraphEditorView";

type ControllerState = GraphEditorController["state"];
type ActionCallbacks = GraphEditorController["actions"];
type NoteActionCallbacks = GraphEditorController["noteActions"];
type ControllerRefs = GraphEditorController["refs"];

const demoGraph: Graph = {
  id: "graph-story",
  owner_id: "user-story",
  title: "考えをつなぐ",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
};

const demoNodeRecords: NodeRecord[] = [
  {
    id: "node-idea",
    graph_id: demoGraph.id,
    title: "観察から仮説へ",
    body: "事実を観察して、仮説を小さく検証する。\n\n- [ ] 次の実験を決める",
    x: 80,
    y: 100,
    width: 320,
    height: 180,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-02T00:00:00.000Z",
  },
  {
    id: "node-facts",
    graph_id: demoGraph.id,
    title: "まず事実を集める",
    body: "観察したことと解釈を分けて記録する。",
    x: 500,
    y: 60,
    width: 300,
    height: 160,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-02T00:00:00.000Z",
  },
  {
    id: "node-test",
    graph_id: demoGraph.id,
    title: "小さく試す",
    body: "検証結果を次の問いにつなげる。",
    x: 500,
    y: 300,
    width: 300,
    height: 160,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-02T00:00:00.000Z",
  },
];

const demoEdgeRecords: EdgeRecord[] = [
  {
    id: "edge-idea-facts",
    graph_id: demoGraph.id,
    source_id: "node-idea",
    target_id: "node-facts",
    label: "次に",
    created_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "edge-facts-test",
    graph_id: demoGraph.id,
    source_id: "node-facts",
    target_id: "node-test",
    label: "検証",
    created_at: "2024-01-01T00:00:00.000Z",
  },
];

const demoNodes: AppNode[] = demoNodeRecords.map((record) => ({
  id: record.id,
  type: "note",
  position: { x: record.x, y: record.y },
  width: record.width ?? undefined,
  height: record.height ?? undefined,
  data: {
    title: record.title,
    body: record.body,
    manuallySized: true,
  },
  selected: false,
}));

const demoEdges: Edge[] = demoEdgeRecords.map((record) => ({
  id: record.id,
  source: record.source_id,
  target: record.target_id,
  type: "default",
  label: record.label,
  selected: false,
}));

function createActionCallbacks(): ActionCallbacks {
  return {
    setTitleDraft: fn<ActionCallbacks["setTitleDraft"]>(),
    onRenameGraph: fn<ActionCallbacks["onRenameGraph"]>(),
    onAddNode: fn<ActionCallbacks["onAddNode"]>(),
    addChildFromActiveParent: fn<ActionCallbacks["addChildFromActiveParent"]>(),
    onDeleteSelection: fn<ActionCallbacks["onDeleteSelection"]>(),
    onExport: fn<ActionCallbacks["onExport"]>(),
    openRestore: fn<ActionCallbacks["openRestore"]>(),
    restoreFromBackup: fn<ActionCallbacks["restoreFromBackup"]>(),
    onFmt: fn<ActionCallbacks["onFmt"]>(),
    undo: fn<ActionCallbacks["undo"]>(),
    redo: fn<ActionCallbacks["redo"]>(),
    duplicateSelection: fn<ActionCallbacks["duplicateSelection"]>(),
    toggleCollapse: fn<ActionCallbacks["toggleCollapse"]>(),
    openHelp: fn<ActionCallbacks["openHelp"]>(),
    openSearch: fn<ActionCallbacks["openSearch"]>(),
    openEdgeLabel: fn<ActionCallbacks["openEdgeLabel"]>(),
    saveEdgeLabel: fn<ActionCallbacks["saveEdgeLabel"]>(),
    closeDialog: fn<ActionCallbacks["closeDialog"]>(),
    focusNodeInView: fn<ActionCallbacks["focusNodeInView"]>(),
    onNodesChange: fn<ActionCallbacks["onNodesChange"]>(),
    onEdgesChange: fn<ActionCallbacks["onEdgesChange"]>(),
    onConnect: fn<ActionCallbacks["onConnect"]>(),
    isValidConnection: fn<ActionCallbacks["isValidConnection"]>(),
    onNodeDragStart: fn<ActionCallbacks["onNodeDragStart"]>(),
    onNodeDragStop: fn<ActionCallbacks["onNodeDragStop"]>(),
    dismissError: fn<ActionCallbacks["dismissError"]>(),
    dismissNotice: fn<ActionCallbacks["dismissNotice"]>(),
    retryFailedSave: fn<ActionCallbacks["retryFailedSave"]>(),
    discardFailedSave: fn<ActionCallbacks["discardFailedSave"]>(),
    persistNode: fn<ActionCallbacks["persistNode"]>(),
    onNodeMouseEnter: fn<ActionCallbacks["onNodeMouseEnter"]>(),
    onNodeMouseLeave: fn<ActionCallbacks["onNodeMouseLeave"]>(),
    focusParent: fn<ActionCallbacks["focusParent"]>(),
    onSelectionChange: fn<ActionCallbacks["onSelectionChange"]>(),
    onFlowInit: fn<ActionCallbacks["onFlowInit"]>(),
    reload: fn<ActionCallbacks["reload"]>(),
  };
}

function createNoteActionCallbacks(): NoteActionCallbacks {
  return {
    onChange: fn<NoteActionCallbacks["onChange"]>(),
    onResize: fn<NoteActionCallbacks["onResize"]>(),
    onRequestChild: fn<NoteActionCallbacks["onRequestChild"]>(),
    onToggleTask: fn<NoteActionCallbacks["onToggleTask"]>(),
    onToggleCollapse: fn<NoteActionCallbacks["onToggleCollapse"]>(),
  };
}

function createRefs(): ControllerRefs {
  return {
    canvasRef: createRef<HTMLDivElement>(),
    flowRef: createRef<ReactFlowInstance<AppNode, Edge>>(),
    updateInternalsRef: createRef<(ids: string[]) => void>(),
  };
}

const baseState: ControllerState = {
  graph: demoGraph,
  titleDraft: demoGraph.title,
  busy: false,
  error: null,
  notice: null,
  dialog: null,
  loadError: null,
  exports: null,
  saveState: "idle",
  failedSaves: [],
  activeParentId: "",
  nodes: demoNodes,
  edges: demoEdges,
  nodeRecords: demoNodeRecords,
  edgeRecords: demoEdgeRecords,
  nodeCount: demoNodeRecords.length,
  edgeCount: demoEdgeRecords.length,
  hiddenCount: 0,
  selectedNodeCount: 0,
  selectedEdgeCount: 0,
  selectedEdgeId: "",
  canUndo: false,
  canRedo: false,
};

function createController(stateOverrides: Partial<ControllerState> = {}): GraphEditorController {
  return {
    state: { ...baseState, ...stateOverrides },
    refs: createRefs(),
    actions: createActionCallbacks(),
    noteActions: createNoteActionCallbacks(),
  };
}

function createEmptyController(
  stateOverrides: Partial<ControllerState> = {},
): GraphEditorController {
  return createController({
    graph: demoGraph,
    titleDraft: demoGraph.title,
    nodes: [],
    edges: [],
    nodeRecords: [],
    edgeRecords: [],
    nodeCount: 0,
    edgeCount: 0,
    hiddenCount: 0,
    selectedNodeCount: 0,
    selectedEdgeCount: 0,
    selectedEdgeId: "",
    activeParentId: "",
    ...stateOverrides,
  });
}

const selectedNodes = demoNodes.map((node) => ({
  ...node,
  selected: node.id === "node-idea",
}));

const selectedEdges = demoEdges.map((edge) => ({
  ...edge,
  selected: edge.id === "edge-idea-facts",
}));

const failedSave: FailedSave = {
  nodeId: "node-idea",
  patch: { body: "保存に失敗した編集内容" },
  message: "ノードを保存できませんでした。",
  current: null,
  before: demoNodeRecords[0],
};

const backupExports: NonNullable<ControllerState["exports"]> = [
  {
    name: "graphnote-story-2024-01-02.json",
    size: 18_432,
    uploaded: "2024-01-02T10:30:00.000Z",
    kind: "manual",
  },
  {
    name: "graphnote-story-auto.json",
    size: 8_192,
    uploaded: "2024-01-02T02:00:00.000Z",
    kind: "auto",
  },
];

const meta = {
  title: "Pages/GraphEditorView",
  component: GraphEditorView,
  args: {
    controller: createController(),
    user: null,
    onBack: fn<() => void>(),
    onLogout: fn<() => void>(),
    onOpenTokens: fn<() => void>(),
  },
  parameters: {
    docs: {
      description: {
        component:
          "実際のGraphEditorViewに型付きcontroller fixtureを渡し、表示状態とcallbackの記録だけを確認します。API・認証・fetch・本番操作全体は実行しません。",
      },
    },
  },
} satisfies Meta<typeof GraphEditorView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("application", { name: "ノート編集キャンバス" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "ノードを追加" }));
    await expect(args.controller.actions.onAddNode).toHaveBeenCalledWith({ focus: true });
  },
};

export const Empty: Story = {
  args: { controller: createEmptyController() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("最初のアイデアを置く")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "最初のノードを追加" }));
    await expect(args.controller.actions.onAddNode).toHaveBeenCalledWith({ focus: true });
  },
};

export const Loading: Story = {
  args: {
    controller: createEmptyController({
      graph: null,
      titleDraft: "",
    }),
  },
};

export const LoadError: Story = {
  args: {
    controller: createEmptyController({
      graph: null,
      titleDraft: "",
      error: "ノートを読み込めませんでした。もう一度お試しください。",
    }),
  },
};

export const NotFound: Story = {
  args: {
    controller: createController({
      graph: null,
      titleDraft: "",
      loadError: "notFound",
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("ノートが見つかりません");
    await userEvent.click(canvas.getByRole("button", { name: "ノート一覧へ" }));
    await expect(args.onBack).toHaveBeenCalled();
  },
};

export const Saving: Story = {
  args: {
    controller: createController({ saveState: "saving" }),
  },
};

export const SaveFailure: Story = {
  args: {
    controller: createController({
      saveState: "error",
      failedSaves: [failedSave],
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("ノードを保存できませんでした。");
    await userEvent.click(canvas.getByRole("button", { name: "再試行" }));
    await expect(args.controller.actions.retryFailedSave).toHaveBeenCalledWith("node-idea");
  },
};

export const SearchResults: Story = {
  args: {
    controller: createController({ dialog: { name: "search" } }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("option", { name: /観察から仮説へ/ }));
    await expect(args.controller.actions.focusNodeInView).toHaveBeenCalledWith("node-idea");
  },
};

export const SearchNoResults: Story = {
  args: {
    controller: createController({ dialog: { name: "search" } }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.type(canvas.getByRole("textbox", { name: "検索語" }), "存在しない語句");
    await expect(canvas.getByText("一致するノードはありません")).toBeVisible();
  },
};

export const EdgeLabel: Story = {
  args: {
    controller: createController({
      dialog: { name: "edgeLabel", edgeId: "edge-idea-facts" },
      selectedEdgeCount: 1,
      selectedEdgeId: "edge-idea-facts",
      edges: selectedEdges,
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const label = canvas.getByRole("textbox", { name: "ラベル" });
    await userEvent.clear(label);
    await userEvent.type(label, "理由");
    await userEvent.click(canvas.getByRole("button", { name: "保存" }));
    await expect(args.controller.actions.saveEdgeLabel).toHaveBeenCalledWith(
      "edge-idea-facts",
      "理由",
    );
  },
};

export const Restore: Story = {
  args: {
    controller: createController({
      dialog: { name: "restore" },
      exports: backupExports,
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const dialog = canvas.getByRole("dialog", { name: "バックアップから復元" });
    const manualBackup = within(dialog)
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("ダウンロード時"));
    if (!manualBackup) throw new Error("手動バックアップの行が見つかりません");
    await userEvent.click(within(manualBackup).getByRole("button", { name: "この時点に戻す" }));
    await expect(args.controller.actions.restoreFromBackup).toHaveBeenCalledWith(
      "graphnote-story-2024-01-02.json",
    );
  },
};

export const RestoreLoading: Story = {
  args: { controller: createController({ dialog: { name: "restore" }, exports: null }) },
};

export const RestoreEmpty: Story = {
  args: { controller: createController({ dialog: { name: "restore" }, exports: [] }) },
};

export const Saved: Story = {
  args: { controller: createController({ saveState: "saved" }) },
};

export const Busy: Story = {
  args: { controller: createController({ busy: true }) },
};

export const MultipleSelection: Story = {
  args: {
    controller: createController({
      nodes: demoNodes.map((node) => ({ ...node, selected: true })),
      selectedNodeCount: demoNodes.length,
      canUndo: true,
      canRedo: true,
    }),
  },
};

export const CollapsedBranch: Story = {
  args: {
    controller: createController({
      nodes: [
        {
          ...demoNodes[0]!,
          data: { ...demoNodes[0]!.data, collapsedCount: 2, activeParent: true },
        },
      ],
      edges: [],
      hiddenCount: 2,
      activeParentId: "node-idea",
    }),
  },
};

export const DeleteConfirmation: Story = {
  args: {
    controller: createController({
      dialog: {
        name: "confirm",
        title: "選択したノードを削除しますか？",
        message: "選択したノードと接続を削除します。",
        confirmLabel: "削除する",
        danger: true,
        resolve: fn(),
      },
    }),
  },
};

export const Notice: Story = {
  args: {
    controller: createController({
      notice: { message: "ノードを削除しました。", action: { label: "元に戻す", run: fn() } },
    }),
  },
};

export const Help: Story = {
  args: {
    controller: createController({ dialog: { name: "help" } }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "操作ヘルプ" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "閉じる" }));
    await expect(args.controller.actions.closeDialog).toHaveBeenCalled();
  },
};

export const SelectedNode: Story = {
  args: {
    controller: createController({
      nodes: selectedNodes,
      selectedNodeCount: 1,
      activeParentId: "node-idea",
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("complementary", { name: "ノードの詳細" })).toHaveTextContent(
      "観察から仮説へ",
    );
  },
};
