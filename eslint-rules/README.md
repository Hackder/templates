# Custom ESLint Rules

This directory is the repository-level home for custom ESLint rules and their tests. Rules remain copied into each template so generated projects are self-contained.

## Adding A Rule

1. Add the canonical implementation under `rules/`.
2. Add a `RuleTester` suite under `tests/` with passing and failing examples.
3. Copy rules used by a template into that template's `eslint-rules/` directory.
4. Add a synchronization assertion to `tests/template-sync.test.js`.
5. Run `bun run check` from this directory.

Repository CI runs this package independently from the templates.
