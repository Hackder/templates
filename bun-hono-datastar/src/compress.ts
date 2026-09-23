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

type CompressionEncoding = "br" | "gzip";

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

function preferredEncoding(header: string): CompressionEncoding | undefined {
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
      flush: constants.BROTLI_OPERATION_FLUSH,
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: 4,
      },
    });
  }
  return createGzip({ flush: constants.Z_SYNC_FLUSH });
}

export function gzipCompress(): MiddlewareHandler {
  return async (context, next) => {
    await next();
    const response = context.res;
    const encoding = preferredEncoding(
      context.req.header("accept-encoding") ?? "",
    );
    if (
      response.body === null ||
      response.headers.has("content-encoding") ||
      encoding === undefined ||
      !compressible.test(response.headers.get("content-type") ?? "")
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
