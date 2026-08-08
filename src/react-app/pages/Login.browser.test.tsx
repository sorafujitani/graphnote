import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { Login } from "./Login";
import "../index.css";

// The auth client resolves with `{ error }` instead of throwing, and it captures
// `fetch` when the module loads, so the failure has to come from the client itself.
const { social } = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock("../server/auth", () => ({ authClient: { signIn: { social } } }));

afterEach(() => {
  cleanup();
  social.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("sign-in recovery", () => {
  it("explains a failed OAuth callback and clears the code from the URL", () => {
    window.history.replaceState(null, "", "/?error=state_mismatch");

    render(<Login onOpenLegal={() => {}} />);

    expect(document.body).toHaveTextContent(
      "ログインの途中で情報が失われました。このページでもう一度ログインしてください。",
    );
    expect(window.location.search).toBe("");
    expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeEnabled();
  });

  it("offers another attempt when starting the sign-in fails", async () => {
    social.mockResolvedValue({ error: { message: "boom", statusText: "Bad Request" } });

    render(<Login onOpenLegal={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Googleでログイン" }));

    expect(document.body).toHaveTextContent(
      "ログインできませんでした。時間をおいてもう一度お試しください。",
    );
    expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeEnabled();
    expect(social).toHaveBeenCalledTimes(1);
  });

  it("stays disabled while the redirect to Google is on its way", async () => {
    // A second flow would overwrite this one's state cookie and fail the callback.
    social.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } });

    render(<Login onOpenLegal={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Googleでログイン" }));

    expect(screen.getByRole("button", { name: "ログインしています…" })).toBeDisabled();
    expect(social).toHaveBeenCalledTimes(1);
  });
});
