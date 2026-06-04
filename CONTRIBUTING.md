# Contributing to LgNc

Thanks for your interest in making LgNc better. It's open source and self-hosted by
design, so contributions of all sizes are welcome.

## Development setup

```bash
pnpm install
pnpm dev
```

- Web app: http://localhost:5173
- Local API: http://localhost:8787

Local data (SQLite + encryption key) lives in `~/.lgnc` by default. Set `LGNC_DATA_DIR`
to use a throwaway directory while developing:

```bash
# macOS / Linux
LGNC_DATA_DIR=./data pnpm dev

# Windows (PowerShell)
$env:LGNC_DATA_DIR="$PWD\data"; pnpm dev
```

## Project layout

| Path            | What it is                                                        |
| --------------- | ----------------------------------------------------------------- |
| `apps/web`      | React + Vite frontend                                             |
| `apps/server`   | Hono local API server (chat streaming, keys, memory, history)     |
| `packages/core` | Provider registry, memory engine, local embeddings, key crypto    |
| `packages/db`   | Drizzle ORM schema + SQLite client                                |

Packages are consumed directly as TypeScript source (no build step) — the server runs
via `tsx` and the web app via Vite.

## Before you open a PR

```bash
pnpm typecheck   # must pass
pnpm build       # must pass
```

- Keep changes focused and explain the "why" in the PR description.
- Match the existing code style; avoid adding heavy dependencies without discussion.
- Never commit secrets or your `~/.lgnc` data.

## Adding a provider

Providers live in [`packages/core/src/providers.ts`](packages/core/src/providers.ts).
Add an entry to the catalog, wire up the AI SDK adapter in `getLanguageModel`, and expose
its key handling in [`packages/core/src/keys.ts`](packages/core/src/keys.ts) if it needs one.

## Reporting bugs

Open an issue with steps to reproduce, your OS, Node version, and which provider/model
you were using. Logs from the server terminal are very helpful.
