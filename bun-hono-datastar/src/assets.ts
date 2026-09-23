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
