# graphnote

Personal graph notes on Cloudflare Workers.

- **Store:** D1 (`graphs` / `nodes` / `edges`)
- **Export:** JSON download + R2 snapshot
- **Auth:** shared password (cookie session)

## Setup

```bash
pnpm install
cp .env.example .dev.vars   # edit APP_PASSWORD / SESSION_SECRET
pnpm dev
```

Open the printed local URL. Default password is `changeme`.

## Deploy

1. Create remote resources once:

```bash
pnpm dlx wrangler d1 create graphnote
pnpm dlx wrangler r2 bucket create graphnote-exports
```

2. Put the returned D1 `database_id` into `wrangler.json`.

3. Set production secrets (do not rely on `vars` defaults):

```bash
pnpm dlx wrangler secret put APP_PASSWORD
pnpm dlx wrangler secret put SESSION_SECRET
```

4. Deploy:

```bash
pnpm deploy
```

## Notes

- Multiple notes are rows in `graphs`.
- Cascade select expands outbound descendants from the current selection.
- Cascade delete removes the expanded set (or selection + dependents when cascade is requested).
