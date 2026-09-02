import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import App from "../App";
import "../index.css";

const realFetch = globalThis.fetch;

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  window.history.replaceState(null, "", "/");
  document.title = "graphnote";
});

describe("session recovery", () => {
  it("shows login for an anonymous session and a 401", async () => {
    for (const result of [
      response(200, { authenticated: false }),
      response(401, { error: "unauthorized" }),
    ]) {
      globalThis.fetch = async () => result.clone();
      const view = render(<App />);
      expect(await screen.findByRole("button", { name: "Googleでログイン" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("does not offer OAuth for a 500 or network failure", async () => {
    for (const fetcher of [
      async () => response(500, { error: "down" }),
      async () => Promise.reject(new TypeError("offline")),
    ]) {
      globalThis.fetch = fetcher as typeof fetch;
      const view = render(<App />);
      expect(await screen.findByRole("button", { name: "再試行" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Googleでログイン" })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("retries in place and restores the deep editor route", async () => {
    window.history.replaceState(null, "", "/g/g1");
    let attempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(target, location.origin).pathname;
      if (path === "/api/me") {
        attempts += 1;
        return attempts === 1
          ? response(500, { error: "down" })
          : response(200, { authenticated: true, user: { id: "u1" } });
      }
      if (path === "/api/graphs/g1") {
        return response(200, {
          graph: {
            id: "g1",
            owner_id: "u1",
            title: "Recovered",
            created_at: "now",
            updated_at: "now",
          },
          nodes: [],
          edges: [],
        });
      }
      return response(200, { ok: true });
    }) as typeof fetch;

    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "再試行" }));

    await waitFor(() => expect(screen.getByDisplayValue("Recovered")).toBeInTheDocument());
    expect(window.location.pathname).toBe("/g/g1");
    await waitFor(() => expect(document.title).toBe("Recovered · graphnote"));
  });

  it("shows the authenticated account and opens help from the list menu", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(target, location.origin).pathname;
      if (path === "/api/me") {
        return response(200, {
          authenticated: true,
          user: { id: "u1", name: "Sora", email: "sora@example.com", image: null },
        });
      }
      if (path === "/api/graphs") return response(200, { graphs: [] });
      return response(200, { ok: true });
    }) as typeof fetch;

    render(<App />);
    await screen.findByText("最初のノートを作りましょう");
    expect(document.title).toBe("あなたのノート · graphnote");

    await userEvent.click(screen.getByRole("button", { name: "メニュー" }));
    expect(screen.getByText("Sora")).toBeInTheDocument();
    expect(screen.getByText("sora@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "使い方" }));
    const help = screen.getByRole("dialog");
    expect(help).toHaveTextContent("操作ヘルプ");
    expect(help).toHaveTextContent("一覧でノートを選ぶ");
    expect(help).toHaveTextContent("一覧で選んだノートを開く");
    expect(help).toHaveTextContent("詳細からノート一覧へ戻る");
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("キーボードで一覧からノートを開き、詳細から一覧へ戻れる", async () => {
    const graphs = [
      {
        id: "g1",
        owner_id: "u1",
        title: "一件目",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        node_count: 0,
        edge_count: 0,
      },
      {
        id: "g2",
        owner_id: "u1",
        title: "二件目",
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        node_count: 0,
        edge_count: 0,
      },
    ];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(target, location.origin).pathname;
      if (path === "/api/me") {
        return response(200, {
          authenticated: true,
          user: { id: "u1", name: "Sora", email: "sora@example.com", image: null },
        });
      }
      if (path === "/api/graphs") return response(200, { graphs });
      if (path === "/api/graphs/g2") {
        return response(200, { graph: graphs[1], nodes: [], edges: [] });
      }
      return response(200, { ok: true });
    }) as typeof fetch;

    render(<App />);
    await screen.findByText("一件目");
    expect(screen.getByText("↑↓で選択 / Enterで開く")).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByText("二件目").closest("article")).toHaveClass("ring-accent");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(window.location.pathname).toBe("/g/g2"));
    expect(await screen.findByDisplayValue("二件目")).toBeInTheDocument();

    await userEvent.keyboard("{Control>}[[{/Control}");
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(await screen.findByText("一件目")).toBeInTheDocument();
  });

  it("renders a 404 screen for an unknown authenticated route", async () => {
    window.history.replaceState(null, "", "/unknown");
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(target, location.origin).pathname;
      if (path === "/api/me") {
        return response(200, {
          authenticated: true,
          user: { id: "u1", name: "Sora", email: "sora@example.com", image: null },
        });
      }
      if (path === "/api/graphs") return response(200, { graphs: [] });
      return response(200, { ok: true });
    }) as typeof fetch;

    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "ページが見つかりません" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("ページが見つかりません · graphnote"));

    await userEvent.click(screen.getByRole("button", { name: "ノート一覧へ" }));
    await screen.findByText("最初のノートを作りましょう");
    expect(window.location.pathname).toBe("/");
  });

  it("focuses a node named by the deep-link query", async () => {
    window.history.replaceState(null, "", "/g/g1?node=n2");
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(target, location.origin).pathname;
      if (path === "/api/me") {
        return response(200, {
          authenticated: true,
          user: { id: "u1", name: "Sora", email: "sora@example.com", image: null },
        });
      }
      if (path === "/api/graphs/g1") {
        return response(200, {
          graph: {
            id: "g1",
            owner_id: "u1",
            title: "Deep link",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
          nodes: [
            {
              id: "n1",
              graph_id: "g1",
              title: "One",
              body: "",
              x: 0,
              y: 0,
              width: null,
              height: null,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "n2",
              graph_id: "g1",
              title: "Two",
              body: "",
              x: 520,
              y: 40,
              width: null,
              height: null,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          edges: [],
        });
      }
      return response(200, { ok: true });
    }) as typeof fetch;

    render(<App />);
    await waitFor(() => {
      expect(document.querySelector('[data-id="n2"] .note-card')).toHaveClass("is-active");
    });
    expect(document.title).toBe("Deep link · graphnote");
    expect(window.location.search).toBe("?node=n2");
  });
});
