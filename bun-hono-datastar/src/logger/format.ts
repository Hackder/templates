import {
  hasErrorValue,
  isSerializedError,
  type JsonFields,
  splitErrorFields,
  type JsonValue,
  type Level,
  levelOrder,
  type LogRecord,
  type SerializedError,
} from "./record";

// Human-readable console lines. Stateful: the formatter remembers open spans
// (from their `spanOpen` records) so it can print the span path of an event
// and, for warnings and errors, the fields of every enclosing span.

interface Palette {
  level: (level: Level, text: string) => string;
  dim: (text: string) => string;
  red: (text: string) => string;
  green: (text: string) => string;
}

const levelColors = {
  debug: "90",
  info: "32",
  warn: "33",
  error: "31",
} satisfies Record<Level, string>;

function createPalette(color: boolean): Palette {
  function paint(code: string, text: string): string {
    return color ? `\x1b[${code}m${text}\x1b[0m` : text;
  }
  return {
    level: (level, text) => paint(levelColors[level], text),
    dim: (text) => paint("2", text),
    red: (text) => paint("31", text),
    green: (text) => paint("32", text),
  };
}

function formatTime(time: number): string {
  const zoned = Temporal.Instant.fromEpochMilliseconds(
    Math.floor(time),
  ).toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const hh = String(zoned.hour).padStart(2, "0");
  const mm = String(zoned.minute).padStart(2, "0");
  const ss = String(zoned.second).padStart(2, "0");
  const ms = String(zoned.millisecond).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1) {
    return `${durationMs.toFixed(2)}ms`;
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatValue(value: JsonValue): string {
  return Bun.inspect(value, { depth: 4 }).replace(/\s*\n\s*/gu, " ");
}

interface FormattedFields {
  /** Space-separated `key=value` pairs; empty when there are none. */
  inline: string;
  /** One indented block per error field, each starting on a new line. */
  errorBlocks: string;
}

/**
 * Splits fields into inline `key=value` pairs and error blocks, so the
 * caller can keep every inline pair on the head line and print the stacks
 * and cause chains underneath. Errors nested in objects get a block under
 * their dotted path.
 */
function formatFields(fields: JsonFields, palette: Palette): FormattedFields {
  const { fields: plain, errors } = splitErrorFields(fields);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(plain)) {
    parts.push(`${palette.dim(`${key}=`)}${formatValue(value)}`);
  }
  let errorBlocks = "";
  for (const { key, error } of errors) {
    errorBlocks += `\n    ${palette.dim(`${key}:`)}${formatErrorBlock(error, "    ", palette)}`;
  }
  return { inline: parts.join(" "), errorBlocks };
}

function formatErrorBlock(
  error: SerializedError,
  indent: string,
  palette: Palette,
): string {
  let out = `\n${indent}${palette.red(`${error.name}: ${error.message}`)}`;

  if (error.stack !== undefined) {
    const lines = error.stack.split("\n");
    const firstIsHeader = lines[0]?.includes(error.message) ?? false;
    for (const line of firstIsHeader ? lines.slice(1) : lines) {
      out += `\n${indent}${palette.dim(line.trim())}`;
    }
  }
  for (const member of error.errors ?? []) {
    out += `\n${indent}${palette.dim("member error:")}`;
    out += formatNested(member, `${indent}  `, palette);
  }
  if (error.cause !== undefined) {
    out += `\n${indent}${palette.dim("caused by:")}`;
    out += formatNested(error.cause, `${indent}  `, palette);
  }
  return out;
}

/** A cause or member: an error block, or one line for a non-error value. */
function formatNested(
  value: JsonValue,
  indent: string,
  palette: Palette,
): string {
  if (isSerializedError(value)) {
    return formatErrorBlock(value, indent, palette);
  }
  return `\n${indent}${formatValue(value)}`;
}

interface OpenSpan {
  name: string;
  parentSpanId: string | undefined;
}

export interface ConsoleFormatterOptions {
  level: Level;
  /** ANSI colours; defaults to whether stdout is a colour terminal. */
  color?: boolean;
}

export interface ConsoleFormatter {
  /** The line for a record, or undefined when it is below the level or silent. */
  format: (record: LogRecord) => string | undefined;
}

export function createConsoleFormatter(
  options: ConsoleFormatterOptions,
): ConsoleFormatter {
  const minLevel = levelOrder[options.level];
  const palette = createPalette(options.color ?? Bun.enableANSIColors);
  const { dim } = palette;
  const openSpans = new Map<string, OpenSpan>();

  /** Enclosing spans, outermost first, starting from `spanId` itself. */
  function chain(spanId: string | undefined): OpenSpan[] {
    const spans: OpenSpan[] = [];
    for (
      let current = spanId === undefined ? undefined : openSpans.get(spanId);
      current !== undefined;
      current =
        current.parentSpanId === undefined
          ? undefined
          : openSpans.get(current.parentSpanId)
    ) {
      spans.unshift(current);
    }
    return spans;
  }

  function line(
    level: Level,
    time: number,
    path: OpenSpan[],
    message: string,
    fields: JsonFields,
  ): string {
    const levelText = palette.level(level, level.toUpperCase().padEnd(5));
    let pathText = path.map((s) => s.name).join(" › ");
    if (pathText !== "") {
      pathText = `${dim(pathText)} `;
    }
    let out = `${dim(formatTime(time))} ${levelText} ${pathText}${message}`;
    const formatted = formatFields(fields, palette);
    if (formatted.inline !== "") {
      out += `  ${formatted.inline}`;
    }
    return out + formatted.errorBlocks;
  }

  return {
    format: (record) => {
      if (record.kind === "spanOpen") {
        // Remembered for the path of what is logged inside; the close line
        // carries everything else.
        openSpans.set(record.spanId, {
          name: record.name,
          parentSpanId: record.parentSpanId,
        });
        return undefined;
      }

      if (record.kind === "spanClose") {
        openSpans.delete(record.spanId);
        if (levelOrder[record.level] < minLevel) {
          return undefined;
        }
        let mark = record.owning ? palette.green("✓") : dim("·");
        if (hasErrorValue(record.fields)) {
          mark = palette.red("✗");
        }
        const message = `${mark} ${record.name} ${dim(`(${formatDuration(record.durationMs)})`)}`;
        return line(
          record.level,
          record.time,
          chain(record.parentSpanId),
          message,
          record.fields,
        );
      }

      if (levelOrder[record.level] < minLevel) {
        return undefined;
      }
      const path = chain(record.spanId);
      let fields = record.fields;
      // Span fields are context, not the event itself; warnings and errors
      // carry a snapshot of them (including everything `set()` since the
      // spans opened), shown after the event's own fields.
      if (record.context !== undefined) {
        const inherited: JsonFields = {};
        for (const [key, value] of Object.entries(record.context)) {
          if (!(key in record.fields)) {
            inherited[key] = value;
          }
        }
        fields = { ...record.fields, ...inherited };
      }
      return line(record.level, record.time, path, record.message, fields);
    },
  };
}
