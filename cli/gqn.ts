/**
 * gqn — agent-friendly CLI for the graphnote Workers API.
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

const PROD_URL = "https://graphnote.fujitanisora0414.workers.dev";
const LOCAL_URL = "http://127.0.0.1:5173";
const PROD_CONFIG_DIR = join(homedir(), ".config", "graphnote");
const LOCAL_CONFIG_DIR = join(homedir(), ".config", "graphnote-local");
/** Default target is production. */
const DEFAULT_URL = PROD_URL;

const runtime = {
  /** Set by --local / --prod / --url (wins over env + config file). */
  urlOverride: undefined as string | undefined,
  /** Set by --local / --prod so cookies don't cross environments. */
  configDirOverride: undefined as string | undefined,
};

function configDir(): string {
  return runtime.configDirOverride || process.env.GRAPHNOTE_CONFIG_DIR || PROD_CONFIG_DIR;
}

function configPath(): string {
  return join(configDir(), "config.json");
}

function cookiePath(): string {
  return join(configDir(), "cookie");
}

function ensureConfigDir(): void {
  mkdirSync(configDir(), { recursive: true });
}

function readConfigFile(): ConfigFile {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch {
    return {};
  }
}

function loadConfig(): Config {
  ensureConfigDir();
  const file = readConfigFile();
  return {
    url: (runtime.urlOverride || process.env.GRAPHNOTE_URL || file.url || DEFAULT_URL).replace(
      /\/$/,
      "",
    ),
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
  writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

function loadCookie(): string {
  const path = cookiePath();
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").trim();
}

function saveCookie(value: string): void {
  ensureConfigDir();
  writeFileSync(cookiePath(), `${value}\n`, { mode: 0o600 });
}

function clearCookie(): void {
  const path = cookiePath();
  if (existsSync(path)) unlinkSync(path);
}

/** Apply global --local / --prod / --url. Flags win over env and config. */
function applyTargetFlags(flags: Flags): void {
  const local = Boolean(flag(flags, "local"));
  const prod = Boolean(flag(flags, "prod", "production"));
  if (local && prod) fail("use only one of --local / --prod");
  if (local) {
    runtime.urlOverride = LOCAL_URL;
    runtime.configDirOverride = LOCAL_CONFIG_DIR;
  } else if (prod) {
    runtime.urlOverride = PROD_URL;
    runtime.configDirOverride = PROD_CONFIG_DIR;
  }
  const urlFlag = flag(flags, "url");
  if (typeof urlFlag === "string" && urlFlag) {
    runtime.urlOverride = urlFlag.replace(/\/$/, "");
  }
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(code);
}

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/** Flags that never take a value (so `gqn --prod graphs list` works). */
const BOOLEAN_FLAGS = new Set(["local", "prod", "production", "cascade", "help", "h"]);

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
      if (!BOOLEAN_FLAGS.has(key) && next && !next.startsWith("-")) {
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
      if (!BOOLEAN_FLAGS.has(key) && next && !next.startsWith("-")) {
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
      fail("unauthorized — run: gqn login", 2);
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
      "password required — set GRAPHNOTE_PASSWORD, run gqn config set-password, or gqn login --password ...",
    );
  }
  await api<{ ok: boolean }>("POST", "/api/auth/login", { password }, { allowUnauthorized: true });
  return { ok: true, url: cfg.url };
}

const HELP = `gqn — CLI for graphnote API

Target (default: production):
  --prod                 ${PROD_URL}
  --local                ${LOCAL_URL}
  --url <url>            arbitrary base URL
  GRAPHNOTE_URL          env override (below flags)
  ~/.config/graphnote/   prod config + cookie
  ~/.config/graphnote-local/  used with --local

Auth:
  gqn login [--password <pw>]
  gqn logout
  gqn whoami

Config:
  gqn config show
  gqn config set-url <url>
  gqn config set-password <pw>

Graphs:
  gqn graphs list
  gqn graphs create <title>
  gqn graphs get <graphId>
  gqn graphs rename <graphId> <title>
  gqn graphs delete <graphId>
  gqn graphs export <graphId>
  gqn graphs fmt <graphId>

Nodes:
  gqn nodes create <graphId> [--title T] [--body B] [--x N] [--y N] [--parent <nodeId>]
  gqn nodes update <graphId> <nodeId> [--title T] [--body B] [--x N] [--y N]
  gqn nodes delete <graphId> <nodeId...> [--cascade]

Edges:
  gqn edges create <graphId> <sourceId> <targetId> [--label L]
  gqn edges delete <graphId> <edgeId>

Other:
  gqn cascade <graphId> <nodeId...> [--mode outgoing|both]
  gqn fmt <graphId>
  gqn health

Examples:
  gqn graphs list
  gqn --local graphs list
  gqn --prod login
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
      if (!id) fail("usage: gqn graphs get <graphId>");
      return api<GraphDetail>("GET", `/api/graphs/${id}`);
    }
    case "rename": {
      const id = rest[0];
      const title = rest.slice(1).join(" ").trim();
      if (!id || !title) {
        fail("usage: gqn graphs rename <graphId> <title>");
      }
      return api<{ graph: Graph }>("PATCH", `/api/graphs/${id}`, { title });
    }
    case "delete":
    case "rm": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs delete <graphId>");
      return api<{ ok: boolean }>("DELETE", `/api/graphs/${id}`);
    }
    case "export": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs export <graphId>");
      return api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${id}/export`);
    }
    case "fmt":
    case "format": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs fmt <graphId>");
      return api<GraphDetail>("POST", `/api/graphs/${id}/fmt`);
    }
    default:
      fail("usage: gqn graphs <list|create|get|rename|delete|export|fmt>");
  }
}

