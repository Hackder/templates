import { Readable, type Transform } from "node:stream";
import { constants, createBrotliCompress, createGzip } from "node:zlib";
import type { MiddlewareHandler } from "hono";

const compressible = /^(text\/|application\/(json|javascript)|image\/svg)/;

type BunResponseConstructor = new (
  body?: Bun.BodyInit | null,
  init?: ResponseInit,
) => Response;

// SAFETY: Bun's Response accepts async iterables such as Node Readable streams, but lib.dom's constructor type omits that Bun extension.
const BunResponse = Response as BunResponseConstructor;

export type CompressionEncoding = "br" | "gzip";

function acceptedQuality(
  header: string,
  encoding: CompressionEncoding,
): number {
  let wildcardQuality = 0;

  for (const entry of header.split(",")) {
    const [rawName, ...parameters] = entry.split(";");
    const name = rawName?.trim().toLowerCase();
    let quality = 1;

    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*(\d(?:\.\d+)?)\s*$/iu.exec(parameter);
      if (match === null) {
        continue;
      }
      const parsed = Number(match[1]);
      quality = parsed >= 0 && parsed <= 1 ? parsed : 0;
    }

    if (name === encoding) {
      return quality;
    }
    if (name === "*") {
      wildcardQuality = quality;
    }
  }

  return wildcardQuality;
}

export function preferredEncoding(
  header: string,
): CompressionEncoding | undefined {
  const brotliQuality = acceptedQuality(header, "br");
  const gzipQuality = acceptedQuality(header, "gzip");

  if (brotliQuality <= 0 && gzipQuality <= 0) {
    return undefined;
  }
  return brotliQuality >= gzipQuality ? "br" : "gzip";
}

function createCompressor(encoding: CompressionEncoding): Transform {
  if (encoding === "br") {
    return createBrotliCompress({
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: 4,
      },
    });
  }
  return createGzip();
}

export function gzipCompress(): MiddlewareHandler {
  return async (context, next) => {
    await next();
    const response = context.res;
    const encoding = preferredEncoding(
      context.req.header("accept-encoding") ?? "",
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (
      response.body === null ||
      response.headers.has("content-encoding") ||
      encoding === undefined ||
      !compressible.test(contentType) ||
      // Event streams compress themselves, one flushed write per event
      // (`createEventEncoder`); piping them through here would split events.
      contentType.startsWith("text/event-stream")
    ) {
      return;
    }

    const compressor = createCompressor(encoding);
    const source = Readable.from(response.body);
    source.once("error", (error) => compressor.destroy(error));
    source.pipe(compressor);

    const headers = new Headers(response.headers);
    headers.set("content-encoding", encoding);
    headers.set("vary", "Accept-Encoding");
    headers.delete("content-length");
    context.res = new BunResponse(compressor, {
      status: response.status,
      headers,
    });
  };
}

/**
 * Compresses an event stream one event at a time with a single compressor
 * for the whole connection, so a re-render reuses the previous render in the
 * window and costs a few hundred bytes. Each `encode` flushes and returns
 * every byte that event produced as one array, so the caller writes the
 * event whole, as one chunk, rather than one per compressor output piece.
 */
export interface EventEncoder {
  encode(event: string): Promise<Uint8Array>;
  close(): void;
}

export function createEventEncoder(
  encoding: CompressionEncoding | undefined,
): EventEncoder {
  if (encoding === undefined) {
    const textEncoder = new TextEncoder();
    let closed = false;
    return {
      encode: (event) =>
        closed
          ? Promise.reject(new Error("The event encoder is closed"))
          : Promise.resolve(textEncoder.encode(event)),
      close() {
        closed = true;
      },
    };
  }

  const compressor =
    encoding === "br"
      ? createBrotliCompress({
          params: {
            [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
            [constants.BROTLI_PARAM_QUALITY]: 5,
            // 4MB: the previous whole-page render is always in reach.
            [constants.BROTLI_PARAM_LGWIN]: 22,
          },
        })
      : createGzip();
  const flushKind =
    encoding === "br"
      ? constants.BROTLI_OPERATION_FLUSH
      : constants.Z_SYNC_FLUSH;
  let pending: Buffer[] = [];
  compressor.on("data", (chunk: Buffer) => {
    pending.push(chunk);
  });
  let failure: Error | undefined;
  compressor.on("error", (error) => {
    failure = error;
  });
  // One event at a time: another write before this flush ends would land
  // in this event's bytes.
  let previous: Promise<unknown> = Promise.resolve();

  function encodeNow(event: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (failure !== undefined || compressor.destroyed) {
        reject(failure ?? new Error("The event encoder is closed"));
        return;
      }
      compressor.write(event);
      compressor.flush(flushKind, () => {
        if (failure !== undefined) {
          reject(failure);
          return;
        }
        const output = Buffer.concat(pending);
        pending = [];
        resolve(output);
      });
    });
  }

  return {
    encode(event) {
      const encoded = previous.then(() => encodeNow(event));
      previous = encoded.catch(() => undefined);
      return encoded;
    },
    close() {
      compressor.destroy();
    },
  };
}
