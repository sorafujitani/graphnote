/**
 * gqn — agent-friendly CLI for the graphnote Workers API.
 * JSON on stdout by default. Errors as {"error":"..."} with non-zero exit.
 * Exit codes: 1 generic, 2 unauthorized, 3 forbidden, 4 not found, 5 rate limited.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
import { flag, numericFlag, parseArgs, type Flags } from "./args.js";

export const VERSION = "0.2.0";

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
  tokenSource: "env" | "file" | null;
};

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

type UpdateNodeInput = Partial<Pick<NodeRecord, "title" | "body" | "x" | "y" | "width" | "height">>;

const PROD_URL = "https://graphnote.app";
const LOCAL_URL = "http://127.0.0.1:5173";
const PROD_CONFIG_DIR = join(homedir(), ".config", "graphnote");
const LOCAL_CONFIG_DIR = join(homedir(), ".config", "graphnote-local");
/** Default target is production. */
const DEFAULT_URL = PROD_URL;

const runtime = {
  /** Set by --local / --prod / --url (wins over env + config file). */
  urlOverride: undefined as string | undefined,
  /** Derived from the target so tokens never cross environments. */
  configDirOverride: undefined as string | undefined,
};

/** Every audience gets its own config dir; --url must never clobber prod's token. */
function configDirForUrl(url: string): string {
  const audience = credentialAudience(url);
  if (!audience) return PROD_CONFIG_DIR;
  if (audience === credentialAudience(PROD_URL)) return PROD_CONFIG_DIR;
  if (audience === credentialAudience(LOCAL_URL)) return LOCAL_CONFIG_DIR;
  const slug = audience
    .replace(/^origin:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "_");
  return join(homedir(), ".config", `graphnote-${slug}`);
}

function configDir(): string {
  if (runtime.configDirOverride) return runtime.configDirOverride;
  if (process.env.GRAPHNOTE_CONFIG_DIR) return process.env.GRAPHNOTE_CONFIG_DIR;
  // GRAPHNOTE_URL must isolate its config the same way --url does, or an env
  // targeted at staging silently overwrites the prod token file.
  const envUrl = process.env.GRAPHNOTE_URL;
  if (envUrl && isValidHttpUrl(envUrl)) return configDirForUrl(envUrl.replace(/\/$/, ""));
  return PROD_CONFIG_DIR;
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
  if (!process.env.GRAPHNOTE_CONFIG_DIR) chmodSync(dir, 0o700);
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
    tokenSource: envToken ? "env" : file.token ? "file" : null,
  };
}

