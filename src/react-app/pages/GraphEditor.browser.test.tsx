import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";
import { NOTE_MIN_HEIGHT } from "../../shared/noteSize";
import { StubError } from "../test/api-stub";
import {
  cardBox,
  cardCenter,
  cardElement,
  dragMouse,
  fieldBox,
  fieldEditor,
  link,
  mountEditor,
  nodeFlowSize,
  note,
  portBox,
  portCenter,
} from "../test/canvas";

const twoNotes = () => [note("n1", 0, 0, "Alpha"), note("n2", 520, 40, "Beta")];

describe("data safety", () => {
  it("offers undo after deleting a note and restores it through the trash", async () => {
    const api = await mountEditor(twoNotes(), [link("e1", "n1", "n2")]);
    await userEvent.click(cardElement("n2"));
    await userEvent.click(screen.getByRole("button", { name: "選択を削除" }));

    await waitFor(() => expect(api.matching("POST", "/nodes/delete")).toHaveLength(1));
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(1);
    const toast = await screen.findByText(/1件のノードを削除しました/);
    await userEvent.click(within(toast.parentElement!).getByRole("button", { name: "元に戻す" }));

    await waitFor(() => {
      expect(api.matching("POST", "/nodes/restore").at(-1)?.body).toEqual({
        nodeIds: ["n2"],
        edgeIds: ["e1"],
      });
      expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2);
      expect(document.querySelector('.react-flow__edge[data-id="e1"]')).toBeInTheDocument();
    });
  });

  it("keeps refused text on screen and lets the user retry or discard", async () => {
    let refuse = true;
    const api = await mountEditor(twoNotes(), [], ({ method, path }) =>
      refuse && method === "PATCH" && path.endsWith("/nodes/n1")
        ? new StubError(500, "internal error")
        : undefined,
    );
    const card = cardBox("n1");
    const title = fieldBox("n1", "title");
    await userEvent.dblClick(cardElement("n1"), {
      position: { x: title.x - card.x + 20, y: title.y - card.y + 4 },
    });
    await userEvent.fill(fieldEditor("n1", "title"), "Unsaved");
    await userEvent.click(document.querySelector(".react-flow__pane") as HTMLElement);

    const banner = await screen.findByText(/入力した内容は画面に残っています/);
    expect(cardElement("n1")).toHaveTextContent("Unsaved");
    expect(document.querySelector("[data-save-state]")).toHaveAttribute("data-save-state", "error");

    refuse = false;
    await userEvent.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(banner).not.toBeInTheDocument());
    expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(2);
    expect(cardElement("n1")).toHaveTextContent("Unsaved");
  });

  it("shows the server's version after a conflict when the user discards", async () => {
    const current = { ...note("n1", 0, 0, "From CLI"), updated_at: "2026-02-01T00:00:00.000Z" };
    await mountEditor(twoNotes(), [], ({ method, path }) =>
      method === "PATCH" && path.endsWith("/nodes/n1")
        ? new StubError(412, "conflict", { node: current })
        : undefined,
    );
    const card = cardBox("n1");
    const title = fieldBox("n1", "title");
    await userEvent.dblClick(cardElement("n1"), {
      position: { x: title.x - card.x + 20, y: title.y - card.y + 4 },
    });
    await userEvent.fill(fieldEditor("n1", "title"), "Mine");
    await userEvent.click(document.querySelector(".react-flow__pane") as HTMLElement);

    await screen.findByText(/別の場所で更新されています/);
    expect(cardElement("n1")).toHaveTextContent("Mine");
    await userEvent.click(screen.getByRole("button", { name: "最新の内容に戻す" }));
    await waitFor(() => expect(cardElement("n1")).toHaveTextContent("From CLI"));
  });

  it("sends the card's version with every text save", async () => {
    const api = await mountEditor(twoNotes());
    const card = cardBox("n1");
    const title = fieldBox("n1", "title");
    await userEvent.dblClick(cardElement("n1"), {
      position: { x: title.x - card.x + 20, y: title.y - card.y + 4 },
    });
    await userEvent.fill(fieldEditor("n1", "title"), "Versioned");
    await userEvent.click(document.querySelector(".react-flow__pane") as HTMLElement);
    await waitFor(() => expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(1));
    expect(api.matching("PATCH", "/nodes/n1")[0]?.headers["if-match"]).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

describe("Markdown and links", () => {
  it("toggles a task checkbox and saves the flipped line", async () => {
    const api = await mountEditor([note("n1", 0, 0, "Todo", "- [ ] buy milk\n- [x] done")]);
    await userEvent.click(screen.getAllByRole("checkbox", { name: "完了にする" })[0]!);
    await waitFor(() => {
      expect(api.matching("PATCH", "/nodes/n1").at(-1)?.body).toEqual({
        body: "- [x] buy milk\n- [x] done",
      });
    });
  });

  it("edits a connection label from the keyboard", async () => {
    const api = await mountEditor(twoNotes(), [link("e1", "n1", "n2")]);
    const edge = document.querySelector<SVGGElement>('.react-flow__edge[data-id="e1"]');
    const hitArea = edge?.querySelector<SVGPathElement>(".react-flow__edge-interaction");
    if (!hitArea) throw new Error("connection e1 is not on the canvas");
    await userEvent.click(hitArea);
    await waitFor(() => expect(edge).toHaveClass("selected"));

    await userEvent.keyboard("{Enter}");
    const input = await screen.findByRole("textbox", { name: "ラベル" });
    await userEvent.fill(input, "because");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api.matching("PATCH", "/edges/e1").at(-1)?.body).toEqual({ label: "because" });
    });
    await waitFor(() => expect(edge).toHaveTextContent("because"));
  });

  it("edits title and body from the detail pane", async () => {
    const api = await mountEditor(twoNotes());
    await userEvent.click(cardElement("n1"));
    const inspector = screen.getByRole("complementary", { name: "ノードの詳細" });
    await userEvent.click(within(inspector).getByRole("button", { name: "編集" }));
    await userEvent.fill(
      within(inspector).getByRole("textbox", { name: "ノードの本文" }),
      "# 見出し",
    );
    await userEvent.click(within(inspector).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api.matching("PATCH", "/nodes/n1").at(-1)?.body).toEqual({ body: "# 見出し" });
    });
    expect(within(inspector).getByRole("heading", { name: "見出し" })).toBeInTheDocument();
  });

  it("collapses a branch behind its parent and expands it from the badge", async () => {
    await mountEditor(
      [note("n1", 0, 0, "Root"), note("n2", 400, 0, "Child"), note("n3", 800, 0, "Grandchild")],
      [link("e1", "n1", "n2"), link("e2", "n2", "n3")],
    );
    await userEvent.click(cardElement("n1"));
    await userEvent.keyboard("h");
    await waitFor(() => {
      expect(document.querySelectorAll(".react-flow__node")).toHaveLength(1);
    });
    const badge = screen.getByRole("button", { name: "2件の下位ノードを開く" });
    await userEvent.click(badge);
    await waitFor(() => {
      expect(document.querySelectorAll(".react-flow__node")).toHaveLength(3);
    });
  });
});

