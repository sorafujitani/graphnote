/**
 * Browser-test harness for the canvas: the interesting graphnote bugs are
 * geometric, and happy-dom reports every box as 0x0, so these tests run in real
 * Chromium and assert against `getBoundingClientRect` / `elementFromPoint`.
 * `stubApi` replaces `fetch` rather than mocking modules, so `server/api.ts` stays under
 * test and the recorded calls are the payloads the worker would receive.
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach } from "vite-plus/test";
import { estimateNoteHeight } from "../../shared/estimateNoteHeight";
import type { EdgeRecord, GraphDetail, NodeRecord } from "../../shared/types";
import { GraphEditor } from "../pages/GraphEditor";
import { isValidNoteHeight, isValidNoteWidth } from "../../shared/noteSize";
import { StubError, stubFetch, type FetchStub, type StubRequest } from "./api-stub";
// Layout is under test, so load the same CSS as the app (pulls in xyflow's).
import "../index.css";

const TS = "2026-01-01T00:00:00.000Z";
const GRAPH_ID = "g1";

export type ApiStub = FetchStub & {
  /** `"<source>-><target>"` for each accepted edge create. */
  createdEdges: string[];
};

export function note(
  id: string,
  x: number,
  y: number,
  title = id,
  body = "",
  size: { width: number; height: number } | null = null,
): NodeRecord {
  return {
    id,
    graph_id: GRAPH_ID,
    title,
    body,
    x,
    y,
    width: size?.width ?? null,
    height: size?.height ?? null,
    created_at: TS,
    updated_at: TS,
  };
}

export function link(id: string, source_id: string, target_id: string): EdgeRecord {
  return { id, graph_id: GRAPH_ID, source_id, target_id, label: "", created_at: TS };
}

/** Routes `fetch` to an in-memory graph. */
/** Answers a request ahead of the built-in stub; `undefined` falls through. */
export type ApiOverride = (request: StubRequest) => unknown;

function stubApi(detail: Pick<GraphDetail, "nodes" | "edges">, override?: ApiOverride): ApiStub {
  const createdEdges: string[] = [];
  let edgeSeq = detail.edges.length;
  let nodeSeq = detail.nodes.length;

  const stub = stubFetch((request) => {
    const overridden = override?.(request);
    if (overridden !== undefined) return overridden;
    const { method, path, body } = request;
    if (path === `/api/graphs/${GRAPH_ID}` && method === "GET") {
      return {
        graph: { id: GRAPH_ID, owner_id: "u1", title: "Canvas", created_at: TS, updated_at: TS },
        nodes: detail.nodes,
        edges: detail.edges,
      };
    }
    if (path === `/api/graphs/${GRAPH_ID}/edges` && method === "POST") {
      const payload = body as { source_id: string; target_id: string };
      createdEdges.push(`${payload.source_id}->${payload.target_id}`);
      edgeSeq += 1;
      return { edge: link(`e${edgeSeq}`, payload.source_id, payload.target_id) };
    }
    if (path === `/api/graphs/${GRAPH_ID}/nodes/delete` && method === "POST") {
      const payload = body as { ids: string[] };
      const ids = new Set(payload.ids);
      const edgeIds = detail.edges
        .filter((edge) => ids.has(edge.source_id) || ids.has(edge.target_id))
        .map((edge) => edge.id);
      return { deletedNodeIds: payload.ids, deletedEdgeIds: edgeIds };
    }
    if (path === `/api/graphs/${GRAPH_ID}/nodes/restore` && method === "POST") {
      const payload = body as { nodeIds: string[]; edgeIds: string[] };
      return {
        nodes: payload.nodeIds.map(
          (id) => detail.nodes.find((node) => node.id === id) ?? note(id, 0, 0),
        ),
        edges: payload.edgeIds.flatMap((id) => detail.edges.filter((edge) => edge.id === id)),
      };
    }
    if (path === `/api/graphs/${GRAPH_ID}/batch` && method === "POST") {
      const payload = body as { nodes: Array<Partial<NodeRecord>> };
      const nodes = payload.nodes.map((item) => {
        nodeSeq += 1;
        return note(`n${nodeSeq}`, item.x ?? 0, item.y ?? 0, item.title ?? "", item.body ?? "");
      });
      return { nodes, edges: [], ids: {} };
    }
    if (path.startsWith(`/api/graphs/${GRAPH_ID}/edges/`) && method === "PATCH") {
      const id = path.split("/").pop() ?? "";
      const existing = detail.edges.find((edge) => edge.id === id) ?? link(id, "", "");
      return { edge: { ...existing, ...body } };
    }
    if (path === `/api/graphs/${GRAPH_ID}/nodes` && method === "POST") {
      const payload = body as Partial<NodeRecord>;
      nodeSeq += 1;
      return { node: note(`n${nodeSeq}`, payload.x ?? 0, payload.y ?? 0, payload.title ?? "") };
    }
    if (path === `/api/graphs/${GRAPH_ID}/fmt` && method === "POST") {
      return {
        graph: { id: GRAPH_ID, owner_id: "u1", title: "Canvas", created_at: TS, updated_at: TS },
        nodes: detail.nodes.map((node) =>
          node.height !== null
            ? {
                ...node,
                height: Math.max(
                  node.height,
                  estimateNoteHeight(node.title, node.body, node.width),
                ),
              }
            : node,
        ),
        edges: detail.edges,
      };
    }
    if (path.startsWith(`/api/graphs/${GRAPH_ID}/nodes/`) && method === "PATCH") {
      const id = path.split("/").pop() ?? "";
      const existing = detail.nodes.find((item) => item.id === id) ?? note(id, 0, 0);
      // Same size rejection as the worker, so any gesture that sends an
      // out-of-range size fails its own test instead of only this file's.
      const size = body as { width?: number | null; height?: number | null } | null;
      if (size?.width != null && !isValidNoteWidth(size.width)) {
        return new StubError(400, "invalid node width");
      }
      if (size?.height != null && !isValidNoteHeight(size.height)) {
        return new StubError(400, "invalid node height");
      }
      return { node: { ...existing, ...body } };
    }
    return undefined;
  });

  return { ...stub, createdEdges };
}

