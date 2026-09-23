import type { Context, HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import { HtmlEscapedCallbackPhase, resolveCallback } from "hono/utils/html";
import { type ZodType, z } from "zod/v4";
import { logger } from "./logger";
import { jsonParse } from "./std";

const jsonObjectSchema = z.record(z.string(), z.json());
type JsonObject = z.infer<typeof jsonObjectSchema>;

/**
 * Whether the request came from Datastar, which sets this header on every
 * fetch it makes. Its response patches the page in place, so a redirect
 * would rewrite the browser's URL behind a partial update instead of being
 * followed as a navigation.
 */
export function isDatastarRequest(req: HonoRequest): boolean {
  return req.header("datastar-request") !== undefined;
}

export async function readSignals(
  req: HonoRequest,
  getKey = "datastar",
): Promise<JsonObject | null> {
  let raw;

  if (req.method === "GET" || req.method === "HEAD") {
    const datastar = req.query(getKey);
    if (datastar === undefined) {
      return null;
    }
    raw = jsonParse(decodeURIComponent(datastar));
  } else {
    raw = jsonParse(await req.text());
  }

  if (!raw.ok) {
    logger().set({ datastarSignalsErr: raw.error });
    throw new HTTPException(400, { message: "Invalid Datastar signals" });
  }

  const parsed = jsonObjectSchema.safeParse(raw.value);
  if (!parsed.success) {
    logger().set({ datastarSignalsErr: parsed.error });
    throw new HTTPException(400, { message: "Invalid Datastar signals" });
  }

  return parsed.data;
}

export async function readSignalsRequired<T>(
  req: HonoRequest,
  validator: ZodType<T>,
  getKey = "datastar",
): Promise<T> {
  const parsed = validator.safeParse((await readSignals(req, getKey)) ?? {});
  if (!parsed.success) {
    logger().set({ signalsParseErrors: parsed.error.message });
    throw new HTTPException(400, { message: "Invalid Datastar signals" });
  }
  return parsed.data;
}

export class DatastarEventSender {
  public constructor(public readonly api: SSEStreamingApi) {}

  public async patchElements(
    elements: string | Promise<string>,
    options?: { useViewTransition?: boolean },
  ): Promise<void> {
    const value = await render(elements);
    const dataLines =
      options?.useViewTransition === true ? ["useViewTransition true"] : [];

    await this.api.writeSSE({
      event: "datastar-patch-elements",
      data: [...dataLines, ...elementLines(value)].join("\n"),
    });
  }

  public async appendElements(
    elements: string | Promise<string>,
    selector = "body",
  ): Promise<void> {
    const value = await render(elements);
    await this.api.writeSSE({
      event: "datastar-patch-elements",
      data: [
        "mode append",
        `selector ${selector}`,
        ...elementLines(value),
      ].join("\n"),
    });
  }

  public async patchSignals(signals: JsonObject): Promise<void> {
    await this.api.writeSSE({
      event: "datastar-patch-signals",
      data: `signals ${JSON.stringify(signals)}`,
    });
  }

  public async executeScript(script: string): Promise<void> {
    await this.appendElements(
      `<script data-effect="el.remove()">${script}</script>`,
    );
  }

  public async redirect(url: string): Promise<void> {
    await this.executeScript(`window.location.href = ${JSON.stringify(url)};`);
  }
}

async function render(value: string | Promise<string>): Promise<string> {
  return resolveCallback(value, HtmlEscapedCallbackPhase.Stringify, false, {});
}

function elementLines(value: string): string[] {
  return value.split("\n").map((line) => `elements ${line}`);
}

export function datastarSse(
  context: Context,
  handler: (sender: DatastarEventSender) => Promise<void>,
): Response {
  return streamSSE(context, async (api) => {
    await handler(new DatastarEventSender(api));
  });
}

export function PushUrl({
  url,
  mode = "push",
  part = "query",
}: {
  url: string | URL;
  mode?: "push" | "replace";
  part?: "full" | "query";
}) {
  const method = mode === "push" ? "pushState" : "replaceState";
  // The origin is replaced with the browser's own: behind a TLS-terminating
  // proxy (e.g. Cloudflare) the server sees plain HTTP, and pushState refuses
  // a URL whose origin differs from the page's.
  const content = `
    (() => {
      const target = new URL(${JSON.stringify(url.toString())}, "http://localhost");
      target.protocol = window.location.protocol;
      target.host = window.location.host;
      target.hash = window.location.hash;
      ${part === "query" ? "target.pathname = window.location.pathname;" : ""}
      const value = target.toString();
      if (window.location.href !== value) {
        history.${method}({ url: value }, "", value);
      } else if (history.state?.url !== value) {
        // The URL is already the target one — typically the very first render
        // of a freshly loaded page. Skipping the history call here would leave
        // that entry without a state, and the popstate handlers restore the
        // page by re-fetching \`history.state.url\`, so going back to a
        // stateless entry would change the URL while leaving the previously
        // patched DOM on screen. Stamp the url into the existing entry.
        // Always a replace, never a push: nothing new happened, we are only
        // labelling the entry we are on. The state check keeps it idempotent,
        // since this script re-renders with every SSE patch.
        history.replaceState({ url: value }, "", value);
      }
    })();
  `;
  return (
    <script
      data-effect="el.remove()"
      dangerouslySetInnerHTML={{ __html: content }}
    ></script>
  );
}
