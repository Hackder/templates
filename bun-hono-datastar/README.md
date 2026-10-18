# Bun Hono Datastar Template

A self-contained starting point for server-rendered TypeScript applications using Bun, Hono JSX, Datastar, Tailwind CSS, Drizzle, libSQL, Temporal, Playwright, and self-hosted Phosphor icons.

## Setup

```sh
bun install
bun run db:push
bun run tailwind:build
bun run dev
```

`bun run dev` runs with `NODE_ENV=development`, which turns on the dev
overlay and hot reload; with `NODE_ENV` unset the app runs as production.
It creates a `.env` on first run with every variable from
`src/env.ts` commented out next to its default. Uncomment a line to override it.
There is no `.env.example`; the schema in `src/env.ts` is the documentation.
The server listens on `127.0.0.1` only; set `HOST=0.0.0.0` to reach it from
another device on the network (the Docker image does).

Run `bun run tailwind` in another terminal while changing styles, and
`bun run logview` for the local log and trace viewer (see below).

## Checks

```sh
bun run check
```

`check` runs the typecheck (`tsc` for the server and a separate DOM project for `static/`), Oxlint (type-aware, with the custom rules in `lint-rules/`), the Oxfmt format check, `bun test --parallel`, and the Tailwind build. `bun run tc` is the quicker typecheck plus lint. `bun run format:fix` formats everything. The unit tests read the local database, so run `bun run db:push` before them on a fresh checkout. CI runs `bun run check`, the E2E tests, and the Docker build.

Run browser tests after installing the local Playwright browsers:

```sh
bunx playwright install chromium webkit
bun run test:e2e
```

## Logging and traces

Everything logs through `src/logger/`: `withSpan` for an owning span with one
canonical close line, `withSection` for a nested timing, `logger().info()`
and friends for events. Every request runs in a `request` span, and database
queries are recorded as `client` sections by `src/db-instrument.ts`. The
calling thread only queues JSON records; a worker prints them, appends
`logs/log.ndjson` for the viewer and, when `AXIOM_TOKEN` is set, ships them to
Axiom as OpenTelemetry traces and logs (`AXIOM_TRACES_DATASET` and
`AXIOM_LOGS_DATASET`). `AXIOM_URL` defaults to the US East edge deployment; an
organisation on the EU deployment (Settings > General) sets it to
`https://eu-central-1.aws.edge.axiom.co`. Every span, including sections, shows
up in Axiom's trace waterfall.

`bun run logview` starts the local viewer on `LOGVIEW_PORT` (4600 by default).
It tails `LOG_JSON_FILE` (`logs/log.ndjson`, truncated on every app start) and
shows each trace as a waterfall of its spans, events and errors.

To find slow requests in Axiom and open one:

```
['bun-hono-datastar-traces']
| where kind == "server" and duration > 500ms
| project _time, trace_id, ['attributes.url.path'], duration
| order by duration desc
```

Clicking the trace id shows the request's sections (renders, database
queries) on a timeline, with warnings and errors as events on their span.
Axiom files the OpenTelemetry semantic-convention fields (`url.path`, `http.*`,
`db.*`) directly under `attributes`; our own fields and the counters sit in the
`attributes.custom` map.

## Included Infrastructure

- Drizzle ORM with local libSQL by default and optional Turso/embedded-replica configuration.
- Oxlint (type-aware) and Oxfmt, with project rules in `lint-rules/` and the vendored anti-slop plugin. Custom rules reject Drizzle updates and deletes without `where` clauses, the legacy `Date` API, direct Phosphor classes, `JSON.parse` outside `src/std.ts`, and more.
- Bun's native `Temporal` global, and a single `instantToDateForInteropWithDrizzle` boundary for passing Temporal values into Drizzle's `Date`-typed timestamp columns.
- Deterministic server time for E2E tests through `MOCK_TIME` and Bun's `setSystemTime`.
- Structured logging with spans, an NDJSON file for `bun run logview`, and optional OpenTelemetry export to Axiom.
- Vendored Datastar with custom hot reload, URL navigation, hash navigation, back navigation, and Safari view-transition support.
- Development signal inspector and generation-aware server restart reloads.
- Query-string content hashes with server-side validation and rolling-deployment-safe cache headers.
- ETag and brotli/gzip middleware with q-value negotiation; Datastar event streams compress themselves with one compressor per connection and one write per event.
- `/health` (used by the Docker `HEALTHCHECK`) and `/robots.txt`.
- Typed, self-hosted Phosphor icons with direct class usage rejected by the linter.
- Chromium and WebKit Playwright projects with isolated local database preparation.
- A pinned Bun version in `.bun-version`, kept in lockstep with `package.json` and the Dockerfile by `bun-version.test.ts`.

## Structure

- `src/app.tsx` contains the Hono routes and minimal Datastar example.
- `src/datastar.tsx` contains signal parsing and SSE helpers.
- `src/db.ts` and `src/schema.ts` provide the Drizzle/libSQL baseline.
- `src/db-instrument.ts` wraps the libSQL client so every query is a span.
- `src/logger/` is the logger; `src/std.ts` holds `Result` and `jsonParse`.
- `src/utils.ts` holds the shared class-merging, exhaustiveness, rate-limited fetch, and Temporal/Drizzle interop helpers.
- `src/dev-mode.tsx` provides hot reload and the Datastar signal inspector.
- `src/env.ts` is the only module that reads the process environment, and generates `.env`.
- `static/script.js` registers the custom Datastar browser plugins.
- `src/web/components/icon.tsx` is the typed boundary for Phosphor icons.
- `src/input.css` is compiled to the generated `static/styles.css`.
- `static/datastar-1.0.4.js` is a pinned, self-hosted Datastar bundle.
- `static/icons-2.1.2` contains the pinned, self-hosted Phosphor font.
- `tools/logview/` is the local log and trace viewer.
- `lint-rules/` holds the custom Oxlint rules and their fixtures; `lint-rules/rules.test.ts` asserts the lines each fixture reports.
- `DECISIONS.md` records judgement calls that are easy to accidentally undo.

Domain-specific scraping, train, cinema, network topology, and Home Assistant behavior is also excluded.
