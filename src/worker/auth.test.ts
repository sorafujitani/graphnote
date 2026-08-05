import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";
import type { ApiTokenScope } from "../shared/types";
import { requireScope, requireSession, type AuthVariables } from "./auth";
import type { Bindings } from "./env";

type TestEnv = { Bindings: Bindings; Variables: AuthVariables };

function appFor(authMethod: "session" | "token", scopes: ApiTokenScope[]) {
  const app = new Hono<TestEnv>();
  app.use("*", async (c, next) => {
    c.set("userId", "u1");
    c.set("user", null);
    c.set("authMethod", authMethod);
    c.set("tokenId", authMethod === "token" ? "t1" : null);
    c.set("tokenScopes", scopes);
    await next();
  });
  return app;
}

describe("API authorization policy", () => {
  it("blocks bearer tokens from session-only routes", async () => {
    const app = appFor("token", ["graph:read", "graph:write"]);
    app.get("/tokens", requireSession, (c) => c.json({ ok: true }));

    expect((await app.request("/tokens")).status).toBe(403);
  });

  it("allows browser sessions through session-only routes", async () => {
    const app = appFor("session", []);
    app.get("/tokens", requireSession, (c) => c.json({ ok: true }));

    expect((await app.request("/tokens")).status).toBe(200);
  });

  it("enforces token scopes while browser sessions retain graph access", async () => {
    const tokenApp = appFor("token", ["graph:read"]);
    tokenApp.post("/graphs", requireScope("graph:write"), (c) => c.json({ ok: true }));
    expect((await tokenApp.request("/graphs", { method: "POST" })).status).toBe(403);

    const sessionApp = appFor("session", []);
    sessionApp.post("/graphs", requireScope("graph:write"), (c) => c.json({ ok: true }));
    expect((await sessionApp.request("/graphs", { method: "POST" })).status).toBe(200);
  });
});
