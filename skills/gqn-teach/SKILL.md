---
name: gqn-teach
description: >-
  Turn a URL or source text into a hierarchical graphnote via gqn: decompose
  concepts into parent/child nodes so the graph itself teaches structure. Use when
  the user says teach, explain as a graph, structure this article/link, gqn-teach,
  or wants a concept map instead of prose notes. Judge abstract→concrete levels
  carefully so the graph stays compact (not a tall rail or a long chain). Prefer
  plain wording; put short cues, verified official doc links, and minimal examples
  in bodies when they materially improve understanding, without making cards long.
---

# gqn-teach

Build a **teachable graph** from a link or passage. Structure is taught by
**hierarchy and edges**; node bodies add **short cues, official links, and tiny
examples** so the user can understand, verify, and try the idea without reading
an essay on the canvas.

**Shape matters as much as labels.** A correct abstract→concrete split keeps the
canvas readable; over-split makes a long horizontal chain or a tall vertical fan.

Also follow the `gqn` skill for CLI auth/targets (`--prod` / `--local`).
After creating a large graph, run **`gqn fmt <graphId>`** (or **`gqn-node-refactor`**
if fmt is not enough).

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

## Goal

- Graph title = topic (short, plain).
- Nodes = named elements (concept, part, step, actor, invariant…).
- Edges (parent→child) = “contains / decomposes into / leads to”.
- Canvas glance shows structure; bodies hold **compact understanding aids** (definition fragment, command, constraint, official URL, minimal example).

## Anti-patterns (do not)

- Essay paragraphs in `--body` (no “In this section…”, no pasted article)
- One giant root with a wall of markdown
- Restating the whole source article inside nodes
- Orphan nodes with no parent link (except the single root)
- Metaphorical / catchy Japanese titles (see Language)
- Leaving every body empty when official docs or a 1-line cue would unlock the node
- Invented / guessed documentation URLs (only real, verified links)
- Pasting documentation prose or its full sample into a body; summarize it and write the smallest example that teaches this node
- Putting multiple variants, setup boilerplate, and expected output in one card until it becomes a mini article
- Creating all children with default auto-y so one parent sits far above a long vertical “rail” of edges — place siblings with explicit `--x`/`--y` near the parent, or `gqn fmt` afterward
- **Over-depth** (abstract→concrete→ultra-detail→flag→option…) as a left-to-right snake
- **Over-breadth** (10+ siblings under one parent) as a tall stack — regroup or facet instead
- Fake mid-level nodes that only restate the parent (“詳細”, “ポイント”, “概要”) without a real partition

## Abstract → concrete (judge before creating nodes)

Each edge parent→child must drop **exactly one abstraction level**. Wrong level = wrong shape.

| Level    | What belongs here                                                          | Examples                           |
| -------- | -------------------------------------------------------------------------- | ---------------------------------- |
| L0 topic | One subject of the graph                                                   | `gh stack`, `D1`, `rebase`         |
| L1 facet | Mutually exclusive **partitions** of the topic (kinds / phases / surfaces) | `コマンド`, `レビュー流れ`, `制約` |
| L2 unit  | Named element under a facet (one idea the user can point at)               | `sync`, `巨大PRはレビューしづらい` |
| L3 cue   | Only if L2 is still a bundle of distinct ideas                             | specific flag, error, invariant    |

**Child test (all should pass):**

1. **Partition** — siblings under the same parent answer the _same question_ about the parent (kinds? steps? parts?). Mixing “commands + philosophy + troubleshooting” under one parent = wrong; make separate L1 facets.
2. **Strict more-concrete** — child is a _kind / part / step / property_ of the parent, not a peer synonym and not a whole other topic.
3. **Necessary** — deleting the child loses a distinct idea; if it only restates the parent title, merge into parent `body` instead of a node.
4. **Stop depth** — if the next split is only a command, URL, or 1-line definition, put it in **`body`**, do not add another column.

**Do not split when:**

- Title already names one atomic idea → body only
- “Children” would be synonyms / rephrasings of the parent
- Next level is documentation chrome (TOC leftovers, “Introduction”, “Summary”)
- You are about to exceed **shape budget** (below) — regroup or start another graph

**Do split when:**

- Parent bundles 2+ ideas that a learner must see as separate
- Siblings would clarify contrast (A vs B) or ordered stages
- One facet is large enough to deserve its own L1 column

## Shape budget (anti-stretch)

Left→right = depth. Up→down = siblings. Both must stay compact **before** `fmt`.

| Constraint                | Target                            | If exceeded                                              |
| ------------------------- | --------------------------------- | -------------------------------------------------------- |
| Depth (root→leaf columns) | **2–3** edges (L0→L1→L2; L3 rare) | Collapse detail into `body`; drop fake mid-levels        |
| Children per parent       | **2–6** (hard max ~7)             | Add an L1 grouping node, or **facet into another graph** |
| Total nodes               | **8–20** typical (ask before >25) | Index graph of facet titles, or one graph per facet      |
| Top-level (L1) facets     | **3–6**                           | Merge thin facets; split a second graph for leftovers    |

Prefer **balanced bush**: a few L1 columns, each with a short sibling stack — not a deep chain and not one parent with a dozen leaves.

`fmt` only packs what you created; it cannot fix a wrong abstract/concrete tree.

## Node content rules

