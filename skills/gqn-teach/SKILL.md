---
name: gqn-teach
description: >-
  Turn a URL or source text into a hierarchical graphnote via gqn: decompose
  concepts into parent/child nodes so the graph itself teaches structure. Use when
  the user says teach, explain as a graph, structure this article/link, gqn-teach,
  or wants a concept map instead of prose notes. Prefer plain wording; avoid
  metaphorical Japanese titles.
---

# gqn-teach

Build a **teachable graph** from a link or passage. Understanding comes from
**hierarchy and edges**, not from reading long node bodies.

Also follow the `gqn` skill for CLI auth/targets (`--prod` / `--local`).
After creating a large graph, run **`gqn-node-refactor`** if edges look stretched.

## Goal

- Graph title = topic (short, plain).
- Nodes = named elements (concept, part, step, actor, invariant…).
- Edges (parent→child) = “contains / decomposes into / leads to”.
- A glance at the canvas should show structure; bodies only hold compact cues.

## Language (titles & short body labels)

Use **一般的で平易な言葉**. Titles must read like labels on a diagram, not copywriting.

**禁止（特徴的・比喩・物語調の日本語）**

- 「一つの物語」「ストーリー」「物語る」「旅」「処方箋」など比喩タイトル
- 「〜というわけ」「〜にほかならない」など説明口調の長め言い回し
- キャッチコピー調（「差分の海を渡る」等）

**推奨**

- 普通の名詞句・動詞句: 「巨大PRはレビューしづらい」「無関係な変更を混ぜない」
- 用語はそのまま: `init`, `sync`, `upstack` など固有名は原文どおりでよい
- 曖昧なら具体に: 「1スタック=1テーマ」ではなく「1スタックに無関係な変更を入れない」

Bad → Good:

| Bad                  | Good                              |
| -------------------- | --------------------------------- |
| 1スタックは1つの物語 | 1スタックに無関係な変更を入れない |
| 差分の海             | 巨大な差分                        |
| レビューの旅         | レビュー手順                      |

## Anti-patterns (do not)

- Essay paragraphs in `--body`
- One giant root with a wall of markdown
- Restating the source article inside nodes
- Orphan nodes with no parent link (except the single root)
- Metaphorical / catchy Japanese titles (see Language)
- Creating all children with default auto-y so one parent sits far above a long vertical “rail” of edges — place siblings with explicit `--x`/`--y` near the parent, or refactor afterward

## Node content rules

| Field   | Rule                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| `title` | Plain noun/verb phrase, ≤ ~40 chars. The title _is_ the explanation.                                           |
| `body`  | Optional. Bullets / labels only. Prefer empty. Max ~5 short lines.                                             |
| layout  | Root left; each subtree in its own vertical band; siblings near their parent (`Δx≈280`, `Δy≈150` per sibling). |

Body ok: `- O(n log n)`, `- gh stack init`.  
Body bad: multi-paragraph summaries.

## Workflow

1. **Ingest** — URL or text. Extract structure; do not dump source into nodes.
2. **Outline** — 1 root, 2–7 top-level children, recurse only when useful. Prefer shallow & wide.
3. **Wording pass** — rewrite every planned title into plain language (Language section).
4. **Auth** — `gqn whoami` / `gqn --prod whoami`; login if needed. Never print passwords.
5. **Create graph + root**

```bash
gqn --prod graphs create '<Topic>'
gqn --prod nodes create <graphId> --title '<Topic>' --x 80 --y 400
```

6. **Create children** — prefer `--parent` **and** explicit coordinates so each section’s children sit beside that section (not one global vertical stack):

```bash
# section i at y = 80 + i*180 ; its children at x+280, y + j*140
gqn --prod nodes create <graphId> --title '<Section>' --parent <rootId> --x 360 --y 80
gqn --prod nodes create <graphId> --title '<Detail>' --parent <sectionId> --x 640 --y 80 --body $'- fact'
```

7. **Cross-links** only when hierarchy is not enough:

```bash
gqn --prod edges create <graphId> <sourceId> <targetId> --label 'depends'
```

8. **Verify** — `gqn --prod graphs get <graphId>`. If long diagonal/vertical edges or bunched siblings: invoke **`gqn-node-refactor`**.
9. Report graph id + open URL. Do not paste a prose retelling.

## Decomposition heuristics

- **Article** → root = topic; children = sections; grandchildren = concrete points.
- **System** → components → inputs / outputs / invariants.
- **Process** → ordered stages (plain stage names).
- **Comparison** → options → pros / cons / when.
- **Code / bug** → symptom → causes / surfaces / fix.

Stop when titles are already atomic.

## Size budget

- Typical: **8–25 nodes**. Ask before going much larger.
- Huge source → one graph per facet, or an index root of facet titles only.

## Output to user

- Graph title + `graphId`
- 1–2 lines on shape only (e.g. “6 sections → each has 1–3 detail nodes”)
- No essay summary of the source
