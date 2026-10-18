import { describe, expect, test } from "bun:test";
import { BUSY_HEADER, BUSY_ID_HEADER } from "./busy";
import { createApp } from "./web";

// The app without the password gate; src/web/auth.test.ts covers it with.
const app = createApp({ passwordHash: undefined });

describe("app", () => {
  test("renders the initial page", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Count: 0");
    // The count comes from a Drizzle query bounded by a Temporal instant.
    expect(body).toMatch(/\d+ items stored in the last 24 hours/);
  });

  test("an action answers 204 and runs once per request id; the change shows in the next render", async () => {
    const page = await (await app.request("/")).text();
    const sessionid = /sessionid&quot;:&quot;([0-9a-f-]+)/.exec(page)?.[1];
    expect(sessionid).toBeDefined();
    const before = Number(/Count: (\d+)/.exec(page)?.[1]);

    // The button's click, then Datastar's retry of it (same request id).
    for (let i = 0; i < 2; i++) {
      const response = await app.request("/actions/increment", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [BUSY_HEADER]: "increment",
          [BUSY_ID_HEADER]: "click1",
        },
        body: JSON.stringify({ sessionid }),
      });
      expect(response.status).toBe(204);
    }
    expect(await (await app.request("/")).text()).toContain(
      `Count: ${before + 1}`,
    );
  });

  test("rejects invalid signals", async () => {
    const response = await app.request("/actions/increment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [BUSY_HEADER]: "increment",
        [BUSY_ID_HEADER]: "click1",
      },
      body: JSON.stringify({ sessionid: 2 }),
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
