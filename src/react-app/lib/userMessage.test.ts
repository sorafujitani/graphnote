import { describe, expect, it } from "vite-plus/test";
import { oauthErrorMessage, userMessage } from "./userMessage";

describe("userMessage", () => {
  it("translates known API errors into actionable Japanese", () => {
    expect(userMessage(new Error("rate limited"), "失敗しました")).toBe(
      "操作が続いています。少し待ってからもう一度お試しください。",
    );
    expect(userMessage(new Error("token scope required: graph:write"), "失敗しました")).toBe(
      "この連携キーでは操作できません。連携設定で権限を確認してください。",
    );
  });

  it("uses the screen-specific fallback instead of exposing technical errors", () => {
    expect(userMessage(new Error("SQLITE_CONSTRAINT"), "保存できませんでした")).toBe(
      "保存できませんでした",
    );
  });
});

describe("oauthErrorMessage", () => {
  it("explains a lost sign-in and how to recover", () => {
    expect(oauthErrorMessage("?error=state_mismatch")).toBe(
      "ログインの途中で情報が失われました。このページでもう一度ログインしてください。",
    );
  });

  it("stays generic for unknown or inherited codes and silent for a clean URL", () => {
    expect(oauthErrorMessage("?error=unable_to_create_user")).toBe(
      "ログインできませんでした。もう一度お試しください。",
    );
    // `?error=` is URL-controlled: an inherited key must not become the message.
    expect(oauthErrorMessage("?error=__proto__")).toBe(
      "ログインできませんでした。もう一度お試しください。",
    );
    expect(oauthErrorMessage("?error=constructor")).toBe(
      "ログインできませんでした。もう一度お試しください。",
    );
    expect(oauthErrorMessage("")).toBeNull();
    expect(oauthErrorMessage("?graph=1")).toBeNull();
  });
});
