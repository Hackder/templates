import { z } from "zod/v4";

const disabledString = z
  .string()
  .optional()
  .transform((value) =>
    value === "disabled" || value === "" ? undefined : value,
  );

const anyBool = z.preprocess(
  (value) => value === "true" || value === "1" || value === true,
  z.boolean(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CI: anyBool.default(false),
  TURSO_DATABASE_URL: z.string().default("file:./data/app.db"),
  TURSO_AUTH_TOKEN: disabledString,
  TURSO_REMOTE_SYNC_URL: disabledString,
  TURSO_SYNC_PULL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 1000),
  MOCK_TIME: disabledString,
});

export type AppEnvInput = z.input<typeof envSchema>;
export type AppEnv = Readonly<z.output<typeof envSchema>>;

// This module is the single intended boundary around ambient environment data.
// eslint-disable-next-line no-restricted-properties
export const env = envSchema.parse(process.env) as AppEnv;
