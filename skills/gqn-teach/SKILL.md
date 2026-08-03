---
name: gqn-teach
description: >-
  Turn a URL or source text into a hierarchical graphnote via gqn: decompose
  concepts into parent/child nodes so the graph itself teaches structure. Use when
  the user says teach, explain as a graph, structure this article/link, gqn-teach,
  or wants a concept map instead of prose notes.
---

# gqn-teach

Build a **teachable graph** from a link or passage. Understanding comes from
**hierarchy and edges**, not from reading long node bodies.

Also follow the `gqn` skill for CLI auth/targets (`--prod` / `--local`).

## Goal

- Graph title = topic (short).
- Nodes = named elements (concept, part, step, actor, invariant…).
- Edges (parent→child) = “contains / decomposes into / leads to”.
- A glance at the canvas should show structure; bodies only hold compact cues.

## Anti-patterns (do not)

- Essay paragraphs in `--body`
- One giant root with a wall of markdown
- Restating the source article inside nodes
- Orphan nodes with no parent link (except the single root)

## Node content rules

| Field   | Rule                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------ |
| `title` | Noun phrase, ≤ ~40 chars. The title _is_ the explanation.                                              |
| `body`  | Optional. Bullets / labels only (definition fragment, formula, URL). Prefer empty. Max ~5 short lines. |
| layout  | Root left; children to the right; siblings stacked on `y`.                                             |

Body ok examples: `- O(n log n)`, `- see §3`, `- aka "foo"`.  
Body bad examples: multi-paragraph summaries, “In this section we discuss…”.

## Workflow

1. **Ingest** — If URL: fetch/read enough to extract structure (headings, entities, steps). If text: use as-is. Do not dump the source into nodes.
2. **Outline on paper (mental)** — Pick 1 root, then 2–7 top-level children, then recurse only where decomposition helps. Prefer shallow & wide over deep & sparse, unless the domain is inherently deep.
3. **Auth** — `gqn whoami` (or `gqn --prod whoami`); login if needed. Never print passwords.
4. **Create graph**

```bash
gqn --prod graphs create '<Topic>'
# → graph.id
```

5. **Create root**

```bash
gqn --prod nodes create <graphId> --title '<Topic>' --x 80 --y 200
# → root id
```

6. **Create children with `--parent`** (auto layout). Titles carry meaning:

```bash
gqn --prod nodes create <graphId> --title '<Part A>' --parent <rootId>
gqn --prod nodes create <graphId> --title '<Part B>' --parent <rootId>
gqn --prod nodes create <graphId> --title '<A.1 detail>' --parent <partAId> --body $'- key term\n- constraint'
```

7. **Cross-links** only when hierarchy is not enough (shared dependency, contrast):

```bash
gqn --prod edges create <graphId> <sourceId> <targetId> --label 'depends'
```

8. **Verify** — `gqn --prod graphs get <graphId>`; report graph id + URL  
   `https://graphnote.fujitanisora0414.workers.dev` (user opens the note).  
   Fix titles/parents rather than bloating bodies.

## Decomposition heuristics

- **Article / post** → root = thesis; children = sections or claims; grandchildren = evidence / mechanisms.
- **System / API** → root = system; children = components; then inputs/outputs/invariants.
- **Process** → root = outcome; children = ordered stages (title starts with verb or stage name).
- **Comparison** → root = decision; children = options; under each: pros / cons / when.
- **Code / bug** → root = symptom; children = causes / surfaces / fix; keep code snippets tiny in body.

Stop splitting when a node’s title is already atomic (no useful child titles left).

## Size budget

- Typical teach graph: **8–25 nodes**. Ask before going much larger.
- If the source is huge: one graph per major facet, or a root “index” graph linking facet titles only.

## Output to user

- Graph title + `graphId`
- 1–2 lines on the _shape_ (e.g. “3 pillars → each splits into mechanisms”)
- Do **not** paste a prose retelling of the source
