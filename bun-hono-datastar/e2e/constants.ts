// Each worker's server keeps its database and log in a directory of its own
// under here (e2e/fixtures.ts).
export const E2E_DATA_DIR = "e2e/.data";
export const E2E_MOCK_NOW = "2026-08-09T12:00:00Z";

// The password of the gated flow (e2e/login.e2e.ts) and its argon2id hash,
// from `bun run auth:hash` (Playwright runs under Node, without
// Bun.password).
export const E2E_PASSWORD = "e2e gate password 2026";
export const E2E_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$UjHQhVaGXOJA/TTY0hp8tBm7lhpIWJQJQBqIje1GDxA$2EO7kQfk/zWEDdDUxpbuJlMUQvV1ZUiRnLuCNEprmRs";
