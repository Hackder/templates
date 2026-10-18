import { describe, expect, test } from "bun:test";
import { app } from "./web";

describe("app", () => {
  test("renders the initial page", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Count: 0");
    // The count comes from a Drizzle query bounded by a Temporal instant.
    expect(body).toMatch(/\d+ items stored in the last 24 hours/);
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

  test("answers health checks from the database", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });

  test("serves robots.txt and the favicon", async () => {
    const robots = await app.request("/robots.txt");
    const favicon = await app.request("/favicon.ico");

    expect(await robots.text()).toContain("User-agent: *");
    expect(favicon.status).toBe(200);
  });
});
