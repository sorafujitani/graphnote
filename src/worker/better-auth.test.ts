import { describe, expect, it } from "vite-plus/test";
import { createAuth } from "./better-auth";
import type { Bindings } from "./env";

const statement = {
  bind: () => statement,
  first: async () => null,
  all: async () => ({ results: [] }),
  run: async () => ({}),
  raw: async () => [],
};

const env = {
  DB: {
    prepare: () => statement,
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database,
  BETTER_AUTH_URL: "https://graphnote.app",
  BETTER_AUTH_SECRET: "test-secret",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
} as unknown as Bindings;

describe("OAuth state handling", () => {
  it("keeps the state cookie alive as long as the stored state", async () => {
    const ctx = await createAuth(env).$context;

    // Better Auth asks for a 300s state cookie at the call site while storing the
    // state row for 600s, so the config has to win: a slow Google screen otherwise
    // returns with a valid state, no cookie, and state_mismatch.
    expect(ctx.createAuthCookie("state", { maxAge: 300 }).attributes.maxAge).toBe(600);

    const attributes = ctx.createAuthCookie("state").attributes;
    expect(attributes.sameSite).toBe("lax");
    expect(attributes.secure).toBe(true);
    expect(attributes.httpOnly).toBe(true);
    expect(attributes.path).toBe("/");
  });

  it("sends failed sign-ins back to the app instead of the built-in error page", async () => {
    const response = await createAuth(env).handler(
      new Request("https://graphnote.app/api/auth/error?error=state_mismatch"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/?error=state_mismatch");
  });
});
