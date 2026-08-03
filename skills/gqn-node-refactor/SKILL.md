---
name: gqn-node-refactor
description: >-
  Rebalance an existing graphnote layout and hierarchy via gqn: shorten long
  edges, cluster siblings near their parent, fix stretched vertical "rails", and
  optionally plain-language titles. Use when the user mentions messy layout,
  long edge lines, unbalanced nodes, gqn-node-refactor, or after gqn-teach
  produces a skewed graph.
---

# gqn-node-refactor

Fix **spatial / structural** problems in an existing graph so relationships read
at a glance. Prefer moving nodes (`nodes update --x --y`) over rewriting content.
Follow the `gqn` skill for auth/targets.

## When to use

- Long edges spanning most of the canvas (parent at top, child near bottom)
- Many edges sharing one vertical “rail” instead of short parent→child hops
- Siblings stacked far from their parent’s y-band
- Overlapping nodes
- After `gqn-teach` if the canvas looks skewed

**Preferred layout fix:** `gqn fmt <graphId>` (or UI **Fmt** / key `A`) runs the server-side left-to-right tree layout and persists `x`/`y`. Use this skill for diagnosis, wording, or topology changes beyond automatic fmt.

## Goals

1. **Short edges** — connected nodes stay nearby (same subtree band).
2. **Local clusters** — each parent’s children form a compact column to its right.
3. **Left → right depth** — root leftmost; depth increases with `x`.
4. **No global vertical spine** — avoid one tall polyline feeding every leaf.

## Anti-patterns to remove

- One middle-column node linked such that a smoothstep path drops the full height of the graph
- All detail nodes in one tall column while parents sit in a short column (mismatched bands)
- Random `x/y` with crossing edges when a tidy tree layout would do

## Layout constants (default)

| Symbol |          Value | Meaning                                                |
| ------ | -------------: | ------------------------------------------------------ |
| `X0`   |             80 | Root x                                                 |
| `DX`   |            300 | Depth step (parent → child)                            |
| `DY`   |            160 | Sibling step within a subtree                          |
| `BAND` | subtree height | Each top-level child’s block is laid out independently |

Target: edge length roughly `DX` horizontally and at most a few `DY` vertically between parent and child.

## Algorithm

1. **Load**

```bash
gqn --prod graphs get <graphId>
```

Parse `nodes[]` (`id`, `title`, `x`, `y`) and `edges[]` (`source_id`, `target_id`).
Build adjacency (outgoing = children). Treat the graph as a forest; pick root =
node with no incoming edge (if several, the leftmost / user-named topic).

2. **Detect issues** (report briefly to the user)

- Edge with `|child.y - parent.y| > 2.5 * DY` or distance ≫ `DX`
- Child whose `x < parent.x` (wrong depth direction)
- Overlap: two nodes within ~120px box
- Parent with many children but children’s mean `y` far from parent `y`

3. **Assign tree slots** (do not change edge topology unless asked)

Depth-first or breadth-first per subtree:

- Root at `(X0, Y_center)` where `Y_center` is middle of total tree height
- For each parent, place children at `x = parent.x + DX`, `y = parent.y + (j - (n-1)/2) * DY`  
  so the child group is **vertically centered on the parent**
- Top-level sections: stack section roots with enough `DY` that their **subtree bounding boxes do not overlap**  
  (leave gap ≥ `DY` between bands)

4. **Apply positions**

Prefer the built-in formatter (same algorithm as the UI Fmt button):

```bash
gqn --prod fmt <graphId>
```

Only hand-place with `nodes update --x --y` when fmt is wrong for a specific subtree or the user asks for a custom layout.

5. **Optional wording pass** (only if user asked, or titles are clearly metaphorical)

Same rules as `gqn-teach` Language: plain Japanese, no 「物語」-style metaphors.

```bash
gqn --prod nodes update <graphId> <nodeId> --title '<plain title>'
```

6. **Verify**

```bash
gqn --prod graphs get <graphId>
```

Check max `|Δy|` on tree edges is small; no huge vertical rails. Tell the user what moved.

## Topology changes (only when needed)

Ask first unless the user already requested structural cleanup.

- **Wrong parent** — delete edge + create edge to the correct parent, then relayout that subtree.
- **Missing section** — insert a mid-level node and reparent leaves (create node, rewire edges, delete obsolete edges).
- **Do not** cascade-delete content to “fix layout”.

## What not to do

- Do not rewrite the whole note into prose
- Do not randomly scatter nodes
- Do not only `fitView` — positions must change in the data
- Do not leave children of section A in section B’s y-band

## Output to user

- What was wrong (1–2 bullets)
- What you changed (counts: N nodes moved, optional title edits)
- `graphId` — user reloads the canvas
