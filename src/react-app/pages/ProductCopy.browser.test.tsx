import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { GraphList } from "./GraphList";
import { LoginView } from "../ui/LoginView";
import { stubFetch, type FetchStub } from "../test/api-stub";
import "../index.css";

let stub: FetchStub | null = null;

afterEach(() => {
  cleanup();
  stub?.restore();
  stub = null;
});

describe("customer-facing product copy", () => {
  it("keeps sign-in focused without a marketing tagline", () => {
    render(
      <LoginView
        controller={{
          state: { busy: false, error: null },
          actions: { onGoogle: async () => {} },
        }}
        onOpenLegal={() => {}}
      />,
    );

    expect(document.body).toHaveTextContent("graphnote");
    expect(document.body).toHaveTextContent("Googleでログイン");
    expect(document.body).toHaveTextContent("利用規約");
    expect(document.body).not.toHaveTextContent("考えを、カードでつなげよう。");
  });

  it("uses notes consistently and keeps account deletion inside the menu", async () => {
    let deleteRequested = false;
    stub = stubFetch(({ method, path }) => {
      if (method === "GET" && path === "/api/graphs") return { graphs: [] };
      return undefined;
    });
    render(
      <GraphList
        user={null}
        onOpen={() => {}}
        onLogout={() => {}}
        onOpenTokens={() => {}}
        onOpenHelp={() => {}}
        onDeleteAccount={() => {
          deleteRequested = true;
        }}
      />,
    );

    await waitFor(() => expect(document.body).toHaveTextContent("最初のノートを作りましょう"));
    expect(document.body).toHaveTextContent("新しいノート");
    expect(document.body).not.toHaveTextContent("ボード");
    expect(document.body).toHaveTextContent("ノードをまとめられます");
    expect(screen.queryByRole("menuitem", { name: "CLI連携" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "ログアウト" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "アカウントを削除" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "メニュー" }));

    expect(screen.getByRole("menuitem", { name: "CLI連携" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "ログアウト" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "アカウントを削除" }));

    expect(deleteRequested).toBe(true);
    expect(screen.queryByRole("menuitem", { name: "アカウントを削除" })).not.toBeInTheDocument();
  });
});
