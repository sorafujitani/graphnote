import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import {
  cardBox,
  cardCenter,
  cardElement,
  dragMouse,
  fieldBox,
  fieldEditor,
  link,
  mountEditor,
  note,
  portBox,
  portCenter,
} from "../test/canvas";

const twoNotes = () => [note("n1", 0, 0, "Alpha"), note("n2", 520, 40, "Beta")];

describe("customer-facing editor copy", () => {
  it("keeps the canvas full width and secondary actions in the menu", async () => {
    await mountEditor(twoNotes(), [link("e1", "n1", "n2")]);

    expect(document.body).toHaveTextContent("ノート一覧");
    expect(document.body).not.toHaveTextContent("ボード");
    expect(document.querySelector("aside")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("基本操作");
    expect(document.body).not.toHaveTextContent("キーボード操作");
    expect(document.body).not.toHaveTextContent("下位を選択");
    expect(screen.queryByRole("button", { name: "ダウンロード" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ログアウト" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "メニュー" }));

    expect(screen.getByRole("button", { name: "ダウンロード" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "ダウンロード" })).not.toBeInTheDocument();
    });
  });

  it("uses friendly placeholders instead of implementation terms", async () => {
    await mountEditor([note("n1", 0, 0, "", "")]);

    expect(cardElement("n1")).toHaveTextContent("タイトルなし");
    expect(cardElement("n1")).toHaveTextContent("メモを書く…");
  });
});

describe("linking two notes", () => {
  it("accepts a drop anywhere on the target card", async () => {
    const api = await mountEditor(twoNotes());

    await dragMouse(portCenter("n1", "source"), cardCenter("n2"));

    await waitFor(() => expect(api.createdEdges).toEqual(["n1->n2"]));
  });

  it("starts a link from the outer edge of the port", async () => {
    // Regression: `overflow: hidden` used to clip the half outside the card.
    const api = await mountEditor(twoNotes());
    const port = portBox("n1", "source");
    const outerEdge = { x: port.right - 1, y: port.y + port.height / 2 };

    expect(document.elementFromPoint(outerEdge.x, outerEdge.y)).toHaveClass("react-flow__handle");

    await dragMouse(outerEdge, cardCenter("n2"));

    await waitFor(() => expect(api.createdEdges).toEqual(["n1->n2"]));
  });

  it("starts a link from the top of the card's right edge", async () => {
    const api = await mountEditor(twoNotes());
    const card = cardBox("n1");

    await dragMouse({ x: card.right, y: card.y + 6 }, cardCenter("n2"));

    await waitFor(() => expect(api.createdEdges).toEqual(["n1->n2"]));
  });

  it("starts a link from the bottom of the card's left edge", async () => {
    const api = await mountEditor(twoNotes());
    const card = cardBox("n2");

    await dragMouse({ x: card.x, y: card.bottom - 6 }, cardCenter("n1"));

    // Loose mode: pulling the target port of n2 onto n1 links n1 -> n2.
    await waitFor(() => expect(api.createdEdges).toEqual(["n1->n2"]));
  });

  it("links from the target port too, dropping on the far card", async () => {
    const api = await mountEditor(twoNotes());

    await dragMouse(portCenter("n1", "target"), cardCenter("n2"));

    await waitFor(() => expect(api.createdEdges).toEqual(["n2->n1"]));
  });

  it("snaps to a note when the drop lands just outside its card", async () => {
    const api = await mountEditor(twoNotes());
    const target = cardBox("n2");

    await dragMouse(portCenter("n1", "source"), {
      x: target.x - 25,
      y: target.y + target.height / 2,
    });

    await waitFor(() => expect(api.createdEdges).toEqual(["n1->n2"]));
  });

  it("refuses a drop back on the note the link started from", async () => {
    const api = await mountEditor(twoNotes());

    await dragMouse(portCenter("n1", "source"), cardCenter("n1"));

    expect(api.matching("POST", "/edges")).toEqual([]);
  });

  it("refuses a link that already exists", async () => {
    const api = await mountEditor(twoNotes(), [link("e1", "n1", "n2")]);

    await dragMouse(portCenter("n1", "source"), cardCenter("n2"));

    expect(api.matching("POST", "/edges")).toEqual([]);
  });
});

describe("removing a connection", () => {
  it("selects a line and removes only that connection", async () => {
    const api = await mountEditor(twoNotes(), [link("e1", "n1", "n2")]);
    const edge = document.querySelector<SVGGElement>('.react-flow__edge[data-id="e1"]');
    const hitArea = edge?.querySelector<SVGPathElement>(".react-flow__edge-interaction");
    const path = edge?.querySelector<SVGPathElement>(".react-flow__edge-path");
    if (!edge || !hitArea || !path) throw new Error("connection e1 is not on the canvas");
    const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
    const screenMatrix = path.getScreenCTM();
    if (!screenMatrix) throw new Error("connection e1 has no screen transform");
    const screenPoint = new DOMPoint(midpoint.x, midpoint.y).matrixTransform(screenMatrix);
    const hitBox = hitArea.getBoundingClientRect();
    expect(document.elementFromPoint(screenPoint.x, screenPoint.y)).toBe(hitArea);

    await userEvent.click(hitArea, {
      position: { x: screenPoint.x - hitBox.x, y: screenPoint.y - hitBox.y },
    });

    await waitFor(() => expect(edge).toHaveClass("selected"));
    await userEvent.click(screen.getByRole("button", { name: "つながりを削除" }));

    await waitFor(() => {
      expect(api.matching("DELETE", "/edges/e1")).toHaveLength(1);
      expect(document.querySelector('.react-flow__edge[data-id="e1"]')).not.toBeInTheDocument();
    });
    expect(api.matching("POST", "/nodes/delete")).toEqual([]);
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2);
  });
});

describe("moving a note", () => {
  it("drags from the title text", async () => {
    // Reported as "I meant to move it and ended up typing".
    const api = await mountEditor(twoNotes());
    const before = cardBox("n1");
    const title = fieldBox("n1", "title");
    const grab = { x: title.x + title.width / 2, y: title.y + title.height / 2 };

    await dragMouse(grab, { x: grab.x + 70, y: grab.y + 70 });

    const after = cardBox("n1");
    expect(Math.round(after.x - before.x)).toBeGreaterThan(50);
    expect(Math.round(after.y - before.y)).toBeGreaterThan(50);
    await waitFor(() => {
      expect(api.matching("PATCH", "/nodes/n1").at(-1)?.body).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
      });
    });
    expect(document.activeElement).not.toBe(fieldEditor("n1", "title"));
  });

  it("drags from the body preview", async () => {
    await mountEditor([
      note("n1", 0, 0, "Alpha", "some **body** text"),
      note("n2", 520, 40, "Beta"),
    ]);
    const before = cardBox("n1");
    const body = fieldBox("n1", "body");
    const grab = { x: body.x + body.width / 2, y: body.y + body.height / 2 };

    await dragMouse(grab, { x: grab.x + 70, y: grab.y + 70 });

    expect(Math.round(cardBox("n1").x - before.x)).toBeGreaterThan(50);
  });

  it("drags from the padding strip above the title", async () => {
    await mountEditor(twoNotes());
    const before = cardBox("n1");

    await dragMouse(
      { x: before.x + before.width / 2, y: before.y + 3 },
      { x: before.x + before.width / 2 + 60, y: before.y + 65 },
    );

    const after = cardBox("n1");
    expect(Math.round(after.x - before.x)).toBeGreaterThan(40);
    expect(Math.round(after.y - before.y)).toBeGreaterThan(40);
  });

  it("keeps the note still while text is dragged inside a focused field", async () => {
    await mountEditor(twoNotes());
    const card = cardBox("n1");
    const titleBox = fieldBox("n1", "title");

    await userEvent.dblClick(cardElement("n1"), {
      position: { x: titleBox.x - card.x + 20, y: titleBox.y - card.y + 4 },
    });
    await waitFor(() => expect(document.activeElement).toBe(fieldEditor("n1", "title")));

    const before = cardBox("n1");
    await dragMouse(
      { x: titleBox.x + 10, y: titleBox.y + titleBox.height / 2 },
      { x: titleBox.x + 90, y: titleBox.y + titleBox.height / 2 + 60 },
    );

    expect(Math.round(cardBox("n1").x - before.x)).toBe(0);
    expect(document.activeElement).toBe(fieldEditor("n1", "title"));
  });
});

