import { spawnSync } from "node:child_process";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../src/auth/password-limits";

// `bun run auth:hash [password]`: prints the `.env` line setting
// AUTH_PASSWORD_HASH to the argon2id hash of the login password. Without an
// argument it reads the password from stdin: typed without echo at a
// terminal, or piped in. An argument ends up in the shell history, so prefer
// typing it.
//
// The line alone goes to stdout; the hints go to stderr, so
// `bun run auth:hash < file >> .env` pipes cleanly.

async function readHidden(): Promise<string> {
  process.stderr.write("Password: ");
  // The terminal stops echoing while the password is typed.
  spawnSync("stty", ["-echo"], { stdio: "inherit" });
  try {
    for await (const line of console) {
      return line;
    }
    return "";
  } finally {
    spawnSync("stty", ["echo"], { stdio: "inherit" });
    process.stderr.write("\n");
  }
}

async function readPassword(): Promise<string> {
  const argument = process.argv[2];
  if (argument !== undefined) {
    return argument;
  }
  if (process.stdin.isTTY) {
    return await readHidden();
  }
  return (await Bun.stdin.text()).replace(/\r?\n$/, "");
}

const password = await readPassword();
if (
  password.length < MIN_PASSWORD_LENGTH ||
  password.length > MAX_PASSWORD_LENGTH
) {
  process.stderr.write(
    `Use between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters; this one password guards the whole app.\n`,
  );
  process.exitCode = 1;
} else {
  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
  // Bun's .env loader expands `$name` even in single quotes; `\$` is a
  // literal `$` in every quoting style.
  process.stdout.write(`AUTH_PASSWORD_HASH='${hash.replaceAll("$", "\\$")}'\n`);
  process.stderr.write(
    [
      "",
      "Paste the line above into .env as is. In the hosting environment set",
      `AUTH_PASSWORD_HASH to the hash without the escapes: ${hash}`,
      "",
    ].join("\n"),
  );
}
