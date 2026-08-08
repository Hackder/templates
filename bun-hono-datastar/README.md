# Bun Hono Datastar Template

A self-contained starting point for server-rendered TypeScript applications using Bun, Hono JSX, Datastar, Tailwind CSS, Drizzle, libSQL, Temporal, Playwright, and self-hosted Phosphor icons.

## Setup

```sh
cp .env.example .env
bun install
bun run db:push
bun run tailwind:build
bun run dev
```

Run `bun run tailwind` in another terminal while changing styles.

## Checks

```sh
bun run check
```

CI runs typechecking, linting, formatting, tests, the Tailwind build, and the Docker build separately.

Run browser tests after installing the local Playwright browsers:

```sh
bunx playwright install chromium webkit
bun run test:e2e
```

## Included Infrastructure

- Drizzle ORM with local libSQL by default and optional Turso/embedded-replica configuration.
- ESLint safety rules reject Drizzle updates and deletes without `where` clauses.
- Explicit Temporal imports and an ESLint policy rejecting legacy `Date` construction and static methods in TypeScript.
- Deterministic server time for E2E tests through `MOCK_TIME` and fake timers.
- Vendored Datastar with custom hot reload, URL navigation, countdown, hash navigation, back navigation, and Safari view-transition support.
- Development signal inspector and generation-aware server restart reloads.
- Query-string content hashes with server-side validation and rolling-deployment-safe cache headers.
- ETag and SSE-safe gzip middleware.
- Typed, self-hosted Phosphor icons with direct class usage rejected by ESLint.
- Chromium and WebKit Playwright projects with isolated local database preparation.

## Structure

- `src/app.tsx` contains the Hono routes and minimal Datastar example.
- `src/datastar.tsx` contains signal parsing and SSE helpers.
- `src/db.ts` and `src/schema.ts` provide the Drizzle/libSQL baseline.
- `src/dev-mode.tsx` provides hot reload and the Datastar signal inspector.
- `src/env.ts` is the only module that reads the process environment.
- `static/script.js` registers the custom Datastar browser plugins.
- `src/web/components/icon.tsx` is the typed boundary for Phosphor icons.
- `src/input.css` is compiled to the generated `static/styles.css`.
- `static/datastar-1.0.2.js` is a pinned, self-hosted Datastar bundle.
- `static/icons-2.1.2` contains the pinned, self-hosted Phosphor font.

The logger libraries used by some source projects are intentionally excluded. Domain-specific scraping, train, cinema, network topology, and Home Assistant behavior is also excluded.
