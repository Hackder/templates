import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";

type Diagnostic = { line: number; rule: string };

const lintOutputSchema = z.object({
  diagnostics: z.array(
    z.object({
      filename: z.string(),
      code: z.string(),
      labels: z.array(z.object({ span: z.object({ line: z.number() }) })),
    }),
  ),
});

async function lintFixtures(): Promise<Map<string, Diagnostic[]>> {
  const proc = Bun.spawn(
    [
      "bun",
      "x",
      "oxlint",
      "-c",
      "lint-rules/fixtures.oxlintrc.json",
      "--format=json",
      "lint-rules/fixtures",
    ],
    { cwd: `${import.meta.dirname}/..`, stdout: "pipe", stderr: "pipe" },
  );
  const output = await new Response(proc.stdout).text();
  const { diagnostics } = lintOutputSchema.parse(JSON.parse(output));

  const byFile = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const file = diagnostic.filename.replace(/^.*\//, "");
    const entries = byFile.get(file) ?? [];
    entries.push({
      line: diagnostic.labels[0]?.span.line ?? 0,
      rule: diagnostic.code.replace(/^(.*)\((.*)\)$/, "$1/$2"),
    });
    byFile.set(file, entries);
  }
  for (const entries of byFile.values()) {
    entries.sort((a, b) => a.line - b.line);
  }
  return byFile;
}

const expected = {
  "assert-strict-import": {
    file: "assert-strict-import.ts",
    lines: [2, 3, 4, 5, 6, 7],
  },
  "enforce-delete-with-where": { file: "enforce-where.ts", lines: [6] },
  "enforce-update-with-where": { file: "enforce-where.ts", lines: [7, 8] },
  "no-complex-if-condition": {
    file: "no-complex-if-condition.ts",
    lines: [22, 25, 28, 31, 34, 37, 41, 42],
  },
  "no-consecutive-parameters-same-type": {
    file: "no-consecutive-parameters-same-type.ts",
    lines: [5, 9, 17, 23],
  },
  "no-multiple-positional-booleans": {
    file: "no-multiple-positional-booleans.ts",
    lines: [5, 9, 13, 17, 21, 25],
  },
  "no-css-locators": { file: "no-css-locators.ts", lines: [2, 3, 4, 5] },
  "no-date": { file: "no-date.ts", lines: [1, 2, 3, 4] },
  "no-import-meta-env": { file: "no-import-meta-env.ts", lines: [1] },
  "no-json-parse": { file: "no-json-parse.ts", lines: [1, 2, 3, 4, 5] },
  "no-import-extensions": {
    file: "no-import-extensions.ts",
    lines: [2, 3, 4, 5, 6],
  },
  "zod-v4-import": { file: "zod-v4-import.ts", lines: [2, 3, 4, 5] },
  "no-string-style": { file: "no-string-style.tsx", lines: [2, 3, 4] },
  "no-direct-phosphor-icons": {
    file: "no-direct-phosphor-icons.tsx",
    lines: [2, 6, 10],
  },
} satisfies Record<string, { file: string; lines: number[] }>;

describe("local lint rules", () => {
  const results = lintFixtures();

  for (const [rule, { file, lines }] of Object.entries(expected)) {
    test(rule, async () => {
      const diagnostics = ((await results).get(file) ?? []).filter(
        (diagnostic) => diagnostic.rule === `local/${rule}`,
      );
      expect(diagnostics).toEqual(
        lines.map((line) => ({ line, rule: `local/${rule}` })),
      );
    });
  }
});
