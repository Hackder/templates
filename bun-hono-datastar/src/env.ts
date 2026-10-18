import { z } from "zod/v4";

const stringBool = z.preprocess((val) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This is a parsing function
  if (typeof val === "string") {
    const lower = val.toLowerCase();
    return lower === "true" || lower === "1";
  }
  return val;
}, z.boolean());

export const envSchema = z.object({
  // Deployment
  // Unset means production: the dev overlay, hot reload and the generated
  // .env need an explicit "development" (`bun run dev`); bun test and the
  // E2E server run as "test".
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("production")
    .describe("Deployment"),

  PORT: z.coerce.number().default(3000).describe("Port the app listens on"),

  // Loopback by default, so a dev server is not reachable from the network
  // unless asked for. The Dockerfile sets 0.0.0.0.
  HOST: z
    .string()
    .min(1)
    .default("127.0.0.1")
    .describe(
      "Address the app listens on: 127.0.0.1 only loopback, 0.0.0.0 every interface",
    ),

  CI: stringBool
    .default(false)
    .describe("Set by CI providers; forbids test.only and trims E2E browsers"),

  // Database
  TURSO_DATABASE_URL: z
    .string()
    .default("file:./data/app.db")
    .describe("Database: local sqlite file or a remote Turso URL"),
  TURSO_AUTH_TOKEN: z
    .string()
    .optional()
    .describe("Required for remote Turso databases"),
  TURSO_REMOTE_SYNC_URL: z
    .string()
    .optional()
    .transform((v) => {
      if (v === "disabled") {
        return undefined;
      }
      return v;
    })
    .describe('Remote Turso URL to sync the local replica from, or "disabled"'),
  TURSO_SYNC_PULL_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(60 * 1000)
    .or(z.literal("disabled"))
    .transform((val) => {
      if (val === "disabled") {
        return undefined;
      }
      return val;
    })
    .describe(
      'How often the local replica pulls from the remote, or "disabled"',
    ),

  // Logging
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info")
    .describe("Logging"),

  // NDJSON log file consumed by the viewer in tools/logview. Truncated on
  // every app start; set to "disabled" to turn it off.
  LOG_JSON_FILE: z
    .string()
    .default("logs/log.ndjson")
    .transform((v) => {
      if (v === "disabled") {
        return undefined;
      }
      return v;
    })
    .describe(
      'NDJSON log file consumed by tools/logview, truncated on every start, or "disabled"',
    ),

  LOGVIEW_PORT: z.coerce
    .number()
    .default(4600)
    .describe("Port of the log viewer in tools/logview"),

  // Axiom: spans and log events are shipped as OpenTelemetry OTLP when a
  // token is set. One dataset per signal, as Axiom requires.
  AXIOM_TOKEN: z
    .string()
    .optional()
    .describe(
      "Axiom API token with ingest permission; unset disables shipping logs and traces",
    ),
  AXIOM_URL: z
    .url()
    .default("https://us-east-1.aws.edge.axiom.co")
    .describe(
      "Axiom ingest origin for the organisation's edge deployment (Settings > General): US East by default, https://eu-central-1.aws.edge.axiom.co for EU",
    ),
  AXIOM_TRACES_DATASET: z
    .string()
    .default("bun-hono-datastar-traces")
    .describe("Axiom dataset receiving spans"),
  AXIOM_LOGS_DATASET: z
    .string()
    .default("bun-hono-datastar-logs")
    .describe("Axiom dataset receiving log events"),
  AXIOM_SERVICE_NAME: z
    .string()
    .default("bun-hono-datastar")
    .describe("service.name resource attribute on everything shipped to Axiom"),

  // Dev only
  MOCK_TIME: z.coerce
    .date()
    .optional()
    .describe("Dev only: freeze the app clock at this ISO date"),
});

export type AppEnvInput = z.input<typeof envSchema>;
export type AppEnvOutput = Readonly<z.output<typeof envSchema>>;

// Keys written uncommented into a generated `.env`. Everything else is written
// as a commented-out line showing its default. Currently nothing is strictly
// required, so this is empty.
type EnvKey = keyof AppEnvInput;
const requiredKeys = new Set<EnvKey>();

// Renders the contents of a `.env` file with every variable from `envSchema`,
// its description and its default value.
export function renderDefaultDotEnv(): string {
  const defaults = envSchema.parse({});
  const { properties = {} } = z.toJSONSchema(envSchema, {
    io: "input",
    unrepresentable: "any",
  });
  const lines: string[] = [
    "# Generated from src/env.ts. Uncomment a line to override its default.",
    "",
  ];
  for (const key of envSchema.keyof().options) {
    const property = properties[key];
    // A JSON schema property may be the literal `true`/`false` schema.
    const description =
      property === undefined || property === true || property === false
        ? undefined
        : property.description;
    if (description !== undefined && description !== "") {
      lines.push(`# ${description}`);
    }
    const value = defaults[key];
    const rendered = value === undefined ? "" : String(value);
    const prefix = requiredKeys.has(key) ? "" : "# ";
    lines.push(`${prefix}${key}=${rendered}`);
    lines.push("");
  }
  return lines.join("\n");
}

// Creates `.env` next to `package.json` from the defaults when it is missing.
// Called on app start in development so a fresh checkout runs without setup.
export async function ensureDotEnv(): Promise<void> {
  const dotEnv = Bun.file(new URL("../.env", import.meta.url));
  if (await dotEnv.exists()) {
    return;
  }
  await Bun.write(dotEnv, renderDefaultDotEnv());
  console.log("Created .env with default values");
}

// oxlint-disable-next-line no-restricted-properties
export const env = Object.freeze(envSchema.parse(process.env));
