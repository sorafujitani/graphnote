import { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";
import { AppMenu } from "./AppMenu";
import { ConfirmDialog, DialogFrame } from "./Dialog";
import { DropdownMenuItem } from "./ui/dropdown-menu";
import "../index.css";

afterEach(async () => {
  cleanup();
  await page.viewport(1280, 900);
});

it("navigates the menu, skips disabled items and transfers focus to a safe confirmation", async () => {
  const resolve = vi.fn();
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <AppMenu>
          <DropdownMenuItem>使い方</DropdownMenuItem>
          <DropdownMenuItem disabled>使用不可</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)}>
            削除
          </DropdownMenuItem>
        </AppMenu>
        {open && (
          <ConfirmDialog
            title="削除しますか？"
            message="この操作は取り消せません。"
            confirmLabel="削除する"
            danger
            onResolve={(ok) => {
              resolve(ok);
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "メニュー" });
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "使い方" })).toHaveFocus());
  await userEvent.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "削除" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  const dialog = await screen.findByRole("dialog", { name: "削除しますか？" });
  expect(dialog).toHaveAccessibleDescription("この操作は取り消せません。");
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "キャンセル" })).toHaveFocus(),
  );
  await userEvent.tab();
  expect(within(dialog).getByRole("button", { name: "削除する" })).toHaveFocus();
  await userEvent.tab();
  expect(within(dialog).getByRole("button", { name: "閉じる" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(resolve).toHaveBeenCalledExactlyOnceWith(false);
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(document.body.style.pointerEvents).not.toBe("none");

  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("menuitem", { name: "削除" }));
  await userEvent.click(screen.getByRole("button", { name: "削除する" }));
  expect(resolve).toHaveBeenLastCalledWith(true);
  await waitFor(() => expect(trigger).toHaveFocus());
});

function HelpExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      {open && (
        <DialogFrame title="操作ヘルプ" onClose={() => setOpen(false)}>
          <a href="#help" className="p-5">
            ヘルプの詳細
          </a>
        </DialogFrame>
      )}
    </>
  );
}

it("keeps a narrow-screen dialog on screen, traps focus including links, and restores its opener", async () => {
  await page.viewport(390, 640);
  render(<HelpExample />);
  const opener = screen.getByRole("button", { name: "開く" });
  await userEvent.click(opener);
  const dialog = screen.getByRole("dialog", { name: "操作ヘルプ" });
  const box = dialog.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(390);
  expect(box.bottom).toBeLessThanOrEqual(640);
  await userEvent.tab({ shift: true });
  expect(screen.getByRole("link", { name: "ヘルプの詳細" })).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  await userEvent.click(document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement, {
    position: { x: 5, y: 5 },
  });
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
