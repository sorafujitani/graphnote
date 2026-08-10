import { QUOTA } from "../shared/quota";
import { isValidNoteHeight, isValidNoteWidth } from "../shared/noteSize";
import type { GraphExport } from "../shared/types";

// Coordinates far beyond any real canvas break layout math downstream.
const COORD_LIMIT = 1_000_000;
const MAX_ID_CHARS = 128;

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: 400 | 413 };

function invalid<T>(error: string, status: 400 | 413 = 400): ParseResult<T> {
  return { ok: false, error, status };
}

function valid<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= COORD_LIMIT;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_CHARS;
}

export async function readJsonBody(
  req: { text: () => Promise<string>; header?: (name: string) => string | undefined },
  maxBytes: number = QUOTA.maxRequestBytes,
): Promise<ParseResult<unknown>> {
  // Reject oversized bodies from the header before buffering them.
  const declared = Number(req.header?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes * 3) {
    return invalid("request body too large", 413);
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return invalid("could not read request body");
  }
  if (text.length > maxBytes) return invalid("request body too large", 413);
  if (!text.trim()) return valid(undefined);
  try {
    return valid(JSON.parse(text));
  } catch {
    return invalid("invalid JSON body");
  }
}

export function parseGraphTitleBody(raw: unknown): ParseResult<{ title?: string }> {
  if (raw === undefined) return valid({});
  if (!isRecord(raw)) return invalid("body must be a JSON object");
  if (raw.title !== undefined) {
    if (typeof raw.title !== "string") return invalid("title must be a string");
    if (raw.title.length > QUOTA.maxTitleChars) {
      return invalid(`title too long (max ${QUOTA.maxTitleChars})`);
    }
  }
  return valid({ title: raw.title as string | undefined });
}

type NodeFields = {
  title?: string;
  body?: string;
  x?: number;
  y?: number;
  width?: number | null;
  height?: number | null;
};

function parseNodeFields(raw: unknown, allowSize: boolean): ParseResult<NodeFields> {
  if (raw === undefined) return valid({});
  if (!isRecord(raw)) return invalid("body must be a JSON object");
  const out: NodeFields = {};
  if (raw.title !== undefined) {
    if (typeof raw.title !== "string") return invalid("title must be a string");
    if (raw.title.length > QUOTA.maxTitleChars) {
      return invalid(`title too long (max ${QUOTA.maxTitleChars})`);
    }
    out.title = raw.title;
  }
  if (raw.body !== undefined) {
    if (typeof raw.body !== "string") return invalid("body must be a string");
    if (raw.body.length > QUOTA.maxBodyChars) {
      return invalid(`body too long (max ${QUOTA.maxBodyChars})`);
    }
    out.body = raw.body;
  }
  for (const key of ["x", "y"] as const) {
    if (raw[key] !== undefined) {
      if (!isCoord(raw[key])) return invalid(`${key} must be a finite number`);
      out[key] = raw[key] as number;
    }
  }
  if (allowSize) {
    for (const key of ["width", "height"] as const) {
      const value = raw[key];
      if (value === undefined) continue;
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        return invalid(`${key} must be a number or null`);
      }
      out[key] = value as number | null;
    }
    if (out.width !== undefined && out.width !== null && !isValidNoteWidth(out.width)) {
      return invalid("invalid node width");
    }
    if (out.height !== undefined && out.height !== null && !isValidNoteHeight(out.height)) {
      return invalid("invalid node height");
    }
  }
  return valid(out);
}

export function parseCreateNodeBody(
  raw: unknown,
): ParseResult<Pick<NodeFields, "title" | "body" | "x" | "y">> {
  return parseNodeFields(raw, false);
}

export function parseUpdateNodeBody(raw: unknown): ParseResult<NodeFields> {
  const parsed = parseNodeFields(raw, true);
  if (!parsed.ok) return parsed;
  if (Object.keys(parsed.value).length === 0) return invalid("no fields to update");
  return parsed;
}

