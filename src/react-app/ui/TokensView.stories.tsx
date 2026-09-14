import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import type { ApiTokenMeta } from "../../shared/types";
import { fn } from "storybook/test";
import type { TokensController } from "../logic/useTokens";
import { TokensView } from "./TokensView";

const token: ApiTokenMeta = {
  id: "token-1",
  name: "自分のパソコン",
  scopes: ["graph:read"],
  created_at: "2026-04-01T09:00:00.000Z",
  last_used_at: "2026-04-12T09:00:00.000Z",
  expires_at: "2026-06-30T09:00:00.000Z",
};

const tokenActions: TokensController["actions"] = {
  setName: fn(),
  setAccess: fn(),
  onCreate: fn(async () => {}),
  onDelete: fn(async () => {}),
};

const defaultState: TokensController["state"] = {
  tokens: [token],
  name: "自分のパソコン",
  access: "read",
  created: null,
  error: null,
  busy: false,
  origin: "https://storybook.example.test",
  confirmDialog: null,
};

function controller(overrides: Partial<TokensController["state"]> = {}): TokensController {
  return {
    state: { ...defaultState, ...overrides },
    actions: tokenActions,
  };
}

const onBack = fn();

const meta = {
  title: "Pages/Tokens",
  component: TokensView,
  args: {
    controller: controller(),
    onBack,
  },
  parameters: {
    docs: {
      description: {
        component:
          "API・認証・実フックを使わないStorybook専用fixtureです。操作はcallback-onlyで、キーの発行・無効化・画面遷移は実行しません。",
      },
    },
  },
} satisfies Meta<typeof TokensView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { name: "CLI連携" })).toBeVisible();
  },
};

export const Empty: Story = {
  args: {
    controller: controller({ tokens: [] }),
  },
};

export const CreatedToken: Story = {
  args: {
    controller: controller({
      created: "gqn_storybook_only_secret_123",
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("このキーは今だけ表示されます")).toBeVisible();
  },
};

export const WriteAccess: Story = {
  args: {
    controller: controller({
      access: "write",
      tokens: [
        {
          ...token,
          name: "編集用CLI",
          scopes: ["graph:read", "graph:write", "graph:export"],
          last_used_at: null,
        },
      ],
    }),
  },
};

export const RevokeConfirmation: Story = {
  args: {
    controller: controller({
      confirmDialog: {
        title: "連携キーを無効にしますか？",
        message: "このキーを使うCLIから接続できなくなります。",
        confirmLabel: "無効にする",
        danger: true,
        resolve: fn(),
      },
    }),
  },
};

export const Busy: Story = {
  args: {
    controller: controller({ busy: true }),
  },
};

export const Error: Story = {
  args: {
    controller: controller({
      error: "連携キーを読み込めませんでした。もう一度お試しください。",
    }),
  },
};
