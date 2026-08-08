import type { Context, HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import { HtmlEscapedCallbackPhase, resolveCallback } from "hono/utils/html";
import { type ZodType, z } from "zod/v4";

const jsonObjectSchema = z.record(z.string(), z.json());
type JsonObject = z.infer<typeof jsonObjectSchema>;

export async function readSignals(
  req: HonoRequest,
  getKey = "datastar",
): Promise<JsonObject | null> {
  let raw: unknown;

  try {
    if (req.method === "GET") {
      const datastar = req.query(getKey);
      if (datastar === undefined) {
        return null;
      }
      raw = JSON.parse(decodeURIComponent(datastar));
    } else {
      raw = await req.json();
    }
  } catch {
    throw new HTTPException(400, { message: "Invalid Datastar signals" });
  }

  const parsed = jsonObjectSchema.safeParse(raw);
  if (!parsed.success) {
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
