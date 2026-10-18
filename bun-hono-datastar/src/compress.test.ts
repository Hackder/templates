import { describe, expect, test } from "bun:test";
import {
  brotliDecompressSync,
  createBrotliDecompress,
  createGunzip,
  gunzipSync,
  type BrotliDecompress,
  type Gunzip,
} from "node:zlib";
import { Hono } from "hono";
import {
  type CompressionEncoding,
  createEventEncoder,
  gzipCompress,
} from "./compress";

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
  test("picks the encoding the browser prefers, Brotli on a tie", async () => {
    const cases: [string, string | null, (bytes: Buffer) => Buffer][] = [
      ["gzip, br", "br", brotliDecompressSync],
      ["br;q=0.5, gzip;q=1", "gzip", gunzipSync],
      ["br;q=0, gzip;q=0", null, (bytes) => bytes],
    ];
    for (const [acceptEncoding, expected, decode] of cases) {
      const response = await compressionApp().request("/", {
        headers: { "accept-encoding": acceptEncoding },
      });
      const encoding = response.headers.get("content-encoding");
      expect({ acceptEncoding, encoding }).toEqual({
        acceptEncoding,
        encoding: expected,
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(decode(bytes).toString()).toBe(body);
      if (encoding !== null) {
        expect(response.headers.get("vary")).toBe("Accept-Encoding");
      }
    }
  });

  test("leaves event streams uncompressed", async () => {
    const app = new Hono();
    app.use("*", gzipCompress());
    app.get("/events", (context) => {
      context.header("content-type", "text/event-stream");
      return context.body("data: first\n\n");
    });

    const response = await app.request("/events", {
      headers: { "accept-encoding": "br, gzip" },
    });

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe("data: first\n\n");
  });
});

/** A page-sized event that changes a little between renders. */
function renderEvent(version: number): string {
  const rows = Array.from(
    { length: 2000 },
    (_, row) =>
      `data: elements <li id="item-${row}">Item ${row} added ${(row * 7) % 30} days ago</li>`,
  );
  return `event: datastar-patch-elements\ndata: elements <p>render ${version}</p>\n${rows.join("\n")}\n\n`;
}

/**
 * One decompressor for the whole stream, like the browser's. `decode` gives
 * what one chunk decodes to on its own, so an event that needed later bytes
 * would come back short.
 */
class StreamDecoder {
  readonly #decompressor: BrotliDecompress | Gunzip;
  #text = "";

  public constructor(encoding: CompressionEncoding) {
    this.#decompressor =
      encoding === "br" ? createBrotliDecompress() : createGunzip();
    this.#decompressor.on("data", (chunk: Buffer) => {
      this.#text += chunk.toString();
    });
  }

  public async decode(chunk: Uint8Array): Promise<string> {
    this.#decompressor.write(chunk);
    await new Promise<void>((resolve) => {
      this.#decompressor.flush(() => {
        resolve();
      });
    });
    const decoded = this.#text;
    this.#text = "";
    return decoded;
  }
}

describe("createEventEncoder", () => {
  for (const encoding of ["br", "gzip"] as const) {
    test(`${encoding}: every event decodes on arrival`, async () => {
      const encoder = createEventEncoder(encoding);
      const decoder = new StreamDecoder(encoding);
      const sizes = [];

      for (const version of [1, 2, 3, 4]) {
        const event = renderEvent(version);
        const bytes = await encoder.encode(event);
        sizes.push(bytes.byteLength);
        expect(await decoder.decode(bytes)).toBe(event);
      }
      encoder.close();

      // Brotli's window holds the previous render, so a repeat costs little;
      // gzip's 32KB window does not reach back that far.
      if (encoding === "br") {
        const [first, ...later] = sizes;
        expect(first).toBeGreaterThan(0);
        for (const size of later) {
          expect(size * 50).toBeLessThan(first ?? 0);
        }
      }
    });
  }

  test("concurrent events stay whole and in order", async () => {
    const encoder = createEventEncoder("br");
    const decoder = new StreamDecoder("br");
    const events = [renderEvent(1), "event: a\ndata: x\n\n", renderEvent(2)];

    const encoded = await Promise.all(
      events.map(async (event) => await encoder.encode(event)),
    );
    encoder.close();

    for (const [index, bytes] of encoded.entries()) {
      expect(await decoder.decode(bytes)).toBe(events[index] ?? "");
    }
  });
});
