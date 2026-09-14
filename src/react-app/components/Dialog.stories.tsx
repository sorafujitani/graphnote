import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConfirmDialog } from "./Dialog";

const meta = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  args: {
    title: "ノートを削除しますか？",
    message: "この操作はStorybook内の表示だけを変更します。",
    confirmLabel: "削除する",
    danger: true,
    onResolve: fn(),
  },
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    return (
      <div className="p-6">
        <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}>
          ダイアログを開く
        </button>
        {open && (
          <ConfirmDialog
            {...args}
            onResolve={(ok) => {
              args.onResolve(ok);
              setOpen(false);
            }}
          />
        )}
      </div>
    );
  },
} satisfies Meta<typeof ConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Danger: Story = {};
export const Standard: Story = {
  args: { title: "変更を適用しますか？", confirmLabel: "適用する", danger: false },
};
export const Cancel: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "キャンセル" }));
    await expect(args.onResolve).toHaveBeenCalledWith(false);
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