function saveConfig(patch: Partial<ConfigFile>): ConfigFile {
  ensureConfigDir();
  const file = readConfigFile();
  const next: ConfigFile = {
    // Default to the active target, not prod: a --local config must not
    // come out of the box pointing at production.
    url: (patch.url ?? file.url ?? targetUrl(file)).replace(/\/$/, ""),
    token: patch.token ?? file.token ?? "",
    tokenUrl: patch.tokenUrl ?? file.tokenUrl,
  };
  // Write-then-rename so an interrupted write cannot truncate the token.
  const path = configPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
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
  if (urlFlag === true || urlFlag === "") fail("--url requires a value");
  if (typeof urlFlag === "string" && urlFlag) {
    if (!isValidHttpUrl(urlFlag)) fail(`--url is not a valid http(s) URL: ${urlFlag}`);
    runtime.urlOverride = urlFlag.replace(/\/$/, "");
    runtime.configDirOverride = configDirForUrl(runtime.urlOverride);
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(code);
}

function exitCodeFor(status: number): number {
  if (status === 401) return 2;
  if (status === 403) return 3;
  if (status === 404) return 4;
  if (status === 429) return 5;
  return 1;
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

/** URL-encodes an id: `a/b` or `x#y` must not silently address another record. */
function enc(id: string): string {
  return encodeURIComponent(id);
}

class CliApiError extends Error {
  status: number;
  retryAfterSec: number | null;
  constructor(status: number, message: string, retryAfterSec: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { throwOnError?: boolean } = {},
): Promise<T> {
  const { url, token, hasCredential, tokenBoundTo, tokenSource } = loadConfig();
  if (!isAllowedCredentialTarget(url)) {
    fail(`refusing credentials over an unsafe target: ${url}`);
  }
  if (hasCredential && !token) {
    const envHint =
      tokenSource === "env"
        ? " (GRAPHNOTE_TOKEN is set: also set GRAPHNOTE_TOKEN_URL to the origin the token belongs to)"
        : "";
    fail(
      `refusing to send a credential bound to ${tokenBoundTo ?? "another origin"} to ${url}; ` +
        `set a separate token for this target${envHint}`,
    );
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause;
    const detail = cause?.code || (err instanceof Error ? err.message : String(err));
    // throwOnError callers clean up partial state (e.g. delete the node that
    // was created before the network died) — they need the throw, not exit.
    if (options.throwOnError) throw new CliApiError(0, `could not reach ${url}: ${detail}`);
    fail(`could not reach ${url}: ${detail}`);
  }

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
    const retryAfterRaw = res.headers.get("Retry-After");
    const retryAfter = retryAfterRaw === null ? Number.NaN : Number(retryAfterRaw);
    const retryAfterSec = Number.isFinite(retryAfter) ? retryAfter : null;
    const errBody = data as ApiErrorBody | null;
    let message = String(
      (errBody && typeof errBody === "object" && errBody.error) ||
        `${res.status} ${res.statusText}`,
    );
    if (res.status === 401) {
      message = "unauthorized — create an API token in the web UI, then run: gqn config set-token";
    }
    if (res.status === 429 && retryAfterSec !== null) {
      message = `rate limited — retry after ${retryAfterSec}s`;
    }
    if (options.throwOnError) throw new CliApiError(res.status, message, retryAfterSec);
    fail(message, exitCodeFor(res.status));
  }
  return data as T;
}

const HELP = `gqn — CLI for graphnote API (v${VERSION})

Target (default: production):
  --prod                 ${PROD_URL}
  --local                ${LOCAL_URL}
  --url <url>            arbitrary base URL (tokens are stored per origin)
  GRAPHNOTE_URL          env override (below flags)
  GRAPHNOTE_TOKEN_URL    origin binding for GRAPHNOTE_TOKEN
  ~/.config/graphnote/   prod config + token
  ~/.config/graphnote-local/  used with --local

Auth (API token from web UI → API tokens):
  gqn config set-token         # hidden prompt; binds the key to the current target
  gqn whoami                   # includes token scopes
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
  gqn graphs exports <graphId> [name]   # list / fetch server-side backups
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
  gqn quota
  gqn health
  gqn --version

Exit codes: 1 error, 2 unauthorized, 3 forbidden, 4 not found, 5 rate limited

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
      return api<GraphDetail>("GET", `/api/graphs/${enc(id)}`);
    }
    case "rename": {
      const id = rest[0];
      const title = rest.slice(1).join(" ").trim();
      if (!id || !title) {
        fail("usage: gqn graphs rename <graphId> <title>");
      }
      return api<{ graph: Graph }>("PATCH", `/api/graphs/${enc(id)}`, { title });
    }
    case "delete":
    case "rm": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs delete <graphId> --force");
      requireForce(flags, `delete graph ${id}`);
      return api<{ ok: boolean }>("DELETE", `/api/graphs/${enc(id)}`);
    }
    case "export": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs export <graphId>");
      return api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${enc(id)}/export`);
    }
    case "exports": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs exports <graphId> [name]");
      const name = rest[1];
      if (name) {
        return api<GraphExport>("GET", `/api/graphs/${enc(id)}/exports/${enc(name)}`);
      }
      return api<{ exports: unknown[] }>("GET", `/api/graphs/${enc(id)}/exports`);
    }
    case "import": {
      const file = rest[0];
      if (!file) fail("usage: gqn graphs import <file.json>");
      if (!existsSync(file)) fail(`file not found: ${file}`);
      let payload: GraphExport;
      try {
        payload = JSON.parse(readFileSync(file, "utf8")) as GraphExport;
      } catch {
        fail(`not valid JSON: ${file}`);
      }
      return api<GraphDetail>("POST", "/api/graphs/import", payload);
    }
    case "fmt":
    case "format": {
      const id = rest[0];
      if (!id) fail("usage: gqn graphs fmt <graphId>");
      return api<GraphDetail>("POST", `/api/graphs/${enc(id)}/fmt`);
    }
    default:
      fail("usage: gqn graphs <list|create|get|rename|delete|export|exports|import|fmt>");
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
      const x = numericFlag(flags, "x");
      const y = numericFlag(flags, "y");
      if (x.error) fail(x.error);
      if (y.error) fail(y.error);
      const parent = flag(flags, "parent", "p");
      const input: CreateNodeInput = {};
      if (typeof title === "string") input.title = title;
      if (typeof body === "string") input.body = body;
      if (x.value !== undefined) input.x = x.value;
      if (y.value !== undefined) input.y = y.value;

      if (typeof parent === "string") {
        // Verify the parent BEFORE creating the node: failing on the edge
        // call afterwards is an avoidable orphan.
        const detail = await api<GraphDetail>("GET", `/api/graphs/${enc(graphId)}`);
        const parentNode = (detail.nodes ?? []).find((n: NodeRecord) => n.id === parent);
        if (!parentNode) fail(`parent node not found: ${parent}`, 4);
        if (input.x === undefined && input.y === undefined) {
          const siblings = (detail.nodes ?? []).filter((n: NodeRecord) =>
            (detail.edges ?? []).some(
              (e: EdgeRecord) => e.source_id === parent && e.target_id === n.id,
            ),
          );
          const pos = placeChildPosition(parentNode, siblings);
          input.x = pos.x;
          input.y = pos.y;
        }
      }

      const created = await api<{ node: NodeRecord }>(
        "POST",
        `/api/graphs/${enc(graphId)}/nodes`,
        input,
      );

      if (typeof parent === "string") {
        try {
          const linked = await api<{ edge: EdgeRecord }>(
            "POST",
            `/api/graphs/${enc(graphId)}/edges`,
            { source_id: parent, target_id: created.node.id },
            { throwOnError: true },
          );
          return { node: created.node, edge: linked.edge };
        } catch (err) {
          // Never leave an orphan silently: clean it up, and always disclose
          // the created node id so an agent can recover either way.
          const message = err instanceof Error ? err.message : String(err);
          let cleanedUp = false;
          try {
            await api(
              "POST",
              `/api/graphs/${enc(graphId)}/nodes/delete`,
              { ids: [created.node.id] },
              { throwOnError: true },
            );
            cleanedUp = true;
          } catch {
            /* reported below */
          }
          process.stderr.write(`could not link to parent: ${message}\n`);
          print({
            error: `could not link to parent: ${message}`,
            nodeId: created.node.id,
            cleanedUp,
          });
          process.exit(err instanceof CliApiError ? exitCodeFor(err.status) : 1);
        }
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
      const x = numericFlag(flags, "x");
      const y = numericFlag(flags, "y");
      if (x.error) fail(x.error);
      if (y.error) fail(y.error);
      if (typeof title === "string") patch.title = title;
      if (typeof body === "string") patch.body = body;
      if (x.value !== undefined) patch.x = x.value;
      if (y.value !== undefined) patch.y = y.value;
      if (Object.keys(patch).length === 0) fail("no fields to update");
      return api<{ node: NodeRecord }>(
        "PATCH",
        `/api/graphs/${enc(graphId)}/nodes/${enc(nodeId)}`,
        patch,
      );
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
        `/api/graphs/${enc(graphId)}/nodes/delete`,
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
      return api<{ edge: EdgeRecord }>("POST", `/api/graphs/${enc(graphId)}/edges`, body);
    }
    case "delete":
    case "rm": {
      if (!graphId || !a) {
        fail("usage: gqn edges delete <graphId> <edgeId> --force");
      }
      requireForce(flags, `delete edge ${a}`);
      return api<{ ok: boolean }>("DELETE", `/api/graphs/${enc(graphId)}/edges/${enc(a)}`);
    }
    default:
      fail("usage: gqn edges <create|delete>");
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help") {
    process.stdout.write(HELP);
    return;
  }

  // Global flags may appear before or after the command: `gqn --local graphs list`
  const { args, flags, unknown } = parseArgs(argv);
  if (flag(flags, "help", "h")) {
    process.stdout.write(HELP);
    return;
  }
  if (flag(flags, "version", "v")) {
    print({ version: VERSION });
    return;
  }
  if (unknown.length > 0) {
    fail(`unknown flag: ${unknown.join(", ")} (see gqn --help)`);
  }
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
      let res: Response;
      try {
        res = await fetch(`${url}/api/health`);
      } catch (err) {
        const cause = (err as { cause?: { code?: string } }).cause;
        fail(
          `could not reach ${url}: ${cause?.code || (err instanceof Error ? err.message : String(err))}`,
        );
      }
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        fail(`unexpected non-JSON response from ${url}/api/health (status ${res.status})`);
      }
      print({ url, ...data, status: res.status });
      if (!res.ok) process.exit(1);
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
        if (!isValidHttpUrl(url)) fail(`not a valid http(s) URL: ${url}`);
        if (!isAllowedCredentialTarget(url)) {
          fail(`refusing to target an unsafe URL: ${url}`);
        }
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
        saveConfig({ url: boundUrl, token, tokenUrl: boundUrl });
        print({ ok: true, boundTo: boundUrl, configPath: configPath() });
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
        // 401/404: the token is already dead server-side — still clear it locally.
        if (!res.ok && res.status !== 401 && res.status !== 404) {
          fail(`could not revoke token: ${res.status} ${res.statusText}`, exitCodeFor(res.status));
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
      try {
        const data = await api<{ authenticated: boolean; user?: unknown; token?: unknown }>(
          "GET",
          "/api/me",
          undefined,
          { throwOnError: true },
        );
        print({ ...data, url: loadConfig().url });
      } catch (err) {
        if (err instanceof CliApiError && err.status === 401) {
          print({
            authenticated: false,
            url: loadConfig().url,
            hint: "create an API token in the web UI, then run: gqn config set-token",
          });
          return;
        }
        throw err;
      }
      return;
    }
    case "quota": {
      print(await api<{ quota: unknown }>("GET", "/api/quota"));
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
      if (mode !== "outgoing" && mode !== "both") {
        fail(`--mode must be "outgoing" or "both", got: ${mode}`);
      }
      print(
        await api<CascadeResult>("POST", `/api/graphs/${enc(graphId)}/cascade-select`, {
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
        await api<{ export: GraphExport; r2Key: string }>("POST", `/api/graphs/${enc(id)}/export`),
      );
      return;
    }
    case "fmt":
    case "format": {
      const id = cmdArgs[0];
      if (!id) fail("usage: gqn fmt <graphId>");
      print(await api<GraphDetail>("POST", `/api/graphs/${enc(id)}/fmt`));
      return;
    }
    default:
      fail(`unknown command: ${command} (see gqn --help)`);
  }
}

main().catch((err: unknown) => {
  if (err instanceof CliApiError) {
    fail(err.message, exitCodeFor(err.status));
  }
  fail(err instanceof Error ? err.message : String(err));
});
