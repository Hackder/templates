import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

for (const ruleName of [
  "no-consecutive-parameters-same-type",
  "no-direct-phosphor-icons",
  "no-multiple-positional-booleans",
]) {
  test(`${ruleName} is synchronized with the template`, async () => {
    const canonical = await readFile(
      new URL(`../rules/${ruleName}.js`, import.meta.url),
      "utf8",
    );
    const template = await readFile(
      new URL(
        `../../bun-hono-datastar/eslint-rules/${ruleName}.js`,
        import.meta.url,
      ),
      "utf8",
    );

    expect(template).toBe(canonical);
  });
}
