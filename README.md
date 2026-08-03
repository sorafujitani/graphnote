# graphnote

Personal **graph notes** — connect ideas on a canvas instead of writing long documents.

**Live:** https://graphnote.app

- **UI:** React Flow canvas · Markdown bodies · keyboard-first editing · **Arrange** for auto-layout
- **API:** Hono on Cloudflare Workers
- **Auth:** Google sign-in (Better Auth) · per-user data isolation
- **Store:** D1 · JSON export + cloud backup
- **CLI:** `gqn` (access key) · agent skills `gqn` / `gqn-teach` / `gqn-node-refactor`

Deep links: `/g/<graphId>` · **Integrations:** `/integrations` · legal: `/terms` · `/privacy`

## Quick start (local)

Requires **Node.js 26+**. Preferred: Nix flake + direnv.

```bash
direnv allow
pnpm install
cp .env.example .dev.vars    # BETTER_AUTH_* + GOOGLE_*
pnpm run db:migrate:local
pnpm dev                     # http://127.0.0.1:5173
```

Tooling is [Vite+](https://viteplus.dev): every `pnpm run <script>` above delegates to `vp`, which
also ships in `node_modules/.bin`, so no global install is required. For the `vp` command itself:

```bash
curl -fsSL https://vite.plus | bash   # optional; VP_NODE_MANAGER=no keeps node/pnpm as-is
vp dev                                # same server as pnpm dev, minus the D1 migration step
vp check                              # fmt + lint + type-aware check in one pass
```

### Google OAuth (Web client)

Register a Web application in Google Cloud (project e.g. `fs-gpc-pj`):

|                        |                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **JavaScript origins** | `http://127.0.0.1:5173`, `https://graphnote.app`                                                   |
| **Redirect URIs**      | `http://127.0.0.1:5173/api/auth/callback/google`, `https://graphnote.app/api/auth/callback/google` |

Put the client ID/secret in `.dev.vars` locally and in Wrangler secrets for production.

## Editor

Each **note** has a **title** (label) and **body** (Markdown). Use **Arrange** (toolbar or `A`) to tidy overlapping notes — spacing accounts for body length.

| Key          | Action                                 |
| ------------ | -------------------------------------- |
| `F` / arrows | Focus a note                           |
| `Tab`        | Add a linked note from the focused one |
| `N`          | Add a standalone note                  |
| `Enter`      | Edit title → body                      |
| `L`          | Link two selected notes                |
| `C`          | Select branch                          |
| `⌫` / `⇧⌫`   | Delete / delete branch                 |
| `⇧` + arrows | Nudge selection                        |
| `A`          | **Arrange** — tidy canvas layout       |
| `⌘E`         | Download backup                        |
| `⌘[`         | Back to notes list                     |
| `Esc`        | Clear focus / cancel                   |

## Install (`gqn` CLI + agent skills)

Needs **Node.js 20+**. The CLI comes from the site, the skills from the
[skills](https://skills.sh) CLI:

```bash
curl -fsSL https://graphnote.app/install.sh | sh   # gqn
npx skills add sorafujitani/graphnote              # agent skills
```

The installer downloads the CLI bundle into `~/.local/share/graphnote` and
writes a launcher to `~/.local/bin/gqn` (`GQN_PREFIX` overrides the prefix,
`GRAPHNOTE_URL` the source host). Uninstall by deleting those two paths.

Then:

1. Sign in at https://graphnote.app
2. **Integrations** → create access key → copy once (the page shows the exact commands)
3. `gqn config set-token <token>` (or `GRAPHNOTE_TOKEN`)
4. `gqn graphs list`

Other channels:

| Channel   | Command                                                             | Status                                                             |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Installer | `curl -fsSL https://graphnote.app/install.sh \| sh`                 | works today, served from `dist/client/install` on every deploy     |
| From repo | `pnpm build:cli && ln -sfn "$PWD/dist/cli/gqn.js" ~/.local/bin/gqn` | development                                                        |
| Homebrew  | `brew install --HEAD sorafujitani/tap/gqn`                          | needs a tap repo — recipe and steps in `packaging/homebrew/gqn.rb` |

Default API base is production (`https://graphnote.app`). Use `--local` for dev.

```bash
gqn graphs list
gqn graphs create 'Topic'
gqn fmt <graphId>          # same as UI Arrange
gqn graphs export <graphId>
gqn graphs import ./note.json
```

## Quotas (MVP)

| Limit               | Value |
| ------------------- | ----: |
| Notes / user        |    50 |
| Cards / note        |   500 |
| Body chars / card   | 32768 |
| Access keys / user  |    10 |
| Backups kept / note |     5 |

## Deploy

Production: **graphnote.app** on Cloudflare Workers + D1 + R2.

`wrangler.json` sets `BETTER_AUTH_URL=https://graphnote.app` and the custom domain route. DNS + SSL are managed by Cloudflare when the domain is registered there.

```bash
# secrets (once)
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET

pnpm run build                # client + worker + CLI + /install.sh payload
pnpm run db:migrate:remote   # migration 0002 adds auth + ownership
pnpm exec wrangler deploy
```

**Migration `0002`** adds user ownership and wipes legacy unowned data — export first if needed.

Backup: periodic `wrangler d1 export` and/or `gqn graphs export`.

## Agent skills

| Skill                                                           | Role                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| [`skills/gqn`](skills/gqn/SKILL.md)                             | Operate graphnote via `gqn`                                |
| [`skills/gqn-teach`](skills/gqn-teach/SKILL.md)                 | URL / text → teach graph (abstract→concrete, compact bush) |
| [`skills/gqn-node-refactor`](skills/gqn-node-refactor/SKILL.md) | Fix hierarchy / wording; try `gqn fmt` (Arrange) first     |

```bash
npx skills add sorafujitani/graphnote                       # this project's agent dirs
npx skills add sorafujitani/graphnote -g                    # user-level instead
npx skills add sorafujitani/graphnote -s gqn-teach -y       # one skill, no prompts
npx skills add sorafujitani/graphnote -l                    # list, install nothing
npx skills update                                           # refresh installed copies
```

`skills` resolves them straight from GitHub — no registry entry, no publish step —
and records `skills-lock.json` so `update` knows where each copy came from. That
lock keys on the path, so renaming `skills/<name>/` makes existing installs report
the skill as deleted upstream; a `SKILL.md` at the repo root would shadow all three.

## Toolchain

TypeScript 7 · Vite+ (`vp`) — Vite 8 · Vitest · Oxc · Rolldown — with React Compiler · Knip · Lefthook · tsup · Better Auth

Lint and format rules live in the `lint` / `fmt` blocks of `vite.config.ts`.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check     # full gate: typecheck · lint · fmt · knip · coverage · build · wrangler dry-run
```

### Tests

Two projects, one runner. `node` (happy-dom) covers layout math, worker rules and
keyboard helpers; `browser` drives the real editor in headless Chromium, where
canvas behaviour — connect-handle hit areas, drop targets, card dragging, title
commits — is actually observable.

```bash
pnpm run test:setup      # once per machine: Chromium for the browser project
pnpm run test:browser    # canvas only (src/**/*.browser.test.tsx)
pnpm run test:node       # logic only
```

Canvas tests mount `GraphEditor` with `fetch` stubbed and assert on the requests
the gesture produced — see `src/react-app/test/canvas.tsx`.
