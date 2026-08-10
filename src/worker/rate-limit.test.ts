import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { checkRateLimit } from "./rate-limit";

/** Runs the limiter's real SQL against a real SQLite database. */
function sqliteDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  )`);
  return {
    prepare(sql: string) {
      // D1 uses ?1-style ordinals, which node:sqlite also supports via
      // anonymous parameters in order.
      const statement = db.prepare(sql);
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              return statement.get(...(args as never[])) ?? null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function dbReturning(row: { count: number; window_start: number } | null): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return row;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("checkRateLimit", () => {
  it("allows requests up to the limit", async () => {
    const result = await checkRateLimit(
      dbReturning({ count: 5, window_start: Date.now() }),
      "k",
      5,
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects the request that exceeds the limit with a Retry-After", async () => {
    const result = await checkRateLimit(
      dbReturning({ count: 6, window_start: Date.now() }),
      "k",
      5,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(result.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it("honours a custom window for hourly limits", async () => {
    const result = await checkRateLimit(
      dbReturning({ count: 31, window_start: Date.now() }),
      "k",
      30,
      60 * 60 * 1000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSec).toBeGreaterThan(60);
    }
  });

  it("stays open if the row cannot be read", async () => {
    expect(await checkRateLimit(dbReturning(null), "k", 5)).toEqual({ ok: true });
  });
});

describe("checkRateLimit against real SQLite", () => {
  it("counts sequential requests and blocks past the limit", async () => {
    const db = sqliteDb();
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(db, "user", 3)).ok).toBe(true);
    }
    const fourth = await checkRateLimit(db, "user", 3);
    expect(fourth.ok).toBe(false);
  });

  it("resets the window after it expires", async () => {
    const db = sqliteDb();
    // Exhaust the window, then age the stored window_start past 60s.
    for (let i = 0; i < 2; i++) await checkRateLimit(db, "user", 1);
    expect((await checkRateLimit(db, "user", 1)).ok).toBe(false);
    const raw = (
      db as unknown as {
        prepare: (sql: string) => {
          bind: (...args: unknown[]) => { first: () => Promise<unknown> };
        };
      }
    ).prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET count = ?2, window_start = ?3
       RETURNING count`,
    );
    await raw.bind("user", 99, Date.now() - 61_000).first();
    expect((await checkRateLimit(db, "user", 1)).ok).toBe(true);
  });

  it("keeps separate keys independent", async () => {
    const db = sqliteDb();
    await checkRateLimit(db, "a", 1);
    expect((await checkRateLimit(db, "a", 1)).ok).toBe(false);
    expect((await checkRateLimit(db, "b", 1)).ok).toBe(true);
  });
});
