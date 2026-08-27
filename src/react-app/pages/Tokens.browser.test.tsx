import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import type { ApiTokenMeta } from "../../shared/types";
import { stubFetch, type FetchStub } from "../test/api-stub";
import { Tokens } from "./Tokens";
import "../index.css";

const TS = "2026-01-01T00:00:00.000Z";
const EXPIRES = "2026-04-01T00:00:00.000Z";
const EXISTING: ApiTokenMeta = {
  id: "t1",
  name: "自分のパソコン",
  scopes: ["graph:read"],
  created_at: TS,
  last_used_at: null,
  expires_at: EXPIRES,
};

let stub: FetchStub | null = null;

afterEach(() => {
  cleanup();
  stub?.restore();
  stub = null;
  vi.restoreAllMocks();
});

async function mountTokens() {
  stub = stubFetch(({ method, path }) => {
    if (path === "/api/tokens" && method === "GET") return { tokens: [EXISTING] };
    if (path === "/api/tokens" && method === "POST") {
      return {
        token: "gqn_live_abc123",
        meta: {
          id: "t2",
          name: "CI",
          scopes: ["graph:read", "graph:write", "graph:export"],
          created_at: TS,
          last_used_at: null,
          expires_at: EXPIRES,
        },
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
  it("names the screen and permissions for CLI users", async () => {
    await mountTokens();

    expect(document.body).toHaveTextContent("CLI連携");
    expect(document.body).toHaveTextContent("読み取り");
    expect(document.body).toHaveTextContent("CLIでの使い方");
    expect(document.body).not.toHaveTextContent("見るだけ");
    expect(document.body).not.toHaveTextContent("開発者向けの設定を見る");
    expect(document.querySelector("details.install-panel")).not.toHaveAttribute("open");
  });

  it("offers the installer for the host the page came from", async () => {
    await mountTokens();

    await userEvent.click(document.querySelector("details.install-panel summary") as HTMLElement);

    // A hardcoded https://graphnote.app here would hand local users a command
    // that installs from production.
    expect(commands()).toContain(`curl -fsSL ${window.location.origin}/install.sh | sh`);
    expect(commands()).toContain("npx skills add sorafujitani/graphnote");
    expect(
      document.querySelector<HTMLAnchorElement>(
        "a[href='https://github.com/sorafujitani/graphnote']",
      ),
    ).toHaveTextContent("GitHubで詳しい使い方を見る");
  });

  it("shows a token-free setup command once a key exists", async () => {
    const api = await mountTokens();
    expect(commands().some((command) => command.includes("set-token"))).toBe(false);

    await userEvent.click(document.querySelector("button.accent") as HTMLElement);

    await waitFor(() => {
      expect(commands()).toContain("gqn config set-token");
      expect(commands().every((command) => !command.includes("gqn_live_abc123"))).toBe(true);
      expect(api.matching("POST", "/api/tokens")[0]?.body).toEqual({
        name: "自分のパソコン",
        access: "read",
      });
    });
  });

  it("copies the newly created key with one click", async () => {
    await mountTokens();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await userEvent.click(document.querySelector("button.accent") as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector("code[data-created-token]")).toHaveTextContent(
        "gqn_live_abc123",
      );
    });
    const key = document.querySelector("code[data-created-token]") as HTMLElement;
    const copyButton = key.parentElement?.querySelector("button") as HTMLElement;
    await userEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("gqn_live_abc123"));
    expect(copyButton).toHaveTextContent("コピーしました");
    expect(copyButton.parentElement?.querySelector('[role="status"]')).toHaveTextContent(
      "コピーしました",
    );
  });

  it("selects the newly created key when the clipboard is unavailable", async () => {
    await mountTokens();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await userEvent.click(document.querySelector("button.accent") as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector("code[data-created-token]")).toHaveTextContent(
        "gqn_live_abc123",
      );
    });
    const key = document.querySelector("code[data-created-token]") as HTMLElement;
    const copyButton = key.parentElement?.querySelector("button") as HTMLElement;
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(window.getSelection()?.toString()).toBe("gqn_live_abc123");
    });
    expect(copyButton.parentElement?.querySelector('[role="status"]')).toHaveTextContent(
      "コピーできないためテキストを選択しました",
    );
  });

  it("selects the command when the clipboard is unavailable", async () => {
    await mountTokens();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    await userEvent.click(document.querySelector("details.install-panel summary") as HTMLElement);

    await userEvent.click(document.querySelector(".command-line-row button") as HTMLElement);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(commands()[0]);
      expect(window.getSelection()?.toString()).toBe(commands()[0]);
    });
  });
});
