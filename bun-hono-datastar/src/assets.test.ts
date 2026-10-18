import { expect, test } from "bun:test";
import { CACHE_FOREVER, getFileHash, staticCacheControl } from "./assets";

// The contract: a URL is cached forever only when its bytes can never change
// under it, so a deploy that changes a file always changes its URL.

test("a URL naming its content hash or release is cached forever", () => {
  const hash = getFileHash("static/script.js");
  expect(staticCacheControl("static/script.js", hash)).toBe(CACHE_FOREVER);
  // Loaded by relative URL, with no ?v= of their own.
  expect(staticCacheControl("static/datastar-1.0.4.js", undefined)).toBe(
    CACHE_FOREVER,
  );
  expect(
    staticCacheControl("static/icons-2.1.2/Phosphor-Bold.woff2", undefined),
  ).toBe(CACHE_FOREVER);
});

test("a URL whose bytes may change is never cached forever", () => {
  expect(staticCacheControl("static/script.js", undefined)).toBe("no-cache");
  // A hash minted by another version of the app, during a rolling deploy.
  expect(staticCacheControl("static/script.js", "deadbeef")).toBe("no-store");
});
