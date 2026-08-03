/**
 * graphnote — agent-friendly CLI for the graphnote Workers API.
 * JSON on stdout by default. Errors as {"error":"..."} with non-zero exit.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  CascadeResult,
  EdgeRecord,
  Graph,
  GraphDetail,
  GraphExport,
  NodeRecord,
} from "../src/shared/types.js";

type ConfigFile = {
  url?: string;
  password?: string;
};

type Config = {
  url: string;
  password: string;
};

type FlagValue = string | true;
type Flags = Record<string, FlagValue>;

type ApiErrorBody = {
  error?: string;
  raw?: string;
};

type CreateNodeInput = {
  title?: string;
  body?: string;
  x?: number;
  y?: number;
};

type UpdateNodeInput = Partial<Pick<NodeRecord, "title" | "body" | "x" | "y">>;

const CONFIG_DIR = process.env.GRAPHNOTE_CONFIG_DIR
  ? process.env.GRAPHNOTE_CONFIG_DIR
  : join(homedir(), ".config", "graphnote");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const COOKIE_PATH = join(CONFIG_DIR, "cookie");

const DEFAULT_URL = "https://graphnote.fujitanisora0414.workers.dev";

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function readConfigFile(): ConfigFile {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as ConfigFile;
  } catch {
    return {};
  }
}

function loadConfig(): Config {
  ensureConfigDir();
  const file = readConfigFile();
  return {
    url: (process.env.GRAPHNOTE_URL || file.url || DEFAULT_URL).replace(/\/$/, ""),
    password: process.env.GRAPHNOTE_PASSWORD || file.password || "",
  };
}

function saveConfig(patch: Partial<ConfigFile>): Config {
  ensureConfigDir();
  const file = readConfigFile();
  const next: Config = {
    url: (patch.url ?? file.url ?? DEFAULT_URL).replace(/\/$/, ""),
    password: patch.password ?? file.password ?? "",
  };
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

function loadCookie(): string {
  if (!existsSync(COOKIE_PATH)) return "";
  return readFileSync(COOKIE_PATH, "utf8").trim();
}

function saveCookie(value: string): void {
  ensureConfigDir();
  writeFileSync(COOKIE_PATH, `${value}\n`, { mode: 0o600 });
}

function clearCookie(): void {
  if (existsSync(COOKIE_PATH)) unlinkSync(COOKIE_PATH);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(code);
}

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv: string[]): { args: string[]; flags: Flags } {
  const args: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (token.startsWith("-") && token.length === 2) {
      const key = token.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    args.push(token);
  }
  return { args, flags };
}

function flag(flags: Flags, ...names: string[]): FlagValue | undefined {
  for (const name of names) {
    const value = flags[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

function extractSessionCookie(setCookieHeaders: string[] | string | null): string {
  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : setCookieHeaders
      ? [setCookieHeaders]
      : [];
  for (const header of headers) {
    const match = /(?:^|,\s*)gn_session=([^;]+)/.exec(header);
    if (match?.[1]) return match[1];
  }
  for (const header of headers) {
    if (header.startsWith("gn_session=")) {
      return header.slice("gn_session=".length).split(";")[0] ?? "";
    }
  }
  return "";
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { allowUnauthorized?: boolean } = {},
): Promise<T> {
  const { allowUnauthorized = false } = options;
  const { url } = loadConfig();
  const cookie = loadCookie();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = `gn_session=${cookie}`;

  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });

  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie");
  const next = extractSessionCookie(setCookie);
  if (next) saveCookie(next);

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { raw: text } satisfies ApiErrorBody;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !allowUnauthorized) {
      fail("unauthorized — run: graphnote login", 2);
    }
    const errBody = data as ApiErrorBody | null;
    const message =
      (errBody && typeof errBody === "object" && errBody.error) ||
      `${res.status} ${res.statusText}`;
    fail(String(message), 1);
  }
  return data as T;
}

async function ensureLogin(explicitPassword?: string): Promise<{ ok: true; url: string }> {
  const cfg = loadConfig();
  const password = explicitPassword || cfg.password;
  if (!password) {
    fail(
      "password required — set GRAPHNOTE_PASSWORD, run graphnote config set-password, or graphnote login --password ...",
    );
  }
  await api<{ ok: boolean }>("POST", "/api/auth/login", { password }, { allowUnauthorized: true });
  return { ok: true, url: cfg.url };
}

const HELP = `graphnote — CLI for graphnote API

Config:
  GRAPHNOTE_URL          Base URL (default: production workers.dev)
  GRAPHNOTE_PASSWORD     Shared password
  ~/.config/graphnote/   config.json + cookie

Auth:
  graphnote login [--password <pw>]
  graphnote logout
  graphnote whoami

Config:
  graphnote config show
  graphnote config set-url <url>
  graphnote config set-password <pw>

Graphs:
  graphnote graphs list
  graphnote graphs create <title>
  graphnote graphs get <graphId>
  graphnote graphs rename <graphId> <title>
  graphnote graphs delete <graphId>
  graphnote graphs export <graphId>

Nodes:
  graphnote nodes create <graphId> [--title T] [--body B] [--x N] [--y N] [--parent <nodeId>]
  graphnote nodes update <graphId> <nodeId> [--title T] [--body B] [--x N] [--y N]
  graphnote nodes delete <graphId> <nodeId...> [--cascade]

Edges:
  graphnote edges create <graphId> <sourceId> <targetId> [--label L]
  graphnote edges delete <graphId> <edgeId>

Other:
  graphnote cascade <graphId> <nodeId...> [--mode outgoing|both]
  graphnote health
`;

async function cmdGraphs(args: string[], flags: Flags): Promise<unknown> {
  const [action, ...rest] = args;
  switch (action) {
    case "list":
    case "ls":
      return api<{ graphs: Graph[] }>("GET", "/api/graphs");
    case "create":
    case "new": {
      const titled = flag(flags, "title", "t");
      const title =
        rest.join(" ").trim() ||
        (typeof titled === "string" ? titled : undefined) ||
        "Untitled note";
      return api<{ graph: Graph }>("POST", "/api/graphs", { title });
    }
    case "get":
    case "show": {
      const idFlag = flag(flags, "id");
      const id = rest[0] || (typeof idFlag === "string" ? idFlag : undefined);
      if (!id) fail("usage: graphnote graphs get <graphId>");
      return api<GraphDetail>("GET", `/api/graphs/${id}`);
    }
    case "rename": {
      const id = rest[0];
      const title = rest.slice(1).join(" ").trim();
      if (!id || !title) {
        fail("usage: graphnote graphs rename <graphId> <title>");
      }
      return api<{ graph: Graph }>("PATCH", `/api/graphs/${id}`, { title });
    }
    case "delete":
    case "rm": {
      const id = rest[0];
      if (!id) fail("usage: graphnote graphs delete <graphId>");
      return api<{ ok: boolean }>("DELETE", `/api/graphs/${id}`);
    }
    case "export": {
      const id = rest[0];
      if (!id) fail("usage: graphnote graphs export <graphId>");
      return api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${id}/export`);
    }
    default:
      fail("usage: graphnote graphs <list|create|get|rename|delete|export>");
  }
}

async function cmdNodes(args: string[], flags: Flags): Promise<unknown> {
  const [action, graphId, ...rest] = args;
  if (!action) fail("usage: graphnote nodes <create|update|delete>");
  if (!graphId) fail(`usage: graphnote nodes ${action} <graphId> ...`);

  switch (action) {
    case "create":
    case "add": {
      const title = flag(flags, "title", "t");
      const body = flag(flags, "body", "b");
      const x = flag(flags, "x");
      const y = flag(flags, "y");
      const parent = flag(flags, "parent", "p");
      const input: CreateNodeInput = {};
      if (typeof title === "string") input.title = title;
      if (typeof body === "string") input.body = body;
      if (typeof x === "string") input.x = Number(x);
      if (typeof y === "string") input.y = Number(y);

      if (typeof parent === "string" && input.x === undefined && input.y === undefined) {
        const detail = await api<GraphDetail>("GET", `/api/graphs/${graphId}`);
        const parentNode = detail.nodes.find((n: NodeRecord) => n.id === parent);
        const siblingCount = detail.edges.filter((e: EdgeRecord) => e.source_id === parent).length;
        if (parentNode) {
          input.x = parentNode.x + 280;
          input.y = parentNode.y + siblingCount * 150;
        }
      }

      const created = await api<{ node: NodeRecord }>(
        "POST",
        `/api/graphs/${graphId}/nodes`,
        input,
      );

      if (typeof parent === "string") {
        const linked = await api<{ edge: EdgeRecord }>("POST", `/api/graphs/${graphId}/edges`, {
          source_id: parent,
          target_id: created.node.id,
        });
        return { node: created.node, edge: linked.edge };
      }
      return created;
    }
    case "update":
    case "patch": {
      const nodeId = rest[0];
      if (!nodeId) {
        fail("usage: graphnote nodes update <graphId> <nodeId> [--title|--body|--x|--y]");
      }
      const patch: UpdateNodeInput = {};
      const title = flag(flags, "title", "t");
      const body = flag(flags, "body", "b");
      const x = flag(flags, "x");
      const y = flag(flags, "y");
      if (typeof title === "string") patch.title = title;
      if (typeof body === "string") patch.body = body;
      if (typeof x === "string") patch.x = Number(x);
      if (typeof y === "string") patch.y = Number(y);
      if (Object.keys(patch).length === 0) fail("no fields to update");
      return api<{ node: NodeRecord }>("PATCH", `/api/graphs/${graphId}/nodes/${nodeId}`, patch);
    }
    case "delete":
    case "rm": {
      const ids = rest;
      if (!ids.length) {
        fail("usage: graphnote nodes delete <graphId> <nodeId...> [--cascade]");
      }
      const cascade = Boolean(flag(flags, "cascade"));
      return api<{ deletedNodeIds: string[]; deletedEdgeIds: string[] }>(
        "POST",
        `/api/graphs/${graphId}/nodes/delete`,
        { ids, cascade },
      );
    }
    default:
      fail("usage: graphnote nodes <create|update|delete>");
  }
}

async function cmdEdges(args: string[], flags: Flags): Promise<unknown> {
  const [action, graphId, a, b] = args;
  switch (action) {
    case "create":
    case "add": {
      if (!graphId || !a || !b) {
        fail("usage: graphnote edges create <graphId> <sourceId> <targetId> [--label L]");
      }
      const label = flag(flags, "label", "l");
      const body: { source_id: string; target_id: string; label?: string } = {
        source_id: a,
        target_id: b,
      };
      if (typeof label === "string") body.label = label;
      return api<{ edge: EdgeRecord }>("POST", `/api/graphs/${graphId}/edges`, body);
    }
    case "delete":
    case "rm": {
      if (!graphId || !a) {
        fail("usage: graphnote edges delete <graphId> <edgeId>");
      }
      return api<{ ok: boolean }>("DELETE", `/api/graphs/${graphId}/edges/${a}`);
    }
    default:
      fail("usage: graphnote edges <create|delete>");
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
    process.stdout.write(HELP);
    return;
  }

  const [command, ...rest] = argv;
  const { args, flags } = parseArgs(rest);

  try {
    switch (command) {
      case "health": {
        const { url } = loadConfig();
        const res = await fetch(`${url}/api/health`);
        const data = (await res.json()) as Record<string, unknown>;
        print({ url, ...data, status: res.status });
        return;
      }
      case "config": {
        const [sub, ...cfgArgs] = args;
        if (sub === "show" || !sub) {
          const cfg = loadConfig();
          print({
            url: cfg.url,
            password: cfg.password ? "***" : "",
            configPath: CONFIG_PATH,
            cookiePath: COOKIE_PATH,
            hasCookie: Boolean(loadCookie()),
          });
          return;
        }
        if (sub === "set-url") {
          const urlFlag = flag(flags, "url");
          const url = cfgArgs[0] || (typeof urlFlag === "string" ? urlFlag : "");
          if (!url) fail("usage: graphnote config set-url <url>");
          const saved = saveConfig({ url: url.replace(/\/$/, "") });
          print({ ok: true, url: saved.url });
          return;
        }
        if (sub === "set-password") {
          const pwFlag = flag(flags, "password");
          const password = cfgArgs[0] || (typeof pwFlag === "string" ? pwFlag : "");
          if (!password) {
            fail("usage: graphnote config set-password <password>");
          }
          saveConfig({ password });
          print({ ok: true });
          return;
        }
        fail("usage: graphnote config <show|set-url|set-password>");
      }
      case "login": {
        const password = flag(flags, "password", "p") || args[0];
        print(await ensureLogin(typeof password === "string" ? password : undefined));
        return;
      }
      case "logout": {
        try {
          await api("POST", "/api/auth/logout", undefined, { allowUnauthorized: true });
        } catch {
          /* ignore */
        }
        clearCookie();
        print({ ok: true });
        return;
      }
      case "whoami": {
        const data = await api<{ authenticated: boolean }>("GET", "/api/auth/me", undefined, {
          allowUnauthorized: true,
        });
        print({ ...data, url: loadConfig().url });
        return;
      }
      case "graphs":
      case "graph":
      case "notes":
        print(await cmdGraphs(args, flags));
        return;
      case "nodes":
      case "node":
        print(await cmdNodes(args, flags));
        return;
      case "edges":
      case "edge":
        print(await cmdEdges(args, flags));
        return;
      case "cascade": {
        const [graphId, ...nodeIds] = args;
        if (!graphId || nodeIds.length === 0) {
          fail("usage: graphnote cascade <graphId> <nodeId...> [--mode outgoing|both]");
        }
        const modeFlag = flag(flags, "mode");
        const mode = typeof modeFlag === "string" ? modeFlag : "outgoing";
        print(
          await api<CascadeResult>("POST", `/api/graphs/${graphId}/cascade-select`, {
            nodeIds,
            mode,
          }),
        );
        return;
      }
      case "export": {
        const id = args[0];
        if (!id) fail("usage: graphnote export <graphId>");
        print(
          await api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${id}/export`),
        );
        return;
      }
      default:
        fail(`unknown command: ${command}\n\n${HELP}`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

await main();
