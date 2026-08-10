/**
 * gqn — agent-friendly CLI for the graphnote Workers API.
 * JSON on stdout by default. Errors as {"error":"..."} with non-zero exit.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { credentialAudience, isAllowedCredentialTarget } from "../src/shared/credentialTarget.js";
import { placeChildPosition } from "../src/shared/placeChild.js";

type ConfigFile = {
  url?: string;
  token?: string;
  tokenUrl?: string;
};

type Config = {
  url: string;
  token: string;
  hasCredential: boolean;
  tokenBoundTo: string | null;
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

const PROD_URL = "https://graphnote.app";
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

function ensureConfigDir(): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return;
  }
  if (dir === PROD_CONFIG_DIR || dir === LOCAL_CONFIG_DIR) chmodSync(dir, 0o700);
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

function targetUrl(file: ConfigFile): string {
  return (runtime.urlOverride || process.env.GRAPHNOTE_URL || file.url || DEFAULT_URL).replace(
    /\/$/,
    "",
  );
}

function loadConfig(): Config {
  ensureConfigDir();
  const file = readConfigFile();
  const url = targetUrl(file);
  const envToken = process.env.GRAPHNOTE_TOKEN || "";
  const sourceToken = envToken || file.token || "";
  const tokenBoundTo = envToken
    ? process.env.GRAPHNOTE_TOKEN_URL || (process.env.GRAPHNOTE_URL ? null : DEFAULT_URL)
    : file.tokenUrl || file.url || DEFAULT_URL;
  const targetAudience = credentialAudience(url);
  const boundAudience = tokenBoundTo ? credentialAudience(tokenBoundTo) : null;
  return {
    url,
    token: sourceToken && targetAudience && targetAudience === boundAudience ? sourceToken : "",
    hasCredential: Boolean(sourceToken),
    tokenBoundTo: sourceToken ? tokenBoundTo : null,
  };
}

function saveConfig(patch: Partial<ConfigFile>): ConfigFile {
  ensureConfigDir();
  const file = readConfigFile();
  const next: ConfigFile = {
    url: (patch.url ?? file.url ?? DEFAULT_URL).replace(/\/$/, ""),
    token: patch.token ?? file.token ?? "",
    tokenUrl: patch.tokenUrl ?? file.tokenUrl,
  };
  writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(configPath(), 0o600);
  return next;
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

function requireForce(flags: Flags, operation: string): void {
  if (!flag(flags, "force")) {
    fail(`refusing to ${operation} without --force`);
  }
}

async function readSecret(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString("utf8").trim();
  }

  return new Promise<string>((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = input.isRaw;
    let value = "";
    process.stderr.write("API token: ");
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();

    const finish = () => {
      input.off("data", onData);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      process.stderr.write("\n");
    };
    const onData = (data: string | Buffer) => {
      for (const char of String(data)) {
        if (char === "\u0003") {
          finish();
          reject(new Error("cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value.trim());
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= " ") value += char;
      }
    };
    input.on("data", onData);
  });
}

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/** Flags that never take a value (so `gqn --prod graphs list` works). */
const BOOLEAN_FLAGS: Record<string, true> = {
  local: true,
  prod: true,
  production: true,
  cascade: true,
  force: true,
  help: true,
  h: true,
};

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
      if (!BOOLEAN_FLAGS[key] && next && !next.startsWith("-")) {
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
      if (!BOOLEAN_FLAGS[key] && next && !next.startsWith("-")) {
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

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { allowUnauthorized?: boolean } = {},
): Promise<T> {
  const { allowUnauthorized = false } = options;
  const { url, token, hasCredential, tokenBoundTo } = loadConfig();
  if (!isAllowedCredentialTarget(url)) {
    fail(`refusing credentials over an unsafe target: ${url}`);
  }
  if (hasCredential && !token) {
    fail(
      `refusing to send a credential bound to ${tokenBoundTo ?? "another origin"} to ${url}; ` +
        "set a separate token for this target",
    );
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });

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
      fail("unauthorized — create an API token in the web UI, then run: gqn config set-token", 2);
    }
    const errBody = data as ApiErrorBody | null;
    const message =
      (errBody && typeof errBody === "object" && errBody.error) ||
      `${res.status} ${res.statusText}`;
    fail(String(message), 1);
  }
  return data as T;
}

