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
  });
});
