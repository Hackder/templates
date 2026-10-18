import { env } from "../env";

// The one login password, opt-in. With AUTH_PASSWORD_HASH set (its
// argon2id hash, from `bun run auth:hash`) everything is behind the login;
// without it the app is open to anyone who can reach it, and src/main.ts
// warns about that in production. Changing the password is a redeploy with
// a new hash.

/** Whether the password gate is on. */
export const PASSWORD_GATE = env.AUTH_PASSWORD_HASH !== undefined;

/** Longer input is rejected before hashing, so it cannot cost CPU. */
export const MAX_PASSWORD_LENGTH = 1024;

/** Constant-time comparison is Bun.password's job. */
export async function checkPassword(password: string): Promise<boolean> {
  const hash = env.AUTH_PASSWORD_HASH;
  if (
    hash === undefined ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return false;
  }
  return await Bun.password.verify(password, hash);
}
