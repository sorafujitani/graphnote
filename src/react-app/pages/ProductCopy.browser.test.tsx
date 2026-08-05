import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
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

  it("uses boards and nodes consistently", async () => {
    stub = stubFetch(({ method, path }) => {
      if (method === "GET" && path === "/api/graphs") return { graphs: [] };
      return undefined;
    });
    render(
      <GraphList
        onOpen={() => {}}
        onLogout={() => {}}
        onOpenTokens={() => {}}
        onDeleteAccount={() => {}}
      />,
    );

    await waitFor(() => expect(document.body).toHaveTextContent("最初のボードを作りましょう"));
    expect(document.body).toHaveTextContent("新しいボード");
    expect(document.body).toHaveTextContent("ノードをまとめられます");
    expect(document.body).toHaveTextContent("連携設定");
    expect(document.body).toHaveTextContent("アカウントを削除");
  });
});
