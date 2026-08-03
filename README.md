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

## CLI (`gqn`)

```bash
pnpm build:cli
ln -sfn "$PWD/dist/cli/gqn.js" ~/.local/bin/gqn   # once
```

1. Sign in at https://graphnote.app
2. **Integrations** → create access key → copy once
3. `gqn config set-token <token>` (or `GRAPHNOTE_TOKEN`)

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

pnpm exec vite build
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

## Toolchain

TypeScript 7 · Vite 8 + React Compiler · Vitest · Oxc · Knip · Lefthook · tsup · Better Auth

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check
```
