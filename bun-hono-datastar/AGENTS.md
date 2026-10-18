# Repository Conventions

This file captures the conventions used in this codebase. Read it before making changes.

## We collaborate

The user is there to collaborate with you. If you run into issues, like
permission, difficult scraping site etc. You can ask the user for help, or
direction. Present the options and let the user investigate. They can open the
site, interact with it, see it and tell you what to do. This applies to
everything. Even for UI changes. Just ask the user to look and see. If you are
not sure about some architectural code choice, ask the user, present options
and collaborate with them to find the best solution.

For UI always ask the user to look and see if they like it. Don't try to take screenshots or similar
complicated things. Just ask the user to look and see.

## Stack

Bun · Hono · Datastar SSR (server-rendered JSX) · Drizzle ORM · Turso/libSQL · Tailwind · Temporal API

Tooling: TypeScript 7 (`tsc`), Oxlint (`.oxlintrc.json`, type-aware via `oxlint-tsgolint`), Oxfmt (`.oxfmtrc.json`).

## Decisions

`DECISIONS.md` records important product decisions and load-bearing
architecture choices agreed with the user. Read it before changing
user-facing or infrastructure behaviour.

Add an entry only for a decision of that weight that a future contributor
would otherwise plausibly get wrong or undo, and only once the user agreed
to it: a heading, the decision and its reason, a few lines in all.

Do not add entries for: how something works, what was tried, test inventories
and UI details do not belong there: a non-obvious invariant goes in a comment
at the code it constrains, everything else nowhere. Code comments explain in
place rather than cite `DECISIONS.md`.

## Before You Call Anything Done

Run the full check (typecheck, lint, format check, unit tests, Tailwind build):

```sh
bun run check
```

Everything must pass!

## Commands

Execute everything repo command with bun directly. Don't use npx, bunx, pnpm dlx etc. Only run the commands
using `bun run <command>`. This is already preapproved, you won't run into permission issues or similar thing.

## Assertions

- We like assertions, we should use assertions from "node:assert/strict" (the `local/assert-strict-import` rule enforces the import).
- If there is a local piece of code that a reader would assume some invariant about — for example, get or insert a list of rows into the database, which should obviously return as many rows as were passed in — assert it. It does not depend on any external inputs. It's an internal invariant.
- If there is anything that could realistically happen during normal operation — user provided data, data from an external service etc. — we don't assert that. Never assert that. Always validate external data with zod/v4 and handle the errors properly.
- The assertion message should explain why the thing that it asserts is impossible. Not just restate in words the condition it checks.
- If there is a way to avoid assertion by making the types better, we should do that. In this project we validate at input boundary and then trust typescript.
  Examples of ways to avoid assertions while still keeping the same guarantees:
  - If there is a length check and right below an index access, for example arr[0], we could -> check if `if (arr[0] !== undefined)` or if we need small length check maybe `const [first, second, third] = arr`

## Commit Messages

Keep commit messages short, imperative, and descriptive — one line is usually enough.

```
# Good
fix: handle missing timezone in scraper
feat: add cinema filter to URL state

# Bad
Fixed some things
Updated code as per review comments
```

Do **not** add `Co-Authored-By`, `Claude-Session`, or any other trailer lines. Keep the commit history clean.

## Exhaustive Checks on Discriminated Unions

Model variant data as TypeScript discriminated unions and always handle every variant. In the final `else` / `default` branch, call `exhaustiveCheck(value)` from `src/utils.ts`:

```ts
import { exhaustiveCheck } from "../utils";

if (entry.type === "cinema") {
  // ...
} else if (entry.type === "level") {
  // ...
} else {
  exhaustiveCheck(entry); // compile error if a new variant is added and not handled
}
```

Why: TypeScript narrows `entry` to `never` at the `exhaustiveCheck` call site. If you later add a new union member and forget to handle it, the build fails — you cannot silently miss a case at runtime.

Never write a bare `else { }` or `default: break` that swallows unhandled variants.

## Code Organisation — Co-locate Types with Their Functions

Place a function's input/output types **directly above** the function that uses them. Do not group all types in a separate block at the top or bottom of the file.

```ts
// Good — reader sees the shape alongside the implementation
type FetchOptions = {
  concurrency: number;
  rps: number;
};
export function createLimitedFetch(opts: FetchOptions) { ... }

// Bad — forces the reader to scroll to a "types" section to understand the function
```

## Custom Lint Rules

Project-specific rules live in `lint-rules/` as an Oxlint JS plugin (`lint-rules/plugin.js`, registered as `local/*` in `.oxlintrc.json`). Each rule has a fixture in `lint-rules/fixtures/` and `lint-rules/rules.test.ts` asserts the exact lines it reports — add a fixture case when adding or changing a rule. `lint-rules/anti-slop/` is a vendored third-party plugin; do not edit or reformat it.

Oxlint JS plugins are syntax-only (no TypeScript type checker), so `no-consecutive-parameters-same-type` and `no-multiple-positional-booleans` compare written type annotations; parameters whose type is only inferred are not checked.

NEVER suppress a rule without explicit user approval!

## Mobile Safari Performance

Avoid large CSS `filter: blur(...)` layers, especially fixed or viewport-sized elements. Mobile WebKit can spend many seconds rendering their offscreen surfaces even after the server response and resources have loaded. Use radial gradients for ambient background glows instead.

## Reuse Helpers from `src/utils.ts`

Before writing a new helper, check `src/utils.ts`, `src/std.ts` and existing modules. Key helpers:

| Helper                                     | When to use                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `cn(...classes)`                           | Merging Tailwind class lists                                              |
| `createLimitedFetch({ concurrency, rps })` | Any external HTTP request                                                 |
| `unaccent(str)`                            | Accent-insensitive string comparison or search matching                   |
| `exhaustiveCheck(value)`                   | Final branch of any discriminated-union switch / if-else                  |
| `Semaphore`                                | Low-level concurrency control (prefer `createLimitedFetch` for HTTP)      |
| `instantToDateForInteropWithDrizzle(i)`    | Passing a `Temporal.Instant` into a Drizzle `timestamp` column            |
| `jsonParse(text)` (`src/std.ts`)           | Parsing JSON into a `Result` instead of throwing (`JSON.parse` is linted) |

**One limiter instance per external API.** Instantiate at module scope and share it across all calls to that API. If each call creates its own limiter, the per-second cap is not enforced across concurrent callers.

```ts
// Good — single instance shared across all functions in this module
const limitedFetch = createLimitedFetch({ concurrency: 3, rps: 5 });

export async function fetchUsers() { ... limitedFetch(...) ... }
export async function fetchOrders() { ... limitedFetch(...) ... }
```

## Dependencies and Type Declarations

Prefer the official types package over a hand-written shim:

```sh
bun add -D @types/<pkg>
```

Only write a local `.d.ts` file when no `@types/<pkg>` package exists for the library. Hand-written shims drift from the real API and are hard to maintain.