let activeStub: ApiStub | null = null;

// A leftover container pushes the next editor out of the viewport, where
// `elementFromPoint` returns nothing and every gesture silently misses.
afterEach(() => {
  cleanup();
  activeStub?.restore();
  activeStub = null;
});

/**
 * Mounts the real editor and waits until React Flow has measured the notes:
 * gestures fired before that hit unmeasured handles and silently do nothing.
 */
export async function mountEditor(
  nodes: NodeRecord[],
  edges: EdgeRecord[] = [],
  override?: ApiOverride,
): Promise<ApiStub> {
  activeStub = stubApi({ nodes, edges }, override);
  render(
    <div style={{ position: "fixed", inset: 0 }}>
      <GraphEditor
        graphId={GRAPH_ID}
        onBack={() => {}}
        onLogout={() => {}}
        onOpenTokens={() => {}}
      />
    </div>,
  );

  await waitFor(() => {
    const wrappers = document.querySelectorAll<HTMLElement>(".react-flow__node");
    if (wrappers.length !== nodes.length) throw new Error("notes are not mounted yet");
    for (const wrapper of wrappers) {
      // React Flow flips this inline style once the node and its handles are
      // measured. The app's CSS paints nodes earlier, so the DOM alone lies.
      if (wrapper.style.visibility !== "visible") {
        throw new Error("React Flow has not measured the notes yet");
      }
    }
  });
  await flush();

  return activeStub;
}

/** Lets React and React Flow apply pending work (state, effects, remeasures). */
async function flush(): Promise<void> {
  await act(async () => {});
}

export type Point = { x: number; y: number };

function nodeElement(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  if (!element) throw new Error(`node ${id} is not on the canvas`);
  return element;
}

export function cardElement(id: string): HTMLElement {
  const card = nodeElement(id).querySelector<HTMLElement>(".note-card");
  if (!card) throw new Error(`node ${id} has no card`);
  return card;
}

/**
 * Rendered node size in flow units. `getBoundingClientRect` is in screen px, so
 * an assertion against a layout constant has to divide the zoom back out, and
 * that leaves sub-pixel noise — hence the rounding.
 */
export function nodeFlowSize(id: string): { width: number; height: number } {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("the canvas has no viewport");
  const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
  const box = nodeElement(id).getBoundingClientRect();
  return { width: Math.round(box.width / zoom), height: Math.round(box.height / zoom) };
}

export function cardBox(id: string): DOMRect {
  return cardElement(id).getBoundingClientRect();
}

export function cardCenter(id: string): Point {
  const box = cardBox(id);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Connect port: the band along the card edge, drop zone excluded. */
export function portBox(id: string, kind: "source" | "target"): DOMRect {
  const port = nodeElement(id).querySelector(`.react-flow__handle.${kind}:not(.note-drop-zone)`);
  if (!port) throw new Error(`node ${id} has no ${kind} handle`);
  return port.getBoundingClientRect();
}

export function portCenter(id: string, kind: "source" | "target"): Point {
  const box = portBox(id, kind);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function mouseEvent(type: string, { x, y }: Point): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "mouseup" ? 0 : 1,
  });
}

/**
 * Press at `from`, travel to `to`, release. Dispatching on whatever sits under the
 * cursor is what makes this a hit test: a clipped or `pointer-events: none` target
 * never receives the press, exactly like with a real mouse.
 */
export async function dragMouse(from: Point, to: Point, steps = 8): Promise<void> {
  (document.elementFromPoint(from.x, from.y) ?? document.body).dispatchEvent(
    mouseEvent("mousedown", from),
  );
  await flush();
  for (let step = 1; step <= steps; step += 1) {
    const at = {
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps,
    };
    (document.elementFromPoint(at.x, at.y) ?? document.body).dispatchEvent(
      mouseEvent("mousemove", at),
    );
    await flush();
  }
  (document.elementFromPoint(to.x, to.y) ?? document.body).dispatchEvent(mouseEvent("mouseup", to));
  await flush();
}

/**
 * The title/body editors inside a card. Reach for these with Playwright-driven
 * `userEvent` (from `vite-plus/test/browser/context`) whenever a test needs focus,
 * typing, or blur: synthetic events do not run the browser's default actions.
 */
export function fieldEditor(id: string, field: "title" | "body"): HTMLElement {
  const editor = nodeElement(id).querySelector<HTMLElement>(`[data-node-field="${field}"]`);
  if (!editor) throw new Error(`node ${id} has no ${field} editor`);
  return editor;
}

export function fieldBox(id: string, field: "title" | "body"): DOMRect {
  return fieldEditor(id, field).getBoundingClientRect();
}
