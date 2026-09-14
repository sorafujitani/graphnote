import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { QUOTA } from "../../shared/quota";
import type { GraphSummary, PublicUser } from "../../shared/types";
import type { GraphListController } from "../logic/useGraphList";
import { GraphListView } from "./GraphListView";

const user: PublicUser = {
  id: "user-1",
  name: "花子",
  email: "hanako@example.com",
  image: null,
};

function graph(
  id: string,
  title: string,
  nodeCount: number,
  updatedAt: string,
  deletedAt: string | null = null,
): GraphSummary {
  return {
    id,
    owner_id: user.id,
    title,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: deletedAt,
    node_count: nodeCount,
    edge_count: Math.max(nodeCount - 1, 0),
  };
}

const graphs = [
  graph("graph-1", "週次レビュー", 12, "2026-04-12T09:00:00.000Z"),
  graph("graph-2", "読書メモ", 5, "2026-04-10T18:30:00.000Z"),
];
const deletedGraph = graph(
  "graph-deleted",
  "削除した企画メモ",
  8,
  "2026-03-20T12:00:00.000Z",
  "2026-04-11T10:00:00.000Z",
);
const quotaGraphs = Array.from({ length: QUOTA.maxGraphsPerUser }, (_, index) =>
  graph(`graph-${index + 1}`, `ノート ${index + 1}`, (index % 12) + 1, "2026-04-12T09:00:00.000Z"),
);

const graphActions: GraphListController["actions"] = {
  setTitle: fn(),
  setQuery: fn(),
  changeSort: fn(),
  setActiveIndex: fn(),
  onCreate: fn(async () => {}),
  onDelete: fn(async () => {}),
  onPurge: fn(async () => {}),
  restoreGraph: fn(async () => {}),
  loadTrash: fn(async () => {}),
  hideTrash: fn(),
  startRename: fn(),
  cancelRename: fn(),
  commitRename: fn(async () => {}),
  setRenameDraft: fn(),
  onImportFile: fn(async () => {}),
  dismissError: fn(),
  dismissNotice: fn(),
  openHit: fn(),
};

const defaultState: GraphListController["state"] = {
  graphs,
  totalGraphs: graphs.length,
  trash: null,
  title: "",
  query: "",
  sort: "updated",
  hits: [],
  searching: false,
  error: null,
  notice: null,
  loading: false,
  busy: false,
  activeIndex: 0,
  renamingId: null,
  renameDraft: "",
  confirmDialog: null,
};

function controller(overrides: Partial<GraphListController["state"]> = {}): GraphListController {
  return {
    state: { ...defaultState, ...overrides },
    actions: graphActions,
  };
}

const onOpen = fn();
const onLogout = fn();
const onOpenTokens = fn();
const onOpenHelp = fn();
const onDeleteAccount = fn();

const meta = {
  title: "Pages/GraphList",
  component: GraphListView,
  args: {
    controller: controller(),
    user,
    onOpen,
    onLogout,
    onOpenTokens,
    onOpenHelp,
    onDeleteAccount,
  },
  parameters: {
    docs: {
      description: {
        component:
          "API・認証・実フックを使わないStorybook専用fixtureです。操作はcallback-onlyで、クリックしても本番の作成・削除・遷移は行いません。",
      },
    },
  },
} satisfies Meta<typeof GraphListView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const graphRow = canvas.getByText("週次レビュー").closest("article");
    if (!graphRow) throw new globalThis.Error("週次レビューの行が見つかりません");
    await userEvent.click(within(graphRow).getByRole("button", { name: /^週次レビュー/ }));
    await expect(onOpen).toHaveBeenCalledWith("graph-1");
  },
};

export const Empty: Story = {
  args: {
    controller: controller({ graphs: [], totalGraphs: 0 }),
  },
};

export const Loading: Story = {
  args: {
    controller: controller({ graphs: [], totalGraphs: 0, loading: true }),
  },
};

export const Error: Story = {
  args: {
    controller: controller({
      graphs: [],
      totalGraphs: 0,
      error: "ノートを読み込めませんでした。もう一度お試しください。",
    }),
  },
};

export const QuotaReached: Story = {
  args: {
    controller: controller({
      graphs: quotaGraphs,
      totalGraphs: quotaGraphs.length,
    }),
  },
};

export const SearchNoResults: Story = {
  args: {
    controller: controller({
      query: "見つからないノート",
      graphs: [],
      hits: [],
    }),
  },
};

export const Searching: Story = {
  args: { controller: controller({ query: "読書", graphs: [], searching: true }) },
};

export const SearchResults: Story = {
  args: {
    controller: controller({
      query: "読書",
      graphs: [graphs[1]!],
      hits: [
        {
          graph_id: "graph-2",
          graph_title: "読書メモ",
          node_id: "node-reading",
          title: "読書から学んだこと",
          snippet: "読書の習慣を振り返る。",
        },
      ],
    }),
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /読書から学んだこと/ }),
    );
    await expect(args.controller.actions.openHit).toHaveBeenCalledWith(
      args.controller.state.hits[0],
    );
  },
};

export const Renaming: Story = {
  args: { controller: controller({ renamingId: "graph-1", renameDraft: "今週の振り返り" }) },
};

export const Busy: Story = {
  args: { controller: controller({ busy: true, title: "新しいノート" }) },
};

export const EmptyTrash: Story = {
  args: { controller: controller({ trash: [] }) },
};

export const DeleteConfirmation: Story = {
  args: {
    controller: controller({
      confirmDialog: {
        title: "ノートを削除しますか？",
        message: "削除したノートは一定期間、一覧から復元できます。",
        confirmLabel: "削除する",
        danger: true,
        resolve: fn(),
      },
    }),
  },
};

export const DeletedList: Story = {
  args: {
    controller: controller({
      trash: [deletedGraph],
    }),
  },
};
