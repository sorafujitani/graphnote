import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import type { ApiTokenMeta } from "../../shared/types";
import { stubFetch, type FetchStub } from "../test/api-stub";
import { Tokens } from "./Tokens";
import "../index.css";

const TS = "2026-01-01T00:00:00.000Z";
const EXISTING: ApiTokenMeta = { id: "t1", name: "My laptop", created_at: TS, last_used_at: null };

let stub: FetchStub | null = null;

afterEach(() => {
  cleanup();
  stub?.restore();
  stub = null;
});

async function mountTokens() {
  stub = stubFetch(({ method, path }) => {
    if (path === "/api/tokens" && method === "GET") return { tokens: [EXISTING] };
    if (path === "/api/tokens" && method === "POST") {
      return {
        token: "gqn_live_abc123",
        meta: { id: "t2", name: "CI", created_at: TS, last_used_at: null },
      };
    }
    return undefined;
  });
  render(<Tokens onBack={() => {}} />);
  await waitFor(() => {
    if (!document.querySelector(".install-panel")) throw new Error("install panel is missing");
  });
  return stub;
}

function commands(): string[] {
  return [...document.querySelectorAll(".command-line-row code")].map(
    (code) => code.textContent ?? "",
  );
}

describe("install guidance", () => {
  it("offers the installer for the host the page came from", async () => {
    await mountTokens();

    // A hardcoded https://graphnote.app here would hand local users a command
    // that installs from production.
    expect(commands()).toContain(`curl -fsSL ${window.location.origin}/install.sh | sh`);
    expect(commands()).toContain("npx skills add sorafujitani/graphnote");
  });

  it("shows the exact set-token command once a key exists", async () => {
    await mountTokens();
    expect(commands().some((command) => command.includes("set-token"))).toBe(false);

    await userEvent.click(document.querySelector("button.accent") as HTMLElement);

    await waitFor(() => {
      expect(commands()).toContain("gqn config set-token gqn_live_abc123");
    });
  });

  it("selects the command when the clipboard is unavailable", async () => {
    // Headless Chromium denies clipboard writes, which is the same failure a
    // user hits over plain http — the text has to stay reachable.
    await mountTokens();

    await userEvent.click(document.querySelector(".command-line-row button") as HTMLElement);

    await waitFor(() => {
      expect(window.getSelection()?.toString()).toBe(commands()[0]);
    });
  });
});
