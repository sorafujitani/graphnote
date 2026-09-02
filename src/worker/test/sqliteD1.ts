import { DatabaseSync } from "node:sqlite";
import m1 from "../../../migrations/0001_init.sql?raw";
import m2 from "../../../migrations/0002_users_ownership.sql?raw";
import m3 from "../../../migrations/0003_api_token_security.sql?raw";
import m4 from "../../../migrations/0004_node_dimensions.sql?raw";
import m5 from "../../../migrations/0005_soft_delete.sql?raw";

/**
 * A D1 stand-in backed by real SQLite with the real migrations applied, so a
 * test exercises the worker's actual SQL instead of a substring mock.
 */
export function migratedD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of [m1, m2, m3, m4, m5]) db.exec(migration);

  const bound = (sql: string, args: unknown[]) => ({
    sql,
    args,
    // D1 rejects statements with more than 100 bound parameters.
    ...(args.length > 100
      ? (() => {
          throw new Error(`too many SQL variables: ${args.length}`);
        })()
      : {}),
    async first() {
      return (db.prepare(sql).get(...(args as never[])) as unknown) ?? null;
    },
    async all() {
      return { results: db.prepare(sql).all(...(args as never[])) };
    },
    async run() {
      const result = db.prepare(sql).run(...(args as never[]));
      return { meta: { changes: Number(result.changes) } };
    },
  });

  return {
    prepare(sql: string) {
      const statement = bound(sql, []);
      return { ...statement, bind: (...args: unknown[]) => bound(sql, args) };
    },
    async batch(statements: Array<ReturnType<typeof bound>>) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const statement of statements) {
          // RETURNING rows only come back through all(); run() would drop them.
          if (/RETURNING/i.test(statement.sql)) out.push(await statement.all());
          else {
            await statement.run();
            out.push({ results: [] });
          }
        }
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  } as unknown as D1Database;
}
