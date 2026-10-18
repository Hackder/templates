import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import { z } from "zod/v4";
import { staticCacheControl } from "../assets";
import { gzipCompress } from "../compress";
import { datastarSse, readSignalsRequired } from "../datastar";
import { db } from "../db";
import { devModeApp } from "../dev-mode";
import { env } from "../env";
import { logger, withSpan } from "../logger";
import { items } from "../schema";
import { Layout } from "./layout";
import { Counter, RECENT_ITEMS_WINDOW, countItemsSince } from "./page";

export const app = new Hono();

/**
 * Datastar evaluates its data-* expressions with `Function`, hence
 * 'unsafe-eval'. Datastar 1.0.3+ has a nonce-based CSP mode, deliberately not
 * used: it does not protect against injected data-* attributes, which run
 * anyway. Escaping and sanitizing output is the real XSS protection. The dev
 * overlay keeps its box in style attributes. Every script, stylesheet and
 * font is our own.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

// First, so every response gets these headers, errors and 404s included.
app.use("*", async (context, next) => {
  await next();
  context.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  context.header("X-Content-Type-Options", "nosniff");
  // Not "no-referrer": with it browsers send `Origin: null` on a form post,
  // which breaks any same-origin check on writes.
  context.header("Referrer-Policy", "same-origin");
  if (env.NODE_ENV === "production") {
    context.header("Strict-Transport-Security", "max-age=31536000");
  }
});

app.use("/static/*", etag());
app.use("*", gzipCompress());
app.use("/static/*", async (context, next) => {
  await next();
  if (context.res.status === 200) {
    context.header(
      "Cache-Control",
      staticCacheControl(
        context.req.path.replace(/^\//, ""),
        context.req.query("v"),
      ),
    );
  }
});
app.use("/static/*", serveStatic({ root: "./" }));

// Old browsers and crawlers request /favicon.ico unprompted; serve the real
// icon there instead of rendering a 404 page. It and robots.txt keep a fixed
// URL, so they are cached for a day rather than forever: a change still lands.
const FIXED_URL_CACHE = "public, max-age=86400";
app.use(
  "/favicon.ico",
  serveStatic({
    path: "./static/favicon.ico",
    onFound: (_path, context) => {
      context.header("Cache-Control", FIXED_URL_CACHE);
    },
  }),
);

app.get("/robots.txt", (context) => {
  context.header("Cache-Control", FIXED_URL_CACHE);
  return context.text("User-agent: *\nAllow: /\n");
});
app.get("/health", async (context) => {
  context.header("Cache-Control", "no-store");
  try {
    await db.select({ id: items.id }).from(items).limit(1);
    return context.text("OK");
  } catch {
    return context.text("Service Unavailable", 503);
  }
});

// One owning span per request: everything set during handling (status, parse
// errors, counters) lands on its single close line. Field names follow the
// OpenTelemetry HTTP semantic conventions so Axiom's HTTP views pick them up.
app.use(async (context, next) => {
  await withSpan(
    "request",
    {
      "http.request.method": context.req.method,
      "url.path": context.req.path,
    },
    { kind: "server", origin: "request" },
    async () => {
      await next();
      logger().set({ "http.response.status_code": context.res.status });
    },
  );
});

app.get("/", async (context) => {
  const recentItems = await countItemsSince(
    Temporal.Now.instant().subtract(RECENT_ITEMS_WINDOW),
  );

  return context.html(
    <Layout signals={{ count: 0 }}>
      <Counter count={0} recentItems={recentItems} />
    </Layout>,
  );
});

const counterSignals = z.object({ count: z.number().int().nonnegative() });

app.post("/increment", async (context) => {
  const { count } = await readSignalsRequired(context.req, counterSignals);
  const recentItems = await countItemsSince(
    Temporal.Now.instant().subtract(RECENT_ITEMS_WINDOW),
  );
  return datastarSse(context, async (sender) => {
    await sender.patchElements(
      <Counter count={count + 1} recentItems={recentItems} />,
    );
    await sender.patchSignals({ count: count + 1 });
  });
});

if (env.NODE_ENV === "development") {
  app.route("/", devModeApp);
}

app.notFound((context) => context.text("Not found", 404));
app.onError((error, context) => {
  const status = error instanceof HTTPException ? error.status : 500;
  const message =
    error instanceof HTTPException ? error.message : "Internal server error";

  // Hono catches route errors before `next()` returns to the request span, so
  // record server failures here while that span is still active.
  if (status >= 500) {
    logger().set({ requestErr: error });
  }
  return context.text(message, status);
});
