import type {
  Client,
  InArgs,
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { hasOwningSpan, type SpanHandle, withSection } from "./logger";

/** Index of the `)` matching the `(` at `open`, or -1 when unbalanced. */
function closingParen(sql: string, open: number): number {
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === "(") {
      depth += 1;
    } else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

const valuesKeyword = /\bvalues $/i;

// What may join two groups of one run: rows of a VALUES list, or the
// per-item branches of a `(a) or (a) or (a)` filter.
const groupSeparators = [", ", " or "];

/**
 * `values (a), (b), (c)` -> `values (?)`: the column list already names the
 * shape of a VALUES list, so its rows carry nothing but noise for grouping —
 * the row count of a chunk, and Drizzle writing `null` or a column default
 * instead of a placeholder depending on the data. Any other run of identical
 * groups collapses to one, `(a), (a), (a)` -> `(a)` and `(a) or (a)` -> `(a)`,
 * at any nesting depth; groups that differ are left alone. Expects
 * single-space whitespace.
 */
function collapseRepeatedGroups(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const open = sql.indexOf("(", i);
    const close = open === -1 ? -1 : closingParen(sql, open);
    if (close === -1) {
      out += sql.slice(i);
      break;
    }
    const isValuesList = valuesKeyword.test(sql.slice(i, open));
    const group = isValuesList
      ? "(?)"
      : `(${collapseRepeatedGroups(sql.slice(open + 1, close))})`;
    out += sql.slice(i, open) + group;
    i = close + 1;
    for (;;) {
      const separator = groupSeparators.find((sep) =>
        sql.startsWith(`${sep}(`, i),
      );
      if (separator === undefined) {
        break;
      }
      const nextOpen = i + separator.length;
      const nextClose = closingParen(sql, nextOpen);
      if (nextClose === -1) {
        break;
      }
      const nextGroup = `(${collapseRepeatedGroups(sql.slice(nextOpen + 1, nextClose))})`;
      if (!isValuesList && nextGroup !== group) {
        break;
      }
      i = nextClose + 1;
    }
  }
  return out;
}

// `(?, ?, ?)` -> `(?)`: an `in (...)` list, whatever its length.
const placeholderList = /\(\?(?:, \?)+\)/g;

/**
 * The low-cardinality shape of a statement, for grouping in Axiom. Chunks of
 * a multi-row insert and `in (...)` filters over lists of different lengths
 * all get the same summary; `db.query.text` keeps the exact statement.
 */
export function summarizeSql(sql: string): string {
  const spaced = sql.replace(/\s+/g, " ").trim();
  return collapseRepeatedGroups(spaced).replace(placeholderList, "(?)");
}

type BatchStatement = InStatement | [string, InArgs?];

function statementSql(statement: BatchStatement): string {
  if (Array.isArray(statement)) {
    return statement[0];
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- libSQL accepts a bare SQL string
  if (typeof statement === "string") {
    return statement;
  }
  return statement.sql;
}

function statementFields(sql: string) {
  return {
    "db.query.text": sql,
    "db.query.summary": summarizeSql(sql),
  };
}

/**
 * The file: driver runs the statements synchronously inside the call and
 * returns an already-settled promise, so `execMs` measures actual execution.
 * The span's wall duration additionally includes time the continuation spent
 * queued behind other event-loop work (concurrently issued queries, streamed
 * rendering, response backpressure) — when the two disagree, trust execMs.
 */
async function timed<T>(
  section: SpanHandle,
  run: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  const resultPromise = run();
  section.set({
    execMs: performance.now() - start,
  });
  return await resultPromise;
}

type Execute = (statement: InStatement, args?: InArgs) => Promise<ResultSet>;

function instrumentExecute(execute: Execute): Execute {
  return async (statement, args) => {
    if (!hasOwningSpan()) {
      return await execute(statement, args);
    }
    return await withSection(
      "db-query",
      statementFields(statementSql(statement)),
      { kind: "client" },
      async (section) => {
        section.addCounter("dbQueries");
        const result = await timed(section, () => execute(statement, args));
        section.addCounter("dbRows", result.rows.length);
        return result;
      },
    );
  };
}

type Batch<S extends BatchStatement> = (
  statements: S[],
  mode?: TransactionMode,
) => Promise<ResultSet[]>;

/**
 * One span for the whole round trip: libSQL runs the statements itself, so
 * there is no per-statement timing to record. The distinct summaries name
 * what ran; the exact statements are left out because a batch can carry
 * hundreds of them.
 */
function instrumentBatch<S extends BatchStatement>(
  name: string,
  batch: Batch<S>,
): Batch<S> {
  return async (statements, mode) => {
    if (!hasOwningSpan()) {
      return await batch(statements, mode);
    }
    const summaries = new Set(
      statements.map((s) => summarizeSql(statementSql(s))),
    );
    return await withSection(
      name,
      {
        "db.query.summary": [...summaries].join("; "),
        "db.operation.batch.size": statements.length,
      },
      { kind: "client" },
      async (section) => {
        section.addCounter("dbQueries", statements.length);
        const results = await timed(section, () => batch(statements, mode));
        section.addCounter(
          "dbRows",
          results.reduce((count, result) => count + result.rows.length, 0),
        );
        return results;
      },
    );
  };
}

type ExecuteMultiple = (sql: string) => Promise<void>;

function instrumentExecuteMultiple(
  executeMultiple: ExecuteMultiple,
): ExecuteMultiple {
  return async (sql) => {
    if (!hasOwningSpan()) {
      return await executeMultiple(sql);
    }
    return await withSection(
      "db-query",
      statementFields(sql),
      { kind: "client" },
      async (section) => {
        section.addCounter("dbQueries");
        await timed(section, () => executeMultiple(sql));
      },
    );
  };
}

function instrumentTransaction(transaction: Transaction): Transaction {
  transaction.execute = instrumentExecute(
    transaction.execute.bind(transaction),
  );
  transaction.batch = instrumentBatch(
    "db-batch",
    transaction.batch.bind(transaction),
  );
  transaction.executeMultiple = instrumentExecuteMultiple(
    transaction.executeMultiple.bind(transaction),
  );
  return transaction;
}

// `transaction` is spelled out because libSQL's own type also carries a
// deprecated no-mode overload; the lint would flag every reference to it.
type InstrumentedMethods = Pick<
  Client,
  "execute" | "batch" | "executeMultiple" | "migrate"
> & {
  transaction: (mode?: TransactionMode) => Promise<Transaction>;
};

/**
 * Records every statement issued inside an owning span as a client span.
 * libSQL's `batch`, `migrate`, `transaction` and `executeMultiple` never go
 * through `execute` (they call the driver directly), so each is wrapped on
 * its own; statements of a transaction are wrapped on the transaction handle.
 */
export function instrumentClient<C extends InstrumentedMethods>(client: C): C {
  client.execute = instrumentExecute(client.execute.bind(client));
  client.batch = instrumentBatch("db-batch", client.batch.bind(client));
  client.migrate = instrumentBatch("db-migrate", client.migrate.bind(client));
  client.executeMultiple = instrumentExecuteMultiple(
    client.executeMultiple.bind(client),
  );
  const transaction = client.transaction.bind(client);
  // Drizzle opens transactions without a mode; "write" is libSQL's default
  // for that deprecated form.
  client.transaction = async (mode: TransactionMode = "write") =>
    instrumentTransaction(await transaction(mode));
  return client;
}
