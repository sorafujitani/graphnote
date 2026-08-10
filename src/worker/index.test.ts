import { describe, expect, it } from "vite-plus/test";
import { app } from "./index";

function envFor(scopes: string): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first<T>() {
              if (sql.includes("FROM api_tokens WHERE token_hash")) {
                return {
                  id: "t1",
                  user_id: "u1",
                  scopes,
                  expires_at: "2099-01-01T00:00:00.000Z",
                } as T;
              }
              if (sql.includes("FROM rate_limits")) return null;
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { DB: db } as Env;
}

const bearer = { Authorization: `Bearer gqn_${"a".repeat(64)}` };

describe("worker API token boundaries", () => {
  it("rejects bearer access to token administration", async () => {
    const response = await app.request(
      "http://localhost/api/tokens",
      { headers: bearer },
      envFor("graph:read graph:write graph:export"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "browser session required" });
  });

  it("rejects bearer access to account deletion", async () => {
    const response = await app.request(
      "http://localhost/api/account",
      {
        method: "DELETE",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
      },
      envFor("graph:read graph:write graph:export"),
    );

    expect(response.status).toBe(403);
  });

  it("rejects graph writes from a read-only token", async () => {
    const response = await app.request(
      "http://localhost/api/graphs",
      {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "blocked" }),
      },
      envFor("graph:read"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "token scope required: graph:write",
    });
  });
});
