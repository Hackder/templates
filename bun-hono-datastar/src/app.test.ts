import { describe, expect, test } from "bun:test";
import { app } from "./app";
import { getFileHash } from "./assets";

describe("app", () => {
  test("renders the initial page", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Count: 0");
  });

  test("patches elements and signals", async () => {
    const response = await app.request("/increment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 2 }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: datastar-patch-elements");
    expect(body).toContain("Count: 3");
    expect(body).toContain("event: datastar-patch-signals");
    expect(body).toContain('signals {"count":3}');
  });

  test("rejects invalid signals", async () => {
    const response = await app.request("/increment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: "two" }),
    });
    expect(response.status).toBe(400);
  });

  test("only caches assets with a matching content hash", async () => {
    const version = getFileHash("static/script.js");
    const matching = await app.request(`/static/script.js?v=${version}`);
    const mismatched = await app.request("/static/script.js?v=incorrect");
    const unversioned = await app.request("/static/script.js");
    const missing = await app.request("/static/missing.12345678.js?v=12345678");

    expect(matching.status).toBe(200);
    expect(matching.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(mismatched.headers.get("cache-control")).toBe("no-store");
    expect(unversioned.headers.get("cache-control")).toBe("no-cache");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });
});
