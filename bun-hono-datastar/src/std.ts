export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function panic(message: string): never {
  throw new Error(message);
}

export function jsonParse(text: string): Result<unknown, SyntaxError> {
  try {
    // oxlint-disable-next-line local/no-json-parse -- This is the one place that should do this
    return ok(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError) {
      return err(e);
    } else {
      panic(`JSON.parse returned unexpected error value: ${Bun.inspect(e)}`);
    }
  }
}
