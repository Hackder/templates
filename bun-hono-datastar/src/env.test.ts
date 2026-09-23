import { describe, expect, test } from "bun:test";
import { envSchema, renderDefaultDotEnv } from "./env";

describe("renderDefaultDotEnv", () => {
  const rendered = renderDefaultDotEnv();
  const assignments = rendered
    .split("\n")
    .filter((line) => /^(# )?[A-Z_]+=/.test(line));

  test("lists every schema key exactly once", () => {
    const keys = assignments.map(
      (line) => line.replace(/^# /, "").split("=")[0],
    );
    expect(keys).toEqual(envSchema.keyof().options);
  });

  test("comments out every key while nothing is required", () => {
    for (const line of assignments) {
      expect(line).toStartWith("# ");
    }
  });

  test("renders defaults", () => {
    expect(rendered).toContain("# TURSO_DATABASE_URL=file:./data/app.db\n");
    expect(rendered).toContain("# PORT=3000\n");
    expect(rendered).toContain("# CI=false\n");
    expect(rendered).toContain("# TURSO_AUTH_TOKEN=\n");
  });
});
