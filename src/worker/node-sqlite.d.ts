/**
 * Minimal declaration for `node:sqlite`, used only by tests that run the
 * worker's real SQL. The worker tsconfig deliberately excludes @types/node so
 * Node globals cannot leak into Workers runtime code.
 */
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
      run(...params: unknown[]): { changes: number | bigint };
    };
  }
}
