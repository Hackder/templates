import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const fileHashes = new Map<string, string>();

export function getFileHash(filePath: string): string {
  const cached = fileHashes.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const absolutePath = join(process.cwd(), filePath);
    if (!existsSync(absolutePath)) {
      console.warn(`File not found for hashing: ${filePath}`);
      return "00000000";
    }

    const hash = createHash("sha256")
      .update(readFileSync(absolutePath))
      .digest("hex")
      .slice(0, 8);
    fileHashes.set(filePath, hash);
    return hash;
  } catch (error) {
    console.error(`Error calculating hash for ${filePath}:`, error);
    return "00000000";
  }
}