describe("resizing a note", () => {
  it("resizes from a corner and saves the new size", async () => {
    const api = await mountEditor([note("n1", 0, 0, "Resizable")]);
    await userEvent.click(cardElement("n1"));
    const node = cardElement("n1").closest<HTMLElement>(".react-flow__node");
    await waitFor(() => expect(node).toHaveClass("selected"));
    const handle = node?.querySelector<HTMLElement>(
      ".react-flow__resize-control.handle.bottom.right",
    );
    if (!handle) throw new Error("selected note has no bottom-right resize handle");
    for (const side of ["top", "right", "bottom", "left"]) {
      const line = node?.querySelector<HTMLElement>(`.react-flow__resize-control.line.${side}`);
      if (!line) throw new Error(`selected note has no ${side} resize line`);
      const hitBox = line.getBoundingClientRect();
      expect(side === "left" || side === "right" ? hitBox.width : hitBox.height).toBeGreaterThan(7);
    }
    const before = cardBox("n1");
    const box = handle.getBoundingClientRect();
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect(document.elementFromPoint(from.x, from.y)).toBe(handle);
    const dropTarget = document.createElement("div");
    Object.assign(dropTarget.style, {
      position: "fixed",
      left: `${from.x + 120}px`,
      top: `${from.y + 80}px`,
      width: "2px",
      height: "2px",
    });
    document.body.append(dropTarget);

    await userEvent.dragAndDrop(handle, dropTarget);
    dropTarget.remove();

    await waitFor(() => expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(1));
    const saved = api.matching("PATCH", "/nodes/n1").at(-1)?.body;
    expect(saved?.width).toBeGreaterThan(280);
    expect(saved?.height).toBeGreaterThan(100);
    await waitFor(() => {
      const after = cardBox("n1");
      expect(after.width - before.width).toBeGreaterThan(90);
      expect(after.height - before.height).toBeGreaterThan(50);
    });
  });

  it("restores a saved size", async () => {
    await mountEditor([note("n1", 0, 0, "Saved size", "", { width: 420, height: 220 })]);

    expect(cardElement("n1").closest(".react-flow__node")).toHaveStyle({
      width: "420px",
      height: "220px",
    });
  });
});

