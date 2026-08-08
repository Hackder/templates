import { Readable, pipeline } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { constants, createGzip } from "node:zlib";
import type { MiddlewareHandler } from "hono";

const compressible = /^(text\/|application\/(json|javascript)|image\/svg)/;

export function gzipCompress(): MiddlewareHandler {
  return async (context, next) => {
    await next();
    const response = context.res;
    if (
      response.body === null ||
      response.headers.has("content-encoding") ||
      !(context.req.header("accept-encoding") ?? "").includes("gzip") ||
      !compressible.test(response.headers.get("content-type") ?? "")
    ) {
      return;
    }

    const gzip = createGzip({ flush: constants.Z_SYNC_FLUSH });
    pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      gzip,
      () => undefined,
    );

    const headers = new Headers(response.headers);
    headers.set("content-encoding", "gzip");
    headers.set("vary", "Accept-Encoding");
    headers.delete("content-length");
    context.res = new Response(Readable.toWeb(gzip) as unknown as BodyInit, {
      status: response.status,
      headers,
    });
  };
}
