import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { deviceLabel } from "../auth/devices";
import {
  type AppEnv,
  PUBLIC_ROUTES,
  authGate,
  isPublic,
  safeNext,
} from "./auth";
import { app } from "./web";

// Deny by default while the gate is on: every route the app registers must
// turn away a request without a device session unless it is on the public
// allowlist. The unit tests run without AUTH_PASSWORD_HASH, so the app's
// own gate is off; an outer gate that is on runs first instead, as the
// app's does when it is on. Requests carry a same-site Origin so they get
// past the cross-site check and reach the gate itself.

const gated = new Hono<AppEnv>();
gated.use("*", authGate(true));
gated.route("/", app);

const HOST = "localhost:3000";
const ENV = { connectionIp: "127.0.0.1" };

function concretePath(path: string): string {
  return path.replaceAll(/:[^/]+/g, "x").replaceAll("*", "x");
}

/** "GET /updates" */
type Route = string;

async function send(route: Route, accept: "text/html" | "*/*") {
  const [method = "", path = ""] = route.split(" ");
  return await gated.request(
    `http://${HOST}${path}`,
    {
      method,
      headers: { host: HOST, origin: `http://${HOST}`, accept },
      redirect: "manual",
    },
    ENV,
  );
}

describe("authGate", () => {
  const routes = new Set<Route>();
  for (const route of app.routes) {
    const methods = route.method === "ALL" ? ["GET", "POST"] : [route.method];
    for (const method of methods) {
      routes.add(`${method} ${concretePath(route.path)}`);
    }
  }

  test("finds the app's routes", () => {
    expect(routes.has("GET /updates")).toBe(true);
    expect(routes.has("POST /actions/increment")).toBe(true);
    expect(routes.has("GET /settings")).toBe(true);
  });

  test("turns away every non-public route without a device session", async () => {
    for (const route of routes) {
      const [method = "", path = ""] = route.split(" ");
      if (isPublic(method, path)) {
        continue;
      }
      const page = await send(route, "text/html");
      const other = await send(route, "*/*");
      if (method === "GET") {
        expect({ route, status: page.status }).toEqual({ route, status: 302 });
        expect(page.headers.get("location")).toBe(
          `/login?next=${encodeURIComponent(path)}`,
        );
      } else {
        expect({ route, status: page.status }).toEqual({ route, status: 401 });
      }
      expect({ route, status: other.status }).toEqual({ route, status: 401 });
    }
  });

  test("Datastar requests get 401, never a redirect", async () => {
    const response = await gated.request(
      `http://${HOST}/updates`,
      {
        headers: {
          host: HOST,
          accept: "text/html",
          "datastar-request": "true",
        },
      },
      ENV,
    );
    expect(response.status).toBe(401);
  });

  test("the public allowlist is only the login page and what it loads", () => {
    // Exactly these: a new public route has to be added here on purpose.
    expect([...PUBLIC_ROUTES].toSorted()).toEqual([
      "GET /favicon.ico",
      "GET /health",
      "GET /login",
      "GET /robots.txt",
      "GET /static/favicon.svg",
      "GET /static/styles.css",
      "POST /login",
    ]);
    expect(isPublic("GET", "/login")).toBe(true);
    expect(isPublic("POST", "/login")).toBe(true);
    expect(isPublic("HEAD", "/health")).toBe(true);
    expect(isPublic("GET", "/static/styles.css")).toBe(true);
    expect(isPublic("GET", "/static/script.js")).toBe(false);
    expect(isPublic("POST", "/health")).toBe(false);
    expect(isPublic("GET", "/login/x")).toBe(false);
  });

  test("refuses cross-site and Origin-less writes, even to /login", async () => {
    for (const origin of ["https://evil.example", "null", undefined]) {
      const headers = new Headers({ host: HOST });
      if (origin !== undefined) {
        headers.set("origin", origin);
      }
      const response = await gated.request(
        `http://${HOST}/login`,
        {
          method: "POST",
          headers,
          body: new URLSearchParams({ password: "x" }),
        },
        ENV,
      );
      expect({ origin, status: response.status }).toEqual({
        origin,
        status: 403,
      });
    }
  });
});

describe("safeNext", () => {
  test("keeps paths on this site", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("/?a=1")).toBe("/?a=1");
    expect(safeNext(undefined)).toBe("/");
  });

  test("refuses anything that leaves it", () => {
    for (const raw of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/.//evil.example",
      "/..//evil.example",
      "/%2e//evil.example",
      "/./\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "/login",
    ]) {
      expect({ raw, next: safeNext(raw) }).toEqual({ raw, next: "/" });
    }
  });
});

test("deviceLabel", () => {
  expect(
    deviceLabel(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    ),
  ).toBe("Safari on macOS");
  expect(
    deviceLabel(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
    ),
  ).toBe("Chrome on iOS");
  expect(
    deviceLabel(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
    ),
  ).toBe("Edge on Windows");
  expect(
    deviceLabel("Mozilla/5.0 (Linux; Android 14) Gecko/130.0 Firefox/130.0"),
  ).toBe("Firefox on Android");
  expect(deviceLabel("curl/8.0")).toBe("Unknown browser on unknown system");
});
