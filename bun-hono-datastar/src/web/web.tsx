import assert from "node:assert/strict";
import { type Context, Hono } from "hono";
import { serveStatic } from "hono/bun";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import { staticCacheControl } from "../assets";
import { isSignedIn, listDevices } from "../auth/devices";
import { PASSWORD_GATE } from "../auth/password";
import { gzipCompress } from "../compress";
import { datastarSse } from "../datastar";
import { db } from "../db";
import { devModeApp } from "../dev-mode";
import { env } from "../env";
import { logger, withSpan } from "../logger";
import { items } from "../schema";
import { increment, readState } from "../state";
import { exhaustiveCheck } from "../utils";
import { type AppEnv, authGate, mountAuth } from "./auth";
import { ReloadTab } from "./connection";
import { answerWhenEmitted } from "./emission";
import { Layout } from "./layout";
import { CounterPage } from "./page";
import { SettingsView, SignedOutView } from "./settings";
import { type Page, type ViewState, openView, sessionOf } from "./session";
import { streamUpdates } from "./updates";

// The web layer reads state and renders it; it changes nothing itself
// except per-session view state. Shared changes go through src/state.ts's
// writers. Every action answers 204 and the change reaches the browser
// through the tab's /updates stream, like every other change; an action
// that changed something answers once the stream has emitted it
// (`answerWhenEmitted`, ./emission), so its loading indicator lasts until
// then.

export const app = new Hono<AppEnv>();

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

// First, so every response gets these headers, the gate's 401s and
// redirects, errors and 404s included.
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

// Deny by default while the password gate is on: before every other route
// and middleware, so nothing is served to a request without a signed-in
// device unless ./auth lists it as public (the login page and what it
// loads). Off, it lets everything through.
app.use("*", authGate(PASSWORD_GATE));

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

// ---------------------------------------------------------------------------
// Pages and the stream
// ---------------------------------------------------------------------------

/**
 * The tab's page, or the signed-out page once its device is gone.
 * `deviceId` is null while the password gate is off.
 */
function View({
  view,
  deviceId,
}: {
  view: ViewState;
  deviceId: string | null;
}) {
  const now = Temporal.Now.instant();
  if (deviceId !== null && !isSignedIn(deviceId, now)) {
    return <SignedOutView />;
  }
  switch (view.page) {
    case "counter":
      return <CounterPage state={readState()} />;
    case "settings":
      return (
        <SettingsView
          gate={
            deviceId === null
              ? null
              : { devices: listDevices(now), currentDeviceId: deviceId }
          }
        />
      );
    default:
      return exhaustiveCheck(view.page);
  }
}

/**
 * The request's device on a private route; null while the gate is off.
 */
function deviceIdOf(context: Context<AppEnv>): string | null {
  const device = context.get("device");
  assert(
    !PASSWORD_GATE || device !== null,
    "with the gate on, authGate turns away requests without a device before any private route",
  );
  return device?.id ?? null;
}

/**
 * A page load: a new view session showing `page`. The only place a view
 * session starts, so a tab the server forgot reloads to get here (see
 * `streamUpdates`).
 */
async function pageResponse(
  context: Context<AppEnv>,
  page: Page,
): Promise<Response> {
  const session = openView({ page });
  return await context.html(
    <Layout sessionId={session.id}>
      <View view={session.view} deviceId={deviceIdOf(context)} />
    </Layout>,
  );
}

app.get("/", async (context) => await pageResponse(context, "counter"));
app.get(
  "/settings",
  async (context) => await pageResponse(context, "settings"),
);

/** The tab's stream of page renders; see `streamUpdates`. */
app.get("/updates", async (context) => {
  const sessionId = await sessionOf(context.req);
  const deviceId = deviceIdOf(context);
  return datastarSse(context, async (sender) => {
    await streamUpdates(sessionId, sender, {
      render: (view) => <View view={view} deviceId={deviceId} />,
      signedIn: () =>
        deviceId === null || isSignedIn(deviceId, Temporal.Now.instant()),
      reload: () => <ReloadTab />,
    });
  });
});

// ---------------------------------------------------------------------------
// Actions: validate, then change the state or the view state, and
// answer 204 once the tab's stream has emitted the change.
// ---------------------------------------------------------------------------

app.post("/actions/increment", async (context) => {
  const sessionId = await sessionOf(context.req);
  const version = increment();
  return await answerWhenEmitted(context, sessionId, version);
});

if (PASSWORD_GATE) {
  mountAuth(app);
}

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
