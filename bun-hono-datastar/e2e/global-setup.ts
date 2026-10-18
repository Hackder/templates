import { spawnSync } from "node:child_process";
import { renameSync } from "node:fs";

// Builds the stylesheet the servers serve. Written next to it and renamed
// into place, so a run started meanwhile never serves a half-written file.
export default function globalSetup(): void {
  const building = `static/styles.css.${String(process.pid)}`;
  const build = spawnSync(
    "./node_modules/.bin/tailwindcss",
    ["-i", "./src/input.css", "-o", building, "--minify"],
    { stdio: "inherit" },
  );
  if (build.status !== 0) {
    throw new Error(`tailwindcss failed (${String(build.status)})`);
  }
  renameSync(building, "static/styles.css");
}
