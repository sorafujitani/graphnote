import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LoginView } from "./LoginView";

const onGoogle = fn(async () => {});
const meta = {
  title: "Pages/Login",
  component: LoginView,
  args: {
    controller: { state: { busy: false, error: "" }, actions: { onGoogle } },
    onOpenLegal: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          "表示専用のログイン画面です。クリックはActionsに記録され、認証や画面遷移は行いません。",
      },
    },
  },
} satisfies Meta<typeof LoginView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Googleでログイン" }));
    await expect(onGoogle).toHaveBeenCalled();
  },
};
export const Loading: Story = {
  args: { controller: { state: { busy: true, error: "" }, actions: { onGoogle } } },
};
export const Error: Story = {
  args: {
    controller: {
      state: { busy: false, error: "ログインできませんでした。もう一度お試しください。" },
      actions: { onGoogle },
    },
  },
};
