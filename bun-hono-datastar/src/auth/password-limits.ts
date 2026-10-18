// The login password's length limits. Free of the environment, unlike
// ./password: `bun run auth:hash` (tools/auth-hash.ts) uses them, and it
// must run while .env still holds a bad AUTH_PASSWORD_HASH, since that is
// what the env error tells the user to run.

/** Shorter is refused by `auth:hash`: this one password guards the app. */
export const MIN_PASSWORD_LENGTH = 12;

/** Longer input is rejected before hashing, so it cannot cost CPU. */
export const MAX_PASSWORD_LENGTH = 1024;
