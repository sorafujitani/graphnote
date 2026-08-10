import { describe, expect, it } from "vite-plus/test";
import { numericFlag, parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("keeps negative numbers as flag values", () => {
    const { flags } = parseArgs(["nodes", "create", "g1", "--x", "-100", "--y", "-0.5"]);
    expect(flags.x).toBe("-100");
    expect(flags.y).toBe("-0.5");
  });

  it("supports --flag=value", () => {
    const { flags } = parseArgs(["--url=https://example.com", "graphs", "list"]);
    expect(flags.url).toBe("https://example.com");
  });

  it("reports unknown flags instead of dropping them", () => {
    const { unknown, flags } = parseArgs(["nodes", "create", "g1", "--titel", "Hello"]);
    expect(unknown).toEqual(["--titel"]);
    expect(flags.titel).toBeUndefined();
  });

  it("treats boolean flags as valueless", () => {
    const { args, flags } = parseArgs(["--prod", "graphs", "list"]);
    expect(flags.prod).toBe(true);
    expect(args).toEqual(["graphs", "list"]);
  });

  it("marks --url without a value as true so the caller can reject it", () => {
    const { flags } = parseArgs(["--url", "--force", "graphs", "list"]);
    expect(flags.url).toBe(true);
    expect(flags.force).toBe(true);
  });

  it("passes everything after -- through as positional args", () => {
    const { args } = parseArgs(["nodes", "delete", "g1", "--", "--weird-id"]);
    expect(args).toEqual(["nodes", "delete", "g1", "--weird-id"]);
  });
});

describe("numericFlag", () => {
  it("accepts finite numbers", () => {
    expect(numericFlag({ x: "-100" }, "x")).toEqual({ value: -100 });
  });

  it("rejects non-numeric values with an error", () => {
    expect(numericFlag({ x: "abc" }, "x").error).toMatch(/--x must be a number/);
  });

  it("rejects a valueless numeric flag", () => {
    expect(numericFlag({ x: true }, "x").error).toMatch(/--x requires a number/);
  });

  it("returns empty when the flag is absent", () => {
    expect(numericFlag({}, "x")).toEqual({});
  });
});

describe("dash-prefixed values", () => {
  it("keeps markdown list bodies as values", () => {
    const { flags } = parseArgs(["nodes", "create", "g1", "--body", "- item one"]);
    expect(flags.body).toBe("- item one");
  });

  it("keeps titles starting with a dash", () => {
    const { flags } = parseArgs(["nodes", "create", "g1", "--title", "-draft"]);
    expect(flags.title).toBe("-draft");
  });

  it("still treats a following known flag as a missing value", () => {
    const { flags } = parseArgs(["--url", "--force", "graphs", "list"]);
    expect(flags.url).toBe(true);
    expect(flags.force).toBe(true);
  });

  it("rejects empty numeric values", () => {
    expect(numericFlag({ x: "" }, "x").error).toMatch(/--x requires a number/);
  });
});
