import assert from "node:assert/strict";
import type { Context, Hono, HonoRequest, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod/v4";
import {
  DEVICE_LIFETIME,
  type Device,
  type Seen,
  deviceForToken,
  revokeDevice,
  revokeOtherDevices,
  signIn,
  touchDevice,
} from "../auth/devices";
import {
  type Limiter,
  createLimiter,
  recordAttempt,
  recordSuccess,
  retryAfter,
} from "../auth/limiter";
import { checkPassword } from "../auth/password";
import { MAX_PASSWORD_LENGTH } from "../auth/password-limits";
import { isDatastarRequest } from "../datastar";
import { env } from "../env";
import { logger } from "../logger";
import { answerWhenEmitted } from "./emission";
import { SignedOutLayout } from "./layout";
import { sessionOf } from "./session";

// The opt-in password gate (src/auth/password.ts). When it is on, one
// middleware, `authGate`, runs before every route: it turns away cross-site
// writes, finds the request's device session from its cookie, and lets a
// request without one through only to the few PUBLIC_ROUTES. The device
// session itself lives in src/auth/devices.ts; this file is the HTTP side.
// When it is off the gate lets everything through and nothing here is
// mounted.

/** What the app's routes see: the client's address and its device. */
export interface AppEnv {
  Bindings: {
    /** From Bun's `server.requestIP` (src/main.ts). */
    connectionIp: string | undefined;
  };
  Variables: {
    /**
     * The request's signed-in device. Null on public routes, and on every
     * route while the gate is off; `authGate` turns away the rest.
     */
    device: Device | null;
  };
}

/**
 * The only routes a request without a device session reaches while the
 * gate is on: the login form, the health check, and the assets the login
 * page loads. None shows any data. Matched on the exact method and path;
 * HEAD counts as GET.
 */
export const PUBLIC_ROUTES = new Set([
  "GET /login",
  "POST /login",
  "GET /health",
  "GET /robots.txt",
  "GET /favicon.ico",
  "GET /static/favicon.svg",
  "GET /static/styles.css",
]);

export function isPublic(method: string, path: string): boolean {
  return PUBLIC_ROUTES.has(`${method === "HEAD" ? "GET" : method} ${path}`);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A state-changing request another site made the browser send. SameSite=Lax
 * already keeps the cookie off cross-site POSTs; this also refuses them
 * outright, the login form included. Browsers send Origin with every POST,
 * Datastar's fetches and plain forms alike, so a missing one is refused too.
 */
export function isCrossSiteWrite(req: HonoRequest): boolean {
  if (SAFE_METHODS.has(req.method)) {
    return false;
  }
  const site = req.header("sec-fetch-site");
  if (site !== undefined && site !== "same-origin") {
    return true;
  }
  const origin = URL.parse(req.header("origin") ?? "");
  return origin === null || origin.host !== req.header("host");
}

/** The client's address, through TRUST_PROXY_HOPS reverse proxies. */
export function clientIp(context: Context<AppEnv>): string {
  const hops = env.TRUST_PROXY_HOPS;
  if (hops > 0) {
    const forwarded = (context.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    // Each proxy appends the address it saw; the entries further left
    // were written by the client and prove nothing.
    const seen = forwarded[forwarded.length - hops];
    if (seen !== undefined) {
      return seen;
    }
  }
  return context.env.connectionIp ?? "unknown";
}

function seenFrom(context: Context<AppEnv>): Seen {
  return {
    ip: clientIp(context),
    userAgent: (context.req.header("user-agent") ?? "").slice(0, 512),
  };
}

// ---------------------------------------------------------------------------
// The device cookie
// ---------------------------------------------------------------------------

/**
 * Secure (and so `__Host-` prefixed) everywhere but local development and
 * E2E, which run over plain http on localhost.
 */
const SECURE_COOKIE = env.NODE_ENV === "production";
const DEVICE_COOKIE = "device";

function readDeviceCookie(context: Context): string | undefined {
  return SECURE_COOKIE
    ? getCookie(context, DEVICE_COOKIE, "host")
    : getCookie(context, DEVICE_COOKIE);
}

/** Set (or renewed) for DEVICE_LIFETIME from now, like the device itself. */
function writeDeviceCookie(context: Context, token: string): void {
  setCookie(context, DEVICE_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: SECURE_COOKIE,
    sameSite: "Lax",
    maxAge: DEVICE_LIFETIME.total("seconds"),
    prefix: SECURE_COOKIE ? "host" : undefined,
  });
}

function clearDeviceCookie(context: Context): void {
  deleteCookie(context, DEVICE_COOKIE, {
    path: "/",
    secure: SECURE_COOKIE,
    prefix: SECURE_COOKIE ? "host" : undefined,
  });
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Where an unauthenticated request goes: a page load is sent to the login
 * form, which brings it back afterwards; anything else (the /updates
 * stream, actions, assets, scripts) gets a bare 401. static/script.js turns
 * a 401 on a Datastar request into a visit to the login page.
 */
function turnAway(context: Context<AppEnv>): Response {
  const req = context.req;
  const isPageLoad =
    req.method === "GET" &&
    !isDatastarRequest(req.raw) &&
    (req.header("accept") ?? "").includes("text/html");
  if (isPageLoad) {
    const url = new URL(req.url);
    const next = encodeURIComponent(`${url.pathname}${url.search}`);
    return context.redirect(`/login?next=${next}`, 302);
  }
  return context.text("Unauthorized", 401);
}

/**
 * Runs before every route (deny by default) while the gate is `on`:
 * refuses cross-site writes, then requires a signed-in device on every
 * route but PUBLIC_ROUTES. Off, it lets everything through.
 */
export function authGate(on: boolean): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    context.set("device", null);
    if (!on) {
      await next();
      return undefined;
    }
    if (isCrossSiteWrite(context.req)) {
      logger().warn("Refused a cross-site request", {
        method: context.req.method,
        path: context.req.path,
      });
      return context.text("Forbidden", 403);
    }
    const now = Temporal.Now.instant();
    const token = readDeviceCookie(context);
    const device = token === undefined ? null : deviceForToken(token, now);
    const isPrivate = !isPublic(context.req.method, context.req.path);
    context.set("device", device);
    if (token !== undefined && device !== null) {
      // Renewed before the handler runs: a streamed response has sent its
      // headers by the time it returns.
      if (touchDevice(device, seenFrom(context), now)) {
        writeDeviceCookie(context, token);
      }
    } else if (isPrivate) {
      return turnAway(context);
    }
    await next();
    // What the gate guards is for this device alone: no shared cache may
    // keep it, nor the browser, which would show it again after signing
    // out. Static files keep their own caching (src/assets.ts); they are
    // the same for everyone and hold no data.
    if (isPrivate && !context.req.path.startsWith("/static/")) {
      context.header("Cache-Control", "private, no-store");
    }
    return undefined;
  };
}

/** The signed-in device of a request to a route mounted only with the gate. */
function currentDevice(context: Context<AppEnv>): Device {
  const device = context.get("device");
  assert(
    device !== null,
    "these routes exist only with the gate on, and it turns away requests without a device",
  );
  return device;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Failed passwords wait longer and longer, per client address and for all
 * clients together. The shared limit stops guessing from many addresses; it
 * can also make the owner wait (at most `maxDelay`) while someone guesses,
 * which devices that are already signed in never notice.
 */
const perIp: Limiter = createLimiter({
  freeAttempts: 5,
  baseDelay: Temporal.Duration.from({ seconds: 1 }),
  maxDelay: Temporal.Duration.from({ minutes: 15 }),
  forgetAfter: Temporal.Duration.from({ hours: 24 }),
});
const everyone: Limiter = createLimiter({
  freeAttempts: 20,
  baseDelay: Temporal.Duration.from({ seconds: 1 }),
  maxDelay: Temporal.Duration.from({ minutes: 5 }),
  forgetAfter: Temporal.Duration.from({ hours: 24 }),
});
const EVERYONE = "*";

function longerWait(
  a: Temporal.Duration | null,
  b: Temporal.Duration | null,
): Temporal.Duration | null {
  if (a === null || b === null) {
    return a ?? b;
  }
  return Temporal.Duration.compare(a, b) >= 0 ? a : b;
}

function waitText(wait: Temporal.Duration): string {
  const seconds = Math.ceil(wait.total("seconds"));
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Any origin of ours would do; only "is it still this one" is asked. */
const SAME_SITE = "http://app.invalid";

/**
 * Where to go after logging in: a path on this site, never another site
 * (`//evil.example`, `/\evil.example`, tabs and the like are resolved the way
 * a browser would and refused when they leave the site, or when the result
 * starts with two slashes).
 */
export function safeNext(raw: string | undefined): string {
  const url = URL.parse(raw ?? "/", SAME_SITE);
  if (url === null || url.origin !== SAME_SITE || url.pathname === "/login") {
    return "/";
  }
  // `/.//evil.example` stays on this site but resolves to the path
  // `//evil.example`, which a browser reads as another host.
  if (url.pathname.startsWith("//") || url.pathname.startsWith("/\\")) {
    return "/";
  }
  return `${url.pathname}${url.search}`;
}

/**
 * The login form is public and parsed before the rate limiter, so its body
 * is capped well below the server-wide limit (src/main.ts): room for the
 * longest password percent-encoded (up to 9 bytes a character) and `next`.
 */
const LOGIN_BODY_LIMIT = MAX_PASSWORD_LENGTH * 9 + 4096;

const loginForm = z.object({
  password: z.string().catch(""),
  next: z.string().catch("/"),
});

/**
 * Mounts /login, checking passwords against `passwordHash`, and the device
 * actions of the settings page.
 */
export function mountAuth(app: Hono<AppEnv>, passwordHash: string): void {
  app.get("/login", (context) => {
    const next = safeNext(context.req.query("next"));
    if (context.get("device") !== null) {
      return context.redirect(next, 302);
    }
    return context.html(<LoginPage next={next} error={null} />);
  });

  app.post(
    "/login",
    bodyLimit({
      maxSize: LOGIN_BODY_LIMIT,
      onError: (context) => context.text("Payload Too Large", 413),
    }),
  );
  app.post("/login", async (context) => {
    const form = loginForm.parse(await context.req.parseBody());
    const next = safeNext(form.next);
    const ip = clientIp(context);
    const now = Temporal.Now.instant();

    const wait = longerWait(
      retryAfter(perIp, ip, now),
      retryAfter(everyone, EVERYONE, now),
    );
    if (wait !== null) {
      context.header("Retry-After", String(Math.ceil(wait.total("seconds"))));
      return context.html(
        <LoginPage
          next={next}
          error={`Too many wrong passwords. Try again in ${waitText(wait)}.`}
        />,
        429,
      );
    }

    recordAttempt(perIp, ip, now);
    recordAttempt(everyone, EVERYONE, now);
    if (!(await checkPassword(passwordHash, form.password))) {
      logger().warn("Wrong login password", { ip });
      return context.html(
        <LoginPage next={next} error="Wrong password." />,
        401,
      );
    }
    recordSuccess(perIp, ip);
    recordSuccess(everyone, EVERYONE);

    const replacing = context.get("device");
    const { device, token } = signIn(seenFrom(context), now, replacing);
    logger().info("Device signed in", {
      deviceId: device.id,
      replacedDeviceId: replacing?.id,
      ip,
    });
    writeDeviceCookie(context, token);
    return context.redirect(next, 303);
  });

  // Signing out and revoking answer 204 like every action, once the tab's
  // stream has emitted the change (./emission); the device's open streams
  // see it gone and send their pages to the login form.
  app.post("/actions/sign-out", async (context) => {
    const sessionId = await sessionOf(context.req);
    const version = revokeDevice(currentDevice(context).id);
    clearDeviceCookie(context);
    return version === null
      ? context.body(null, 204)
      : await answerWhenEmitted(context, sessionId, version);
  });

  app.post("/actions/revoke-device", async (context) => {
    const sessionId = await sessionOf(context.req);
    const id = z.uuid().safeParse(context.req.query("device"));
    const version = id.success ? revokeDevice(id.data) : null;
    return version === null
      ? context.body(null, 204)
      : await answerWhenEmitted(context, sessionId, version);
  });

  app.post("/actions/revoke-other-devices", async (context) => {
    const sessionId = await sessionOf(context.req);
    const version = revokeOtherDevices(currentDevice(context).id);
    return version === null
      ? context.body(null, 204)
      : await answerWhenEmitted(context, sessionId, version);
  });
}

// ---------------------------------------------------------------------------
// The login page
// ---------------------------------------------------------------------------

/**
 * A plain form post, no script: it works before anything else is allowed to
 * load, and password managers recognise it.
 */
function LoginPage({ next, error }: { next: string; error: string | null }) {
  return (
    <SignedOutLayout>
      <main class="flex min-h-dvh flex-col items-center px-4 pt-16 sm:pt-32">
        <form
          method="post"
          action="/login"
          class="bg-card text-card-foreground w-full max-w-sm rounded-xl border p-6 shadow-sm sm:p-8"
        >
          <p class="tracking-eyebrow text-primary text-sm font-medium uppercase">
            Bun + Hono + Datastar
          </p>
          <h1 class="mt-6 text-3xl font-semibold tracking-tight">Sign in</h1>
          <p class="text-muted-foreground mt-1.5">
            Enter the password to continue.
          </p>
          <input type="hidden" name="next" value={next} />
          <label class="mt-6 block">
            <span class="text-sm font-medium">Password</span>
            <input
              type="password"
              name="password"
              class="border-input bg-background focus-visible:ring-ring mt-1.5 block h-10 w-full rounded-md border px-3 outline-none focus-visible:ring-2"
              autocomplete="current-password"
              autofocus
              required
            />
          </label>
          {error !== null && (
            <p class="text-destructive mt-3 text-sm" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            class="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 h-10 w-full rounded-md font-semibold transition"
          >
            Sign in
          </button>
        </form>
      </main>
    </SignedOutLayout>
  );
}
