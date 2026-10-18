import { describe, expect, test } from "bun:test";
import { envSchema, passwordHashProblem, renderDefaultDotEnv } from "./env";

const HASH = "$argon2id$v=19$m=65536,t=2,p=1$c2FsdA$aGFzaA";

describe("passwordHashProblem", () => {
  test("accepts an argon2id hash, explains the broken forms", () => {
    expect(passwordHashProblem(HASH)).toBeNull();
    // The .env escapes pasted where nothing removes them.
    expect(passwordHashProblem(HASH.replaceAll("$", "\\$"))).toContain(
      "only for .env",
    );
    // What Bun's loader leaves of an unescaped hash: `$name` parts expanded.
    expect(passwordHashProblem("=19=65536,t=2,p=1")).toContain(
      "escaped as \\$",
    );
    expect(passwordHashProblem("$argon2id$v=19")).toContain("escaped as \\$");
  });
});

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
    expect(rendered).toContain("# HOST=127.0.0.1\n");
    expect(rendered).toContain("# CI=false\n");
    expect(rendered).toContain("# TURSO_AUTH_TOKEN=\n");
  });
});
