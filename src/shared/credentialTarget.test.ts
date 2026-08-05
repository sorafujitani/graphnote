import { describe, expect, it } from "vite-plus/test";
import { credentialAudience, isAllowedCredentialTarget } from "./credentialTarget";

describe("credential target policy", () => {
  it("treats the custom domain and workers.dev production host as one audience", () => {
    expect(credentialAudience("https://graphnote.app")).toBe("graphnote:production");
    expect(credentialAudience("https://graphnote.fujitanisora0414.workers.dev")).toBe(
      "graphnote:production",
    );
  });

  it("keeps unrelated origins in separate audiences", () => {
    expect(credentialAudience("https://example.com/api")).toBe("origin:https://example.com");
    expect(credentialAudience("https://evil.example/api")).not.toBe(
      credentialAudience("https://graphnote.app"),
    );
  });

  it("allows HTTPS and loopback HTTP but rejects remote plain HTTP", () => {
    expect(isAllowedCredentialTarget("https://graphnote.app")).toBe(true);
    expect(isAllowedCredentialTarget("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedCredentialTarget("http://localhost:5173")).toBe(true);
    expect(isAllowedCredentialTarget("http://example.com")).toBe(false);
  });
});