async function cmdNodes(args: string[], flags: Flags): Promise<unknown> {
  const [action, graphId, ...rest] = args;
  if (!action) fail("usage: gqn nodes <create|update|delete>");
  if (!graphId) fail(`usage: gqn nodes ${action} <graphId> ...`);

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
        fail("usage: gqn nodes update <graphId> <nodeId> [--title|--body|--x|--y]");
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
        fail("usage: gqn nodes delete <graphId> <nodeId...> [--cascade]");
      }
      const cascade = Boolean(flag(flags, "cascade"));
      return api<{ deletedNodeIds: string[]; deletedEdgeIds: string[] }>(
        "POST",
        `/api/graphs/${graphId}/nodes/delete`,
        { ids, cascade },
      );
    }
    default:
      fail("usage: gqn nodes <create|update|delete>");
  }
}

async function cmdEdges(args: string[], flags: Flags): Promise<unknown> {
  const [action, graphId, a, b] = args;
  switch (action) {
    case "create":
    case "add": {
      if (!graphId || !a || !b) {
        fail("usage: gqn edges create <graphId> <sourceId> <targetId> [--label L]");
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
        fail("usage: gqn edges delete <graphId> <edgeId>");
      }
      return api<{ ok: boolean }>("DELETE", `/api/graphs/${graphId}/edges/${a}`);
    }
    default:
      fail("usage: gqn edges <create|delete>");
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
    process.stdout.write(HELP);
    return;
  }

  // Global flags may appear before or after the command: `gqn --local graphs list`
  const { args, flags } = parseArgs(argv);
  applyTargetFlags(flags);
  const [command, ...cmdArgs] = args;
  if (!command) {
    process.stdout.write(HELP);
    return;
  }
  const restFlags = flags;

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
        const [sub, ...cfgArgs] = cmdArgs;
        if (sub === "show" || !sub) {
          const cfg = loadConfig();
          print({
            url: cfg.url,
            password: cfg.password ? "***" : "",
            configPath: configPath(),
            cookiePath: cookiePath(),
            hasCookie: Boolean(loadCookie()),
          });
          return;
        }
        if (sub === "set-url") {
          // Prefer positional arg; global --url is the target override, not set-url value.
          const url = cfgArgs[0];
          if (!url) fail("usage: gqn config set-url <url>");
          const saved = saveConfig({ url: url.replace(/\/$/, "") });
          print({ ok: true, url: saved.url });
          return;
        }
        if (sub === "set-password") {
          const pwFlag = flag(restFlags, "password");
          const password = cfgArgs[0] || (typeof pwFlag === "string" ? pwFlag : "");
          if (!password) {
            fail("usage: gqn config set-password <password>");
          }
          saveConfig({ password });
          print({ ok: true });
          return;
        }
        fail("usage: gqn config <show|set-url|set-password>");
      }
      case "login": {
        const password = flag(restFlags, "password", "p") || cmdArgs[0];
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
        print(await cmdGraphs(cmdArgs, restFlags));
        return;
      case "nodes":
      case "node":
        print(await cmdNodes(cmdArgs, restFlags));
        return;
      case "edges":
      case "edge":
        print(await cmdEdges(cmdArgs, restFlags));
        return;
      case "cascade": {
        const [graphId, ...nodeIds] = cmdArgs;
        if (!graphId || nodeIds.length === 0) {
          fail("usage: gqn cascade <graphId> <nodeId...> [--mode outgoing|both]");
        }
        const modeFlag = flag(restFlags, "mode");
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
        const id = cmdArgs[0];
        if (!id) fail("usage: gqn export <graphId>");
        print(
          await api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${id}/export`),
        );
        return;
      }
      case "fmt":
      case "format": {
        const id = cmdArgs[0];
        if (!id) fail("usage: gqn fmt <graphId>");
        print(await api<GraphDetail>("POST", `/api/graphs/${id}/fmt`));
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
