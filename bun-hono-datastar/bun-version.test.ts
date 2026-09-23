import { describe, expect, test } from "bun:test";
import packageJson from "./package.json";

// `.bun-version` is the single source of truth for the pinned Bun release.
// Bun itself, and `oven-sh/setup-bun` in CI, read it directly. The other two
// copies exist because their consumers cannot read that file:
//   - `packageManager` in package.json: makes pnpm/npm/yarn refuse to run
//     ("This project is configured to use bun"). Per spec it must be
//     `name@version`, so it has to carry the version too.
//   - `FROM oven/bun:<version>` in the Dockerfile: `FROM` runs before any
//     `COPY`, so the build cannot read `.bun-version`.
// This test keeps all copies in lockstep.

const bunVersionFile = (await Bun.file(".bun-version").text()).trim();
const dockerfile = await Bun.file("Dockerfile").text();

describe("pinned Bun version", () => {
  test(".bun-version is an exact semver", () => {
    expect(bunVersionFile).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("package.json packageManager matches .bun-version", () => {
    expect(packageJson.packageManager).toBe(`bun@${bunVersionFile}`);
  });

  test("package.json installs correct bun-types", () => {
    expect(packageJson.devDependencies["bun-types"]).toBe(bunVersionFile);
  });

  test("Dockerfile base image matches .bun-version", () => {
    const fromLines = dockerfile.match(/^FROM oven\/bun:.*$/gm) ?? [];
    expect(fromLines).toEqual([`FROM oven/bun:${bunVersionFile} AS base`]);
  });

  test("package.json has no engines.bun (Bun does not enforce it)", () => {
    expect("engines" in packageJson).toBe(false);
  });
});
