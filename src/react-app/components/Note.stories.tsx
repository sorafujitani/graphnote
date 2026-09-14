import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
} from "@xyflow/react";
import { useRef } from "react";
import { expect, userEvent, within } from "storybook/test";
import { toggleTask } from "../../shared/taskList";
import type { AppNode } from "../logic/graphEditorTypes";
import { Note } from "./Note";
import { NoteActionsProvider, type NoteActions } from "./NoteActions";

const nodeTypes = { note: Note };

type PlaygroundProps = { title: string; body: string };

function Playground({ title, body }: PlaygroundProps) {
  const nextId = useRef(2);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: "n1", type: "note", position: { x: 60, y: 60 }, data: { title, body } },
    {
      id: "n2",
      type: "note",
      position: { x: 460, y: 100 },
      data: { title: "接続先", body: "左のノートの側面からここへドラッグ" },
    },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const actions: NoteActions = {
    onChange: (id, patch) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      );
    },
    onResize: (id, { x, y, width, height }) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id
            ? {
                ...node,
                position: { x, y },
                style: { width, height },
                data: { ...node.data, manuallySized: true },
              }
            : node,
        ),
      );
    },
    onRequestChild: (id) => {
      const parent = nodes.find((node) => node.id === id);
      if (!parent) return;
      const childId = `n${++nextId.current}`;
      setNodes((current) => [
        ...current,
        {
          id: childId,
          type: "note",
          position: { x: parent.position.x + 360, y: parent.position.y + 240 },
          data: { title: "子ノード", body: "" },
        },
      ]);
      setEdges((current) =>
        addEdge({ id: `${id}-${childId}`, source: id, target: childId }, current),
      );
    },
    onToggleTask: (id, index) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, body: toggleTask(node.data.body, index) } }
            : node,
        ),
      );
    },
    onToggleCollapse: () => {},
  };

  return (
    <div style={{ height: "100vh", minHeight: 500 }}>
      <NoteActionsProvider value={actions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection) => setEdges((current) => addEdge(connection, current))}
          nodeClickDistance={5}
          connectionRadius={40}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </NoteActionsProvider>
    </div>
  );
}

const meta = {
  title: "Canvas/Note",
  component: Playground,
  parameters: {
    docs: {
      description: {
        component:
          "実際のNoteをReact Flow上で操作できます。ドラッグ・選択・ダブルクリック編集・リサイズ・接続・タスク切替・編集中のTabによる子追加に対応。変更はメモリ内だけで、再読込でリセットされます。GraphEditorのショートカット・履歴・保存・枝の折り畳みは対象外です。",
      },
    },
  },
  args: {
    title: "ダブルクリックで編集",
    body: "本文もダブルクリックで編集できます。\n\n- [ ] タスクを切り替える\n- [x] Markdownを確認する",
  },
  render: (args) => <Playground key={JSON.stringify(args)} {...args} />,
} satisfies Meta<typeof Playground>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};
export const Empty: Story = { args: { title: "", body: "" } };
export const Markdown: Story = {
  args: {
    title: "Markdownの表示",
    body: "## 見出し\n\n**太字** と *斜体*、`code`\n\n> 引用文\n\n- 箇条書き\n- [ ] 未完了\n- [x] 完了\n\n```ts\nconst note = 'graphnote';\n```",
  },
};
export const EditTitle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.dblClick(await canvas.findByText("ダブルクリックで編集"));
    const editor = canvas.getByRole("textbox");
    await userEvent.clear(editor);
    await userEvent.type(editor, "編集を確認しました");
    await userEvent.click(canvas.getByText("接続先"));
    await expect(canvas.getByText("編集を確認しました")).toBeVisible();
  },
};
