import { describe, expect, it } from "vite-plus/test";
import { accessScopes, parseTokenScopes, tokenIsExpired } from "./tokens";

describe("API token policy", () => {
  it("gives read-only keys no mutation or export scope", () => {
    expect(accessScopes("read")).toEqual(["graph:read"]);
  });

  it("gives read-write keys only graph capabilities", () => {
    expect(accessScopes("write")).toEqual(["graph:read", "graph:write", "graph:export"]);
  });

  it("drops unknown persisted scopes", () => {
    expect(parseTokenScopes("graph:read manage:tokens graph:write")).toEqual([
      "graph:read",
      "graph:write",
    ]);
  });

  it("rejects expired and invalid expiry timestamps", () => {
    expect(tokenIsExpired("2026-01-01T00:00:00.000Z", Date.parse("2026-01-02"))).toBe(true);
    expect(tokenIsExpired("2026-01-03T00:00:00.000Z", Date.parse("2026-01-02"))).toBe(false);
    expect(tokenIsExpired("not-a-date", Date.parse("2026-01-02"))).toBe(true);
  });
});