| Field   | Rule                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title` | Plain noun/verb phrase, ≤ ~40 chars. Primary label on the canvas.                                                                                                        |
| `body`  | Short Markdown cues that help the user _understand, verify, or try_. Usually 2–8 visual lines; one link and/or one tiny code block. Empty only when the title is enough. |
| layout  | Root left; each subtree in its own vertical band; siblings near their parent (`Δx≈280`, `Δy≈150` per sibling).                                                           |

### When to fill `body`

Fill when at least one of these is true:

1. **Official / primary docs** exist for the concept (API, CLI, RFCs, product docs).
2. Title alone is ambiguous (same word, different meaning) — add a 1-line plain definition.
3. A concrete cue helps recall: command, flag, formula, error code, version pin.
4. The source URL is the topic itself — put it on the **root** (and section nodes that map to headings with stable anchors, when useful).
5. A small syntax/API/behavior example teaches the idea faster than another explanation sentence.

Leave empty for pure structural grouping nodes (“手順”, “比較”) where children carry the meaning.

### Official links (preferred in body)

- Prefer **canonical docs** over blogs/tweets/mirrors (e.g. vendor docs, `*.github.io` project docs, MDN, RFCs).
- Use Markdown links (UI renders GFM). Label = short plain name, not the raw URL alone when the host is obscure.
- One primary link per node is enough; add a second only if it is a distinct official surface (e.g. reference + tutorial).
- If the user gave a source URL, keep it; still add official docs when the source is secondary commentary.

Body patterns (good):

```markdown
- 兄弟コミットを並べた履歴として扱う
- [About GitHub CLI](https://docs.github.com/en/github-cli)
```

```markdown
- `git rebase --update-refs`
- [git-rebase](https://git-scm.com/docs/git-rebase)
```

```markdown
- 公式: [Cloudflare D1](https://developers.cloudflare.com/d1/)
```

Body bad: multi-paragraph summaries; link dumps without a cue; unofficial SEO scrapes.

### Minimal examples (when useful)

- Put the example in the **same concept node**; do not create a child whose only purpose is “サンプル”.
- Show exactly one point with the smallest useful snippet: normally **2–6 lines**, one code block, no imports/setup unless essential.
- Prefer runnable/type-checkable code, but use a focused fragment when boilerplate would hide the idea.
- Add expected output or a 1-line takeaway only when the result is not obvious from the snippet.
- Write the example for this graph; do not paste a long example or English prose from the documentation.
- When cue + example + link are all useful, order them **cue → code → official link** and keep the body around **8 visual lines** (hard max ~12). If it still does not fit, remove secondary detail or split a genuinely separate concept.

Body pattern with a sample (good):

````markdown
- 引数名を持たせると順番への依存がなくなる

```ts
sendEmail({ from, to });
```

- [TypeScript: Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html)
````

## Workflow

1. **Ingest** — URL or text. Extract candidate ideas; note **official doc URLs**. Do not dump source into nodes.
2. **Level map** — assign each idea to L0/L1/L2/(L3). Drop TOC chrome. Merge synonyms. Apply **Child test** and **Shape budget** on paper first.
3. **Outline** — 1 root → 3–6 L1 facets → 2–5 L2 units each. Recurse to L3 only when Child test still demands a node. Prefer a balanced bush over deep or wide extremes.
4. **Wording pass** — rewrite every planned title into plain language (Language section).
5. **Body pass** — for each leaf / key concept: add a short cue, a verified official link when useful, and one minimal example when it teaches faster than prose. Apply the body line budget; anything that failed “necessary as a node” goes here. Skip structural-only nodes.
6. **Auth** — `gqn whoami` / `gqn --prod whoami`; if unauthorized, set the API token with
   `gqn config set-token` and its hidden prompt. Never print tokens or override its origin binding.
7. **Create graph + root** (root body: source URL and/or primary official overview)

```bash
gqn --prod graphs create '<Topic>'
gqn --prod nodes create <graphId> --title '<Topic>' --x 80 --y 400 --body $'- [source](<url>)\n- [docs](<official>)'
```

8. **Create children** — prefer `--parent` **and** explicit coordinates so each facet’s children sit in that facet’s band:

```bash
# L1 facet i at y = 80 + i*180 ; its L2 at x+280, y + j*140
gqn --prod nodes create <graphId> --title '<Facet>' --parent <rootId> --x 360 --y 80
gqn --prod nodes create <graphId> --title '<Unit>' --parent <facetId> --x 640 --y 80 \
  --body $'- plain cue\n- [official name](https://example.com/docs/...)'
```

9. **Cross-links** only when hierarchy is not enough (shared dependency / contrast). Do not use cross-links to fake a missing L1 facet.

```bash
gqn --prod edges create <graphId> <sourceId> <targetId> --label 'depends'
```

10. **Verify structure then layout** — `gqn --prod graphs get <graphId>`:
    - depth ≤ 3 edges; no parent with >7 children; no filler mid-nodes
    - bodies/links/examples look right; no pasted prose or overlong card (>~12 visual lines)
    - then `gqn --prod fmt <graphId>` (or **`gqn-node-refactor`** if topology is wrong, not just positions)
11. Report graph id + open URL + shape one-liner (depth × facets × approx nodes). No essay retelling.

## Decomposition heuristics (by source type)

Always run **Abstract → concrete** first; these only suggest L1 facet _kinds_.

- **Article** → L1 = real sections/claims (skip intro/outro fluff); L2 = concrete points; extras in body.
- **System** → L1 = components _or_ surfaces (pick one partition axis); under each: inputs / outputs / invariants as L2 only if distinct.
- **Process** → L1 = ordered stages (≤6); stage details in body unless a stage itself has named substeps.
- **Comparison** → L1 = options; L2 = pros / cons / when (shared criteria as cross-links or a small “基準” facet — not duplicated under every option).
- **Code / bug** → L1 = symptom / causes / fix (or surfaces); keep depth short; commands & links in body.

Stop when titles are atomic **or** Shape budget would break — then facet graphs, don’t deepen.