describe("navigating between notes", () => {
  it("moves down to the note below instead of a mostly-right note", async () => {
    await mountEditor([
      note("n1", 0, 0, "Current"),
      note("n2", 520, 40, "Mostly right"),
      note("n3", 0, 320, "Below"),
    ]);

    await userEvent.click(cardElement("n1"));
    await waitFor(() => {
      expect(cardElement("n1").closest(".react-flow__node")).toHaveClass("selected");
    });
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => {
      expect(cardElement("n3").closest(".react-flow__node")).toHaveClass("selected");
    });
  });
});

describe("editing a note", () => {
  it("selects on a single click without opening the text", async () => {
    // A caret here would make every canvas shortcut type instead.
    await mountEditor(twoNotes());

    await userEvent.click(cardElement("n1"));

    expect(document.activeElement).not.toBe(fieldEditor("n1", "title"));
    await waitFor(() => {
      expect(cardElement("n1").closest(".react-flow__node")).toHaveClass("selected");
    });
  });

  it("opens the title on a double click and commits the edit on blur", async () => {
    // Playwright refuses elements that take no pointer events: also an overlay check.
    const api = await mountEditor(twoNotes());
    const card = cardBox("n1");
    const title = fieldBox("n1", "title");

    await userEvent.dblClick(cardElement("n1"), {
      position: { x: title.x - card.x + 20, y: title.y - card.y + 4 },
    });
    await waitFor(() => expect(document.activeElement).toBe(fieldEditor("n1", "title")));

    await userEvent.fill(fieldEditor("n1", "title"), "Renamed");
    await userEvent.click(document.querySelector(".react-flow__pane") as HTMLElement);

    await waitFor(() => {
      expect(api.matching("PATCH", "/nodes/n1").at(-1)?.body).toEqual({ title: "Renamed" });
    });
  });

  it("opens the body editor when the double click lands below the title", async () => {
    await mountEditor(twoNotes());
    const card = cardBox("n1");
    const body = fieldBox("n1", "body");

    await userEvent.dblClick(cardElement("n1"), {
      position: { x: body.x - card.x + 20, y: body.y - card.y + body.height / 2 },
    });

    await waitFor(() => {
      const editor = fieldEditor("n1", "body");
      expect(editor.tagName).toBe("TEXTAREA");
      expect(document.activeElement).toBe(editor);
    });
  });

  it("opens the selected note's title on Enter", async () => {
    // The canvas asks through node data; nothing reaches into the DOM for the field.
    await mountEditor(twoNotes());

    await userEvent.click(cardElement("n1"));
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      const editor = fieldEditor("n1", "title");
      expect(editor.tagName).toBe("TEXTAREA");
      expect(document.activeElement).toBe(editor);
    });
  });
});

describe("adding a note", () => {
  it("creates one where the canvas was double-clicked", async () => {
    const api = await mountEditor(twoNotes());
    const pane = document.querySelector(".react-flow__pane") as HTMLElement;

    await userEvent.dblClick(pane, { position: { x: 120, y: 620 } });

    await waitFor(() => {
      const created = api.matching("POST", "/nodes").at(-1)?.body as
        | { x: number; y: number }
        | undefined;
      expect(created).toBeDefined();
      // Not the stacked default slot the toolbar button uses.
      expect(created).not.toMatchObject({ x: 168, y: 168 });
    });
    await waitFor(() => expect(document.querySelectorAll(".note-card")).toHaveLength(3));
    // A new note is ready to type in, without a timer racing the mount.
    const created = [...document.querySelectorAll<HTMLElement>(".react-flow__node")].at(-1);
    await waitFor(() => {
      expect(created?.querySelector("textarea[data-node-field='title']")).toBe(
        document.activeElement,
      );
    });
  });
});
