import { MAX_PASSWORD_LENGTH } from "./password-limits";

// The one login password, opt-in. With AUTH_PASSWORD_HASH set (its
// argon2id hash, from `bun run auth:hash`) everything is behind the login;
// without it the app is open to anyone who can reach it, and src/main.ts
// warns about that in production. Changing the password is a redeploy with
// a new hash.

/** Whether `password` is the one `hash` was made from. Constant-time
 * comparison is Bun.password's job. */
export async function checkPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  return await Bun.password.verify(password, hash);
}