function parseIdArray(value: unknown, field: string): ParseResult<string[]> {
  if (!Array.isArray(value) || value.length === 0) return invalid(`${field} required`);
  if (value.length > QUOTA.maxNodesPerGraph) {
    return invalid(`${field} too many (max ${QUOTA.maxNodesPerGraph})`);
  }
  if (!value.every(isId)) return invalid(`${field} must be non-empty strings`);
  return valid(value as string[]);
}

export function parseDeleteNodesBody(
  raw: unknown,
): ParseResult<{ ids: string[]; cascade: boolean }> {
  if (!isRecord(raw)) return invalid("body must be a JSON object");
  const ids = parseIdArray(raw.ids, "ids");
  if (!ids.ok) return ids;
  if (raw.cascade !== undefined && typeof raw.cascade !== "boolean") {
    return invalid("cascade must be a boolean");
  }
  return valid({ ids: ids.value, cascade: raw.cascade === true });
}

export function parseCascadeSelectBody(
  raw: unknown,
): ParseResult<{ nodeIds: string[]; mode: "outgoing" | "both" }> {
  if (!isRecord(raw)) return invalid("body must be a JSON object");
  const nodeIds = parseIdArray(raw.nodeIds, "nodeIds");
  if (!nodeIds.ok) return nodeIds;
  if (raw.mode !== undefined && raw.mode !== "outgoing" && raw.mode !== "both") {
    return invalid(`mode must be "outgoing" or "both"`);
  }
  return valid({ nodeIds: nodeIds.value, mode: raw.mode === "both" ? "both" : "outgoing" });
}

export function parseCreateEdgeBody(
  raw: unknown,
): ParseResult<{ source_id: string; target_id: string; label?: string }> {
  if (!isRecord(raw)) return invalid("body must be a JSON object");
  if (!isId(raw.source_id) || !isId(raw.target_id)) {
    return invalid("source_id and target_id required");
  }
  if (raw.label !== undefined) {
    if (typeof raw.label !== "string") return invalid("label must be a string");
    if (raw.label.length > QUOTA.maxTitleChars) {
      return invalid(`label too long (max ${QUOTA.maxTitleChars})`);
    }
  }
  return valid({
    source_id: raw.source_id,
    target_id: raw.target_id,
    label: raw.label as string | undefined,
  });
}

export function parseImportBody(raw: unknown): ParseResult<GraphExport> {
  if (!isRecord(raw)) return invalid("body must be a JSON object");
  if (raw.version !== 1) return invalid("unsupported export version");
  if (!isRecord(raw.graph) || typeof raw.graph.title !== "string" || !raw.graph.title) {
    return invalid("graph.title required");
  }
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    return invalid("nodes and edges must be arrays");
  }
  if (raw.nodes.length > QUOTA.maxNodesPerGraph) {
    return invalid(`node limit (${QUOTA.maxNodesPerGraph})`);
  }
  if (raw.edges.length > QUOTA.maxEdgesPerGraph) {
    return invalid(`edge limit (${QUOTA.maxEdgesPerGraph})`);
  }
  for (const node of raw.nodes) {
    if (!isRecord(node) || !isId(node.id)) return invalid("each node needs a string id");
    for (const key of ["x", "y"] as const) {
      if (node[key] !== undefined && node[key] !== null && !isCoord(node[key])) {
        return invalid(`node ${key} must be a finite number`);
      }
    }
  }
  for (const edge of raw.edges) {
    if (!isRecord(edge) || !isId(edge.source_id) || !isId(edge.target_id)) {
      return invalid("each edge needs string source_id and target_id");
    }
  }
  return valid(raw as unknown as GraphExport);
}

export function parseCreateTokenBody(
  raw: unknown,
): ParseResult<{ name?: string; access: "read" | "write" }> {
  if (raw === undefined) return valid({ access: "read" });
  if (!isRecord(raw)) return invalid("body must be a JSON object");
  if (raw.name !== undefined && typeof raw.name !== "string") {
    return invalid("name must be a string");
  }
  if (raw.access !== undefined && raw.access !== "read" && raw.access !== "write") {
    return invalid(`access must be "read" or "write"`);
  }
  return valid({
    name: raw.name as string | undefined,
    access: raw.access === "write" ? "write" : "read",
  });
}
