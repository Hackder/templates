import { expect, test } from "bun:test";
import { Hono } from "hono";
import { readSignals } from "./datastar";

test("HEAD reads signals like GET instead of parsing an empty body", async () => {
  const app = new Hono();
  app.get("/", async (c) => {
    await readSignals(c.req);
    return c.text("OK");
  });

  const response = await app.request("/", { method: "HEAD" });

  expect(response.status).toBe(200);
});
