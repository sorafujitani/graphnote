import { describe, expect, it } from "vite-plus/test";
import { userMessage } from "./userMessage";

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
