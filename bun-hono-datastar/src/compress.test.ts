import { describe, expect, test } from "bun:test";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { Hono } from "hono";
import { gzipCompress } from "./compress";

const body = "Streaming cinema listings. ".repeat(100);

function compressionApp(): Hono {
  const app = new Hono();
  app.use("*", gzipCompress());
  app.get("/", (context) => {
    context.header("content-type", "text/plain");
    return context.body(body);
  });
  return app;
}

describe("gzipCompress", () => {
  test("prefers Brotli when qualities are equal", async () => {
    const response = await compressionApp().request("/", {
      headers: { "accept-encoding": "gzip, br" },
    });

    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(brotliDecompressSync(await response.arrayBuffer()).toString()).toBe(
      body,
    );
  });

  test("uses gzip when it has a higher quality", async () => {
    const response = await compressionApp().request("/", {
      headers: { "accept-encoding": "br;q=0.5, gzip;q=1" },
    });

    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync(await response.arrayBuffer()).toString()).toBe(body);
  });

  test("does not use encodings with zero quality", async () => {
    const response = await compressionApp().request("/", {
      headers: { "accept-encoding": "br;q=0, gzip;q=0" },
    });

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe(body);
  });

  test("flushes Brotli output before an event stream closes", async () => {
    let sourceClosed = false;
    const app = new Hono();
    app.use("*", gzipCompress());
    app.get("/events", (context) => {
      context.header("content-type", "text/event-stream");
      return context.body(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: first\n\n"));
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode("data: second\n\n"));
              sourceClosed = true;
              controller.close();
            }, 100);
          },
        }),
      );
    });

    const response = await app.request("/events", {
      headers: { "accept-encoding": "br" },
    });
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("Expected a compressed response body");
    }

    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(sourceClosed).toBe(false);
    if (first.value === undefined) {
      throw new Error("Expected compressed bytes before source closure");
    }

    const chunks = [first.value];
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunks.push(next.value);
    }

    expect(brotliDecompressSync(Buffer.concat(chunks)).toString()).toBe(
      "data: first\n\ndata: second\n\n",
    );
  });
});
