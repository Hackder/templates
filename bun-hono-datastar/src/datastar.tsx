import type { Context, HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import { HtmlEscapedCallbackPhase, resolveCallback } from "hono/utils/html";
import { type ZodType, z } from "zod/v4";
import {
  createEventEncoder,
  type EventEncoder,
  preferredEncoding,
} from "./compress";
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
export function isDatastarRequest(req: Request): boolean {
  return req.headers.has("datastar-request");
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

interface SseEvent {
  event: string;
  dataLines: string[];
}

/**
 * Sends Datastar events on an event stream. The only way out is `send`,
 * which hands each whole event to the encoder and writes what it returns
 * in one write, so no bytes reach the browser beside the encoder.
 */
export class DatastarEventSender {
  readonly #api: SSEStreamingApi;
  readonly #encoder: EventEncoder;

  public constructor(api: SSEStreamingApi, encoder: EventEncoder) {
    this.#api = api;
    this.#encoder = encoder;
  }

  public get aborted(): boolean {
    return this.#api.aborted;
  }

  public onAbort(listener: () => void): void {
    this.#api.onAbort(listener);
  }

  public async patchElements(
    elements: string | Promise<string>,
    options?: { useViewTransition?: boolean },
  ): Promise<void> {
    const value = await render(elements);
    const dataLines =
      options?.useViewTransition === true ? ["useViewTransition true"] : [];

    await this.#send({
      event: "datastar-patch-elements",
      dataLines: [...dataLines, ...elementLines(value)],
    });
  }

  public async appendElements(
    elements: string | Promise<string>,
    selector = "body",
  ): Promise<void> {
    const value = await render(elements);
    await this.#send({
      event: "datastar-patch-elements",
      dataLines: [
        "mode append",
        `selector ${selector}`,
        ...elementLines(value),
      ],
    });
  }

  public async patchSignals(signals: JsonObject): Promise<void> {
    await this.#send({
      event: "datastar-patch-signals",
      dataLines: [`signals ${JSON.stringify(signals)}`],
    });
  }

  /**
   * An event of our own, for the browser's watcher of that name (see
   * `watcher` in static/script.js): Datastar hands every event named
   * `datastar-*` to the watcher registered under that name, its data lines
   * as `key value` arguments.
   */
  public async watcherEvent(
    event: `datastar-${string}`,
    args: Record<string, string>,
  ): Promise<void> {
    await this.#send({
      event,
      dataLines: Object.entries(args).map(([key, value]) => `${key} ${value}`),
    });
  }

  async #send({ event, dataLines }: SseEvent): Promise<void> {
    const text = `event: ${event}\n${dataLines.map((line) => `data: ${line}`).join("\n")}\n\n`;
    // One write per event: the event goes out whole, as one chunk.
    await this.#api.write(await this.#encoder.encode(text));
  }
}

async function render(value: string | Promise<string>): Promise<string> {
  return resolveCallback(value, HtmlEscapedCallbackPhase.Stringify, false, {});
}

function elementLines(value: string): string[] {
  return value.split(/\r\n|\r|\n/u).map((line) => `elements ${line}`);
}

export function datastarSse(
  context: Context,
  handler: (sender: DatastarEventSender) => Promise<void>,
): Response {
  const encoding = preferredEncoding(
    context.req.header("accept-encoding") ?? "",
  );
  if (encoding !== undefined) {
    context.header("Content-Encoding", encoding);
  }
  context.header("Vary", "Accept-Encoding");
  return streamSSE(context, async (api) => {
    const encoder = createEventEncoder(encoding);
    try {
      await handler(new DatastarEventSender(api, encoder));
    } finally {
      // After the handler, never on abort: an encode in flight would never
      // settle if its compressor went away under it.
      encoder.close();
    }
  });
}
