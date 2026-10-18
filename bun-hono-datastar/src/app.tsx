import { count as countRows, gte } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import { z } from "zod/v4";
import { getFileHash } from "./assets";
import { gzipCompress } from "./compress";
import { datastarSse, readSignalsRequired } from "./datastar";
import { db } from "./db";
import { DevMode, devModeApp } from "./dev-mode";
import { env } from "./env";
import { logger, withSpan } from "./logger";
import { items } from "./schema";
import {
  cn,
  exhaustiveCheck,
  instantToDateForInteropWithDrizzle,
} from "./utils";
import { Icon } from "./web/components/icon";

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
/**
 * Asset caching keyed on the ?v=<content hash> stamped into URLs by
 * getFileHash. The hash is validated against the file this server actually
 * has: during a rolling deploy a server may receive a URL minted by a
 * different version, and answering it with mismatched bytes must not get
 * cached under that URL — those responses go out no-store. Only a verified
 * match is immutable; unversioned assets revalidate via ETag.
 */
app.use("/static/*", async (context, next) => {
  await next();
  const version = context.req.query("v");
  const path = context.req.path.replace(/^\//, "");
  if (version === undefined || path.includes("..")) {
    context.header("Cache-Control", "no-cache");
  } else if (context.res.status === 200 && version === getFileHash(path)) {
    context.header("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    context.header("Cache-Control", "no-store");
  }
});
app.use("/static/*", serveStatic({ root: "./" }));

// Old browsers and crawlers request /favicon.ico unprompted; serve the real
// icon there instead of rendering a 404 page.
app.use("/favicon.ico", serveStatic({ path: "./static/favicon.ico" }));

app.get("/robots.txt", (context) => context.text("User-agent: *\nAllow: /\n"));
app.get("/health", async (context) => {
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

const RECENT_ITEMS_WINDOW = Temporal.Duration.from({ hours: 24 });

// Timestamp columns are `Date` on the Drizzle side, so comparing them against a
// Temporal value needs the interop helper.
async function countItemsSince(since: Temporal.Instant): Promise<number> {
  const [row] = await db
    .select({ total: countRows() })
    .from(items)
    .where(gte(items.createdAt, instantToDateForInteropWithDrizzle(since)));
  return row?.total ?? 0;
}

type CounterTone = "idle" | "active";

function counterToneClass(tone: CounterTone): string {
  switch (tone) {
    case "idle":
      return "text-slate-400";
    case "active":
      return "text-white";
    default:
      return exhaustiveCheck(tone);
  }
}

interface CounterProps {
  count: number;
  recentItems: number;
}

function Counter({ count, recentItems }: CounterProps) {
  const tone: CounterTone = count === 0 ? "idle" : "active";

  return (
    <main
      id="counter"
      class="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6"
    >
      <div class="space-y-3">
        <p class="text-sm font-medium tracking-[0.2em] text-cyan-300 uppercase">
          Bun + Hono + Datastar
        </p>
        <h1
          class={cn(
            "text-5xl font-semibold tracking-tight",
            counterToneClass(tone),
          )}
        >
          Count: {count}
        </h1>
        <p class="text-slate-400">
          Server-rendered JSX, updated over a Datastar event stream.
        </p>
        <p class="text-xs text-slate-600">
          {recentItems} items stored in the last {RECENT_ITEMS_WINDOW.hours}{" "}
          hours
        </p>
        <p class="text-xs text-slate-600">
          Rendered at {Temporal.Now.instant().toString()}
        </p>
      </div>
      <button
        type="button"
        data-on:click="@post('/increment')"
        class="flex w-fit items-center gap-2 rounded-full bg-cyan-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
      >
        <Icon icon="plus" aria-hidden="true" />
        Increment
      </button>
    </main>
  );
}

app.get("/", async (context) => {
  const recentItems = await countItemsSince(
    Temporal.Now.instant().subtract(RECENT_ITEMS_WINDOW),
  );

  return context.html(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#020617" />
        <title>Bun Hono Datastar</title>
        <link
          rel="icon"
          type="image/svg+xml"
          href={`/static/favicon.svg?v=${getFileHash("static/favicon.svg")}`}
        />
        <link
          rel="stylesheet"
          href={`/static/styles.css?v=${getFileHash("static/styles.css")}`}
        />
        <link rel="stylesheet" href="/static/icons-2.1.2/style.css" />
        <script
          type="module"
          src={`/static/script.js?v=${getFileHash("static/script.js")}`}
        ></script>
      </head>
      <body data-signals={JSON.stringify({ count: 0 })}>
        <Counter count={0} recentItems={recentItems} />
        {env.NODE_ENV === "development" && <DevMode />}
      </body>
    </html>,
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