describe("P1 editor workflows", () => {
  it("starts mobile with a clear canvas and keeps primary actions in one row", async () => {
    await page.viewport(390, 844);
    await mountEditor(twoNotes());

    expect(screen.queryByRole("complementary", { name: "ノードの詳細" })).not.toBeInTheDocument();
    const header = document.querySelector("header");
    expect(header?.scrollWidth).toBeLessThanOrEqual(header?.clientWidth ?? 0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    expect(screen.getByRole("button", { name: "ノート一覧へ戻る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ノードを追加" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "メニュー" })).toBeInTheDocument();

    await userEvent.click(cardElement("n1"));
    await userEvent.click(await screen.findByRole("button", { name: "詳細を開く" }));
    expect(screen.getByRole("complementary", { name: "ノードの詳細" })).toHaveTextContent("Alpha");
    await userEvent.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    expect(document.activeElement).toBe(
      screen.getByRole("application", { name: "ノート編集キャンバス" }),
    );
    await page.viewport(1280, 900);
  });

  it("keeps the detail pane in sync when the viewport becomes mobile", async () => {
    await page.viewport(1280, 900);
    await mountEditor(twoNotes());

    expect(screen.getByRole("complementary", { name: "ノードの詳細" })).toBeInTheDocument();
    await page.viewport(390, 844);
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "ノードの詳細" })).not.toBeInTheDocument();
    });

    await userEvent.click(cardElement("n1"));
    await userEvent.click(await screen.findByRole("button", { name: "詳細を開く" }));
    expect(screen.getByRole("complementary", { name: "ノードの詳細" })).toHaveTextContent("Alpha");
    await page.viewport(1280, 900);
  });

  it("creates the first node from the empty-canvas guide", async () => {
    const api = await mountEditor([]);

    await userEvent.click(screen.getByRole("button", { name: "最初のノードを追加" }));

    await waitFor(() => expect(api.matching("POST", "/nodes")).toHaveLength(1));
    await waitFor(() => expect(document.querySelectorAll(".note-card")).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "最初のノードを追加" })).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-node-field", "title"));
  });

  it("opens categorized help with ? and blocks canvas shortcuts", async () => {
    const api = await mountEditor(twoNotes());
    await userEvent.keyboard("?");

    const dialog = await screen.findByRole("dialog", { name: "操作ヘルプ" });
    for (const category of [
      "作成・編集",
      "移動・検索",
      "接続・選択",
      "整理・復元",
      "ナビゲーション",
    ]) {
      expect(within(dialog).getByText(category)).toBeInTheDocument();
    }
    await userEvent.keyboard("n");
    expect(api.matching("POST", "/nodes")).toEqual([]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "操作ヘルプ" })).not.toBeInTheDocument();
  });

  it("searches title and body, then selects and centers the result", async () => {
    await mountEditor([
      note("n1", 0, 0, "Alpha", "first"),
      note("n2", 900, 700, "Beta", "探している本文です"),
    ]);
    await userEvent.keyboard("{Control>}k{/Control}");

    const input = await screen.findByRole("textbox", { name: "検索語" });
    await userEvent.fill(input, "探している");
    expect(screen.getByRole("option", { name: /Beta/ })).toHaveTextContent("探している本文");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(cardElement("n2").closest(".react-flow__node")).toHaveClass("selected"),
    );
    expect(screen.queryByRole("dialog", { name: "ノードを検索" })).not.toBeInTheDocument();
  });

  it("undoes and redoes a persisted text edit", async () => {
    const api = await mountEditor(twoNotes());
    const card = cardBox("n1");
    const title = fieldBox("n1", "title");
    await userEvent.dblClick(cardElement("n1"), {
      position: { x: title.x - card.x + 20, y: title.y - card.y + 4 },
    });
    await userEvent.fill(fieldEditor("n1", "title"), "Renamed");
    await userEvent.click(document.querySelector(".react-flow__pane") as HTMLElement);
    await waitFor(() => expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(1));

    await userEvent.click(await screen.findByRole("button", { name: "元に戻す" }));
    await waitFor(() => expect(cardElement("n1")).toHaveTextContent("Alpha"));
    await userEvent.click(screen.getByRole("button", { name: "やり直す" }));
    await waitFor(() => expect(cardElement("n1")).toHaveTextContent("Renamed"));
    expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(3);
  });

  it("persists undo and redo for a completed drag", async () => {
    const api = await mountEditor(twoNotes());
    const before = cardBox("n1");
    const from = { x: before.x + 80, y: before.y + 40 };
    await dragMouse(from, { x: from.x + 70, y: from.y + 70 });
    await waitFor(() => expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(1));
    expect(cardBox("n1").x).toBeGreaterThan(before.x + 40);

    const undo = screen.getByRole("button", { name: "元に戻す" });
    await waitFor(() => expect(undo).toBeEnabled());
    await userEvent.click(undo);
    await waitFor(() => expect(cardBox("n1").x).toBeCloseTo(before.x, 0));
    await userEvent.click(screen.getByRole("button", { name: "やり直す" }));
    await waitFor(() => expect(cardBox("n1").x).toBeGreaterThan(before.x + 40));
    expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(3);
  });

  it("treats auto-arrange as one undoable operation", async () => {
    const body = Array.from({ length: 10 }, (_, index) => `- 項目 ${index + 1}`).join("\n");
    await mountEditor([note("n1", 0, 0, "長い本文", body, { width: 420, height: 100 })]);
    const before = cardBox("n1").height;

    await userEvent.click(screen.getByRole("button", { name: "自動整列" }));
    await waitFor(() => expect(cardBox("n1").height).toBeGreaterThan(before));
    await userEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    await waitFor(() => expect(cardBox("n1").height).toBeCloseTo(before, 0));
  });
});

