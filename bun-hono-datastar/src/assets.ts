import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger";

// The server restarts when assets change in development, clearing this cache.
const fileHashes = new Map<string, string>();

/**
 * Gets and caches a content hash for cache busting.
 */
export function getFileHash(filePath: string): string {
  const cached = fileHashes.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const absolutePath = join(process.cwd(), filePath);
    if (!existsSync(absolutePath)) {
      logger().warn("File not found for hashing", { filePath });
      return "00000000";
    }

    const hash = createHash("sha256")
      .update(readFileSync(absolutePath))
      .digest("hex")
      .slice(0, 8);
    fileHashes.set(filePath, hash);
    return hash;
  } catch (error) {
    logger().error("Error calculating file hash", { filePath, err: error });
    return "00000000";
  }
}

export const CACHE_FOREVER = "public, max-age=31536000, immutable";

// A vendored release keeps its version in its path (static/datastar-1.0.4.js,
// static/icons-2.1.2/…): another release is another path, so the bytes under
// one never change. This also covers what those files load by relative URL
// (script.js's import of Datastar, the icon CSS's font files), which cannot
// carry a ?v= of their own.
const RELEASE_IN_PATH = /-\d+\.\d+\.\d+(\/|\.[a-z0-9]+$)/;

/**
 * Cache-Control for a file under static/. A file whose path names its release,
 * or whose ?v= is the hash of the bytes this server has, never changes under
 * that URL. A ?v= minted by another version of the app (a rolling deploy)
 * must not get these bytes cached under it, so it is not stored; a bare URL
 * revalidates through its ETag.
 */
export function staticCacheControl(
  path: string,
  version: string | undefined,
): string {
  if (path.includes("..")) {
    return "no-cache";
  }
  if (RELEASE_IN_PATH.test(path)) {
    return CACHE_FOREVER;
  }
  if (version === undefined) {
    return "no-cache";
  }
  return version === getFileHash(path) ? CACHE_FOREVER : "no-store";
}
