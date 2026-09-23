import fs from "node:fs";

// Tails the NDJSON log file by polling its size and reading only the appended
// bytes. Polling (instead of fs.watch) survives the file not existing yet and
// being recreated, which happens on every app restart.

const NEWLINE = 0x0a;

interface TailOptions {
  path: string;
  pollMs: number;
  onLines: (lines: string[]) => void;
  /** The file shrank: the app restarted and truncated it. */
  onTruncate: () => void;
}

export function startTail(options: TailOptions): void {
  let offset = 0;
  let inode: number | undefined;
  // Carried as bytes, not a string, so a UTF-8 sequence split across two
  // reads is never decoded in half.
  let partial = Buffer.alloc(0);

  function poll(): void {
    let fd: number;
    try {
      fd = fs.openSync(options.path, "r");
    } catch {
      if (inode !== undefined) {
        offset = 0;
        inode = undefined;
        partial = Buffer.alloc(0);
        options.onTruncate();
      }
      return; // Not created yet.
    }

    try {
      const stats = fs.fstatSync(fd);
      if (inode !== undefined && stats.ino !== inode) {
        offset = 0;
        partial = Buffer.alloc(0);
        options.onTruncate();
      }
      inode = stats.ino;

      if (stats.size < offset) {
        offset = 0;
        partial = Buffer.alloc(0);
        options.onTruncate();
      }
      if (stats.size === offset) {
        return;
      }

      const chunk = Buffer.alloc(stats.size - offset);
      const read = fs.readSync(fd, chunk, 0, chunk.length, offset);
      offset += read;
      const buffer = Buffer.concat([partial, chunk.subarray(0, read)]);
      const lastNewline = buffer.lastIndexOf(NEWLINE);
      if (lastNewline === -1) {
        partial = buffer;
        return;
      }
      partial = Buffer.from(buffer.subarray(lastNewline + 1));
      const lines = buffer
        .toString("utf8", 0, lastNewline)
        .split("\n")
        .filter((line) => line.trim() !== "");
      if (lines.length > 0) {
        options.onLines(lines);
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  poll();
  setInterval(poll, options.pollMs);
}