describe("customer-facing editor copy", () => {
  it("keeps secondary actions in the menu and removes shortcut copy", async () => {
    await mountEditor(twoNotes(), [link("e1", "n1", "n2")]);

    expect(document.body).toHaveTextContent("ノート一覧");
    expect(document.body).not.toHaveTextContent("ボード");
    expect(screen.getByRole("complementary", { name: "ノードの詳細" })).toHaveTextContent(
      "ノードを選択すると内容が表示されます",
    );
    expect(document.body).not.toHaveTextContent("基本操作");
    expect(document.body).not.toHaveTextContent("キーボード操作");
    expect(document.body).not.toHaveTextContent("下位を選択");
    expect(screen.getByRole("textbox", { name: "ノート名" })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: "ノート編集キャンバス" })).toBeInTheDocument();
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

  it("shows selected Markdown, resizes, closes, and reopens the detail pane", async () => {
    const body = "# 概要\n\n長い説明をここで読みます。\n\n- 最初の項目\n- 次の項目";
    await mountEditor([note("n1", 0, 0, "Alpha", body), note("n2", 520, 40, "Beta")]);

    await userEvent.click(cardElement("n1"));

    const inspector = screen.getByRole("complementary", { name: "ノードの詳細" });
    expect(within(inspector).getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(within(inspector).getByRole("heading", { name: "概要" })).toBeInTheDocument();
    expect(inspector).toHaveTextContent("長い説明をここで読みます。");

    const content = inspector.querySelector<HTMLElement>("[data-node-inspector-content]");
    expect(content).not.toBeNull();
    expect(getComputedStyle(content!).overflowY).toBe("auto");

    const separator = screen.getByRole("separator", { name: "詳細の幅を変更" });
    const separatorBox = separator.getBoundingClientRect();
    const widthBefore = inspector.getBoundingClientRect().width;
    await dragMouse(
      { x: separatorBox.x + separatorBox.width / 2, y: separatorBox.y + 100 },
      { x: separatorBox.x - 120, y: separatorBox.y + 100 },
    );
    await waitFor(() => {
      expect(inspector.getBoundingClientRect().width).toBeGreaterThan(widthBefore + 80);
    });

    await userEvent.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    expect(screen.queryByRole("complementary", { name: "ノードの詳細" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "詳細を開く" }));
    expect(screen.getByRole("complementary", { name: "ノードの詳細" })).toHaveTextContent("Alpha");
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

  for (const [label, size] of [
    ["a content-sized note", {}],
    ["a note with a saved width but no saved height", { width: 420, height: null }],
  ] as const) {
    it(`widens ${label} from a side handle without distorting it`, async () => {
      // Below NOTE_MIN_HEIGHT, NodeResizer shrinks the axis the drag never
      // touched to reach its own minimum: the API rejected the height, and the
      // card also drifted. Both cases render short, so both must be covered.
      const api = await mountEditor([{ ...note("n1", 0, 0, "短い"), ...size }]);
      await userEvent.click(cardElement("n1"));
      const node = cardElement("n1").closest<HTMLElement>(".react-flow__node");
      await waitFor(() => expect(node).toHaveClass("selected"));
      expect(nodeFlowSize("n1").height).toBeGreaterThanOrEqual(NOTE_MIN_HEIGHT);
      const line = node?.querySelector<HTMLElement>(".react-flow__resize-control.line.right");
      if (!line) throw new Error("selected note has no right resize line");
      const box = line.getBoundingClientRect();
      const dropTarget = document.createElement("div");
      Object.assign(dropTarget.style, {
        position: "fixed",
        left: `${box.x + box.width / 2 + 100}px`,
        top: `${box.y + box.height / 2}px`,
        width: "2px",
        height: "2px",
      });
      document.body.append(dropTarget);

      await userEvent.dragAndDrop(line, dropTarget);
      dropTarget.remove();

      await waitFor(() => expect(api.matching("PATCH", "/nodes/n1")).toHaveLength(1));
      const saved = api.matching("PATCH", "/nodes/n1").at(-1)?.body;
      expect(saved?.width).toBeGreaterThan(280);
      expect(saved?.height).toBeGreaterThanOrEqual(NOTE_MIN_HEIGHT);
      expect(saved?.y).toBe(0);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  }

  it("pushes the sibling below out of the way when a card grows", async () => {
    const api = await mountEditor(
      [note("n1", 0, 0, "Parent"), note("n2", 340, 0, "Grows"), note("n3", 340, 140, "Below")],
      [link("e1", "n1", "n2"), link("e2", "n1", "n3")],
    );
    await userEvent.click(cardElement("n2"));
    const node = cardElement("n2").closest<HTMLElement>(".react-flow__node");
    await waitFor(() => expect(node).toHaveClass("selected"));
    const handle = node?.querySelector<HTMLElement>(
      ".react-flow__resize-control.handle.bottom.right",
    );
    if (!handle) throw new Error("selected note has no bottom-right resize handle");
    const beforeBelow = cardBox("n3");
    const box = handle.getBoundingClientRect();
    const dropTarget = document.createElement("div");
    Object.assign(dropTarget.style, {
      position: "fixed",
      left: `${box.x + box.width / 2}px`,
      top: `${box.y + box.height / 2 + 120}px`,
      width: "2px",
      height: "2px",
    });
    document.body.append(dropTarget);

    await userEvent.dragAndDrop(handle, dropTarget);
    dropTarget.remove();

    await waitFor(() => expect(api.matching("PATCH", "/nodes/n3")).toHaveLength(1));
    expect(api.matching("PATCH", "/nodes/n3").at(-1)?.body?.y).toBeGreaterThan(140);
    await waitFor(() => expect(cardBox("n3").y - beforeBelow.y).toBeGreaterThan(30));
  });

  it("restores a saved size", async () => {
    await mountEditor([note("n1", 0, 0, "Saved size", "", { width: 420, height: 220 })]);

    expect(cardElement("n1").closest(".react-flow__node")).toHaveStyle({
      width: "420px",
      height: "220px",
    });
  });

  it("auto-arranges a saved card tall enough for its Markdown", async () => {
    const body = Array.from({ length: 10 }, (_, index) => `- 項目 ${index + 1}`).join("\n");
    await mountEditor([note("n1", 0, 0, "長い本文", body, { width: 420, height: 100 })]);

    const before = cardBox("n1");
    expect(cardElement("n1").scrollHeight).toBeGreaterThan(cardElement("n1").clientHeight);

    await userEvent.click(screen.getByRole("button", { name: "自動整列" }));

    await waitFor(() => expect(cardBox("n1").height).toBeGreaterThan(before.height));
    await waitFor(() => {
      const card = cardElement("n1");
      expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);
    });
  });
});

describe("navigating between notes", () => {
  it("clears the previous hovered focus when an arrow selects another note", async () => {
    await mountEditor([note("n1", 0, 0, "Left"), note("n2", 520, 0, "Right")]);

    await userEvent.click(cardElement("n2"));
    await waitFor(() => expect(cardElement("n2")).toHaveClass("is-active"));

    await userEvent.keyboard("{ArrowLeft}");

    await waitFor(() => {
      expect(cardElement("n1").closest(".react-flow__node")).toHaveClass("selected");
      expect(cardElement("n1")).toHaveClass("is-active");
      expect(cardElement("n2")).not.toHaveClass("is-active");
      expect(document.querySelectorAll(".note-card.is-active")).toHaveLength(1);
      expect(screen.getAllByText("Tabで子ノード")).toHaveLength(1);
      expect(cardElement("n1").closest(".react-flow__node")).toHaveTextContent("Tabで子ノード");
      expect(cardElement("n2").closest(".react-flow__node")).not.toHaveTextContent("Tabで子ノード");
    });
  });

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
      const previous = cardElement("n1").closest(".react-flow__node") as HTMLElement;
      const current = cardElement("n3").closest(".react-flow__node") as HTMLElement;

      expect(current).toHaveClass("selected");
      expect(previous).not.toHaveClass("selected");
      expect(previous.querySelector(".react-flow__resize-control")).toBeNull();
      expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(1);
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

const badgeOwners = () =>
  [...document.querySelectorAll<HTMLElement>(".note-parent-badge")].map(
    (badge) => badge.closest<HTMLElement>(".react-flow__node")?.dataset.id,
  );

describe("the note Tab grows a child from", () => {
  it("does not overlap a child that belongs to another branch", async () => {
    const api = await mountEditor(
      [
        note("n1", 0, 0, "職務経歴書"),
        note("n2", 0, -320, "jsconf cfp"),
        note("n3", 340, 0, "js promise"),
      ],
      [link("e1", "n2", "n3")],
    );

    await userEvent.click(cardElement("n1"));
    await userEvent.keyboard("{Tab}");

    await waitFor(() => expect(api.createdEdges).toEqual(["n1->n4"]));
    await waitFor(() => expect(cardElement("n4")).toBeInTheDocument());
    expect(cardBox("n4").top).toBeGreaterThanOrEqual(cardBox("n3").bottom);
  });

  it("hands the badge back to the selected note when the pointer leaves", async () => {
    // Reported as "Tab grew a child from a note I had left behind".
    const api = await mountEditor(twoNotes());
    const pane = document.querySelector(".react-flow__pane") as HTMLElement;

    await userEvent.click(cardElement("n1"));
    await waitFor(() => expect(badgeOwners()).toEqual(["n1"]));

    await userEvent.hover(cardElement("n2"));
    await waitFor(() => expect(badgeOwners()).toEqual(["n2"]));

    await userEvent.hover(pane, { position: { x: 40, y: 620 } });
    await waitFor(() => expect(badgeOwners()).toEqual(["n1"]));

    await userEvent.keyboard("{Tab}");
    await waitFor(() => expect(api.createdEdges).toEqual(["n1->n3"]));
  });

  it("drops the badge when the selection is cleared", async () => {
    await mountEditor(twoNotes());
    const pane = document.querySelector(".react-flow__pane") as HTMLElement;

    await userEvent.click(cardElement("n1"));
    await waitFor(() => expect(badgeOwners()).toEqual(["n1"]));

    await userEvent.click(pane, { position: { x: 40, y: 620 } });

    await waitFor(() => expect(badgeOwners()).toEqual([]));
  });
});
