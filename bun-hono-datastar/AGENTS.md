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

## Commands

Execute everything repo command with bun directly. Don't use npx, bunx, pnpm dlx etc. Only run the commands
using `bun run <command>`. This is already preapproved, you won't run into permission issues or similar thing.

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

## Mobile Safari Performance

Avoid large CSS `filter: blur(...)` layers, especially fixed or viewport-sized elements. Mobile WebKit can spend many seconds rendering their offscreen surfaces even after the server response and resources have loaded. Use radial gradients for ambient background glows instead.