const HELP = `gqn — CLI for graphnote API

Target (default: production):
  --prod                 ${PROD_URL}
  --local                ${LOCAL_URL}
  --url <url>            arbitrary base URL
  GRAPHNOTE_URL          env override (below flags)
  GRAPHNOTE_TOKEN_URL    origin binding for GRAPHNOTE_TOKEN
  ~/.config/graphnote/   prod config + token
  ~/.config/graphnote-local/  used with --local

Auth (API token from web UI → API tokens):
  gqn config set-token         # hidden prompt; binds the key to the current target
  gqn whoami
  gqn logout                  # revokes the current token, then clears it locally

Config:
  gqn config show
  gqn config set-url <url>
  gqn config set-token

Graphs:
  gqn graphs list
  gqn graphs create <title>
  gqn graphs get <graphId>
  gqn graphs rename <graphId> <title>
  gqn graphs delete <graphId> --force
  gqn graphs export <graphId>
  gqn graphs import <file.json>
  gqn graphs fmt <graphId>

Nodes:
  gqn nodes create <graphId> [--title T] [--body B] [--x N] [--y N] [--parent <nodeId>]
  gqn nodes update <graphId> <nodeId> [--title T] [--body B] [--x N] [--y N]
  gqn nodes delete <graphId> <nodeId...> [--cascade] --force

Edges:
  gqn edges create <graphId> <sourceId> <targetId> [--label L]
  gqn edges delete <graphId> <edgeId> --force

Agent skills (gqn · gqn-teach · gqn-node-refactor):
  npx skills add sorafujitani/graphnote

Other:
  gqn cascade <graphId> <nodeId...> [--mode outgoing|both]
  gqn fmt <graphId>
  gqn health

Examples:
  gqn config set-token
  gqn graphs list
  gqn --local graphs list
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
      return api<GraphDetail>("POST", "/api/graphs", { title });
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
      if (!id) fail("usage: gqn graphs delete <graphId> --force");
      requireForce(flags, `delete graph ${id}`);
      return api<{ ok: boolean }>("DELETE", `/api/graphs/${id}`);
    }
    case "export": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs export <graphId>");
      return api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${id}/export`);
    }
    case "import": {
      const file = rest[0];
      if (!file) fail("usage: gqn graphs import <file.json>");
      if (!existsSync(file)) fail(`file not found: ${file}`);
      const payload = JSON.parse(readFileSync(file, "utf8")) as GraphExport;
      return api<GraphDetail>("POST", "/api/graphs/import", payload);
    }
    case "fmt":
    case "format": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs fmt <graphId>");
      return api<GraphDetail>("POST", `/api/graphs/${id}/fmt`);
    }
    default:
      fail("usage: gqn graphs <list|create|get|rename|delete|export|import|fmt>");
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
        const siblings = detail.nodes.filter((n: NodeRecord) =>
          detail.edges.some((e: EdgeRecord) => e.source_id === parent && e.target_id === n.id),
        );
        if (parentNode) {
          const pos = placeChildPosition(parentNode, siblings);
          input.x = pos.x;
          input.y = pos.y;
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
        fail("usage: gqn nodes delete <graphId> <nodeId...> [--cascade] --force");
      }
      requireForce(flags, `delete ${ids.length} node(s)`);
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
        fail("usage: gqn edges delete <graphId> <edgeId> --force");
      }
      requireForce(flags, `delete edge ${a}`);
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
          token: cfg.token ? "***" : "",
          configPath: configPath(),
          hasToken: cfg.hasCredential,
          tokenUsableForUrl: Boolean(cfg.token),
          tokenBoundTo: cfg.tokenBoundTo,
        });
        return;
      }
      if (sub === "set-url") {
        const url = cfgArgs[0];
        if (!url) fail("usage: gqn config set-url <url>");
        const saved = saveConfig({ url: url.replace(/\/$/, "") });
        print({ ok: true, url: saved.url });
        return;
      }
      if (sub === "set-token") {
        const tokenFlag = flag(restFlags, "token");
        const argumentToken = cfgArgs[0] || (typeof tokenFlag === "string" ? tokenFlag : "");
        if (argumentToken) {
          process.stderr.write(
            "warning: passing a token as an argument may expose it in shell history; " +
              "run `gqn config set-token` and paste it into the prompt instead\n",
          );
        }
        const token = argumentToken || (await readSecret());
        if (!token) fail("API token required");
        if (!token.startsWith("gqn_")) fail("invalid API token format");
        const boundUrl = targetUrl(readConfigFile());
        if (!isAllowedCredentialTarget(boundUrl)) {
          fail(`refusing to bind a token to an unsafe target: ${boundUrl}`);
        }
        saveConfig({ token, tokenUrl: boundUrl });
        print({ ok: true, boundTo: boundUrl });
        return;
      }
      fail("usage: gqn config <show|set-url|set-token>");
    }
    case "login": {
      fail("use Google sign-in in the web UI, create an API token, then run: gqn config set-token");
    }
    case "logout": {
      const cfg = loadConfig();
      let revoked = false;
      if (cfg.token) {
        if (!isAllowedCredentialTarget(cfg.url)) {
          fail(`refusing credentials over an unsafe target: ${cfg.url}`);
        }
        const res = await fetch(`${cfg.url}/api/token`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
          redirect: "manual",
        });
        if (!res.ok && res.status !== 401) {
          fail(`could not revoke token: ${res.status} ${res.statusText}`);
        }
        revoked = res.ok;
      } else if (cfg.hasCredential) {
        fail(
          `saved token is bound to ${cfg.tokenBoundTo ?? "another origin"}; ` +
            "select that target before logout",
        );
      }
      saveConfig({ token: "", tokenUrl: "" });
      print({ ok: true, revoked });
      return;
    }
    case "whoami": {
      const data = await api<{ authenticated: boolean; user?: unknown }>(
        "GET",
        "/api/me",
        undefined,
        {
          allowUnauthorized: true,
        },
      );
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
      print(await api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${id}/export`));
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
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
