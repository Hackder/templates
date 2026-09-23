import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import type {
  InArgs,
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { instrumentClient, summarizeSql } from "./db-instrument";
import { productionStatements } from "./db-instrument.fixtures";
import { memoryTransport, setTransports, withSpan } from "./logger";
import type { LogRecord } from "./logger";

describe("summarizeSql", () => {
  test("collapses a multi-row values list to one row", () => {
    expect(
      summarizeSql(
        'insert into "screening" ("a", "b") values (?, ?), (?, ?), (?, ?)',
      ),
    ).toBe('insert into "screening" ("a", "b") values (?)');
  });

  test("collapses rows holding defaults and nested calls, keeping the trailing clause", () => {
    const row = "(null, ?, ?, (unixepoch()))";
    expect(
      summarizeSql(
        `insert into "MovieTitle" ("id", "a", "b", "createdAt") values ${row}, ${row}, ${row} on conflict do nothing`,
      ),
    ).toBe(
      'insert into "MovieTitle" ("id", "a", "b", "createdAt") values (?) on conflict do nothing',
    );
  });

  // Statements below are copied from production traces: Drizzle writes `null`
  // instead of binding a placeholder for a null value, so rows of one chunk
  // differ in shape (here `language`), and single-row chunks differ from each
  // other (here `latitude` and `longitude`).
  const screeningColumns =
    '("id", "title", "startTime", "cinemaId", "uniqueId", "durationMinutes", "releaseYear", "videoTypes", "audioType", "language", "level", "tags", "posterUrl", "bookingUrl", "hash", "movieId", "deletedAt", "updatedAt", "createdAt")';
  const screeningUpdate =
    'on conflict ("Screening"."cinemaId", "Screening"."uniqueId") do update set "title" = excluded."title", "startTime" = excluded."startTime", "durationMinutes" = excluded."durationMinutes", "releaseYear" = excluded."releaseYear", "videoTypes" = excluded."videoTypes", "audioType" = excluded."audioType", "language" = excluded."language", "level" = excluded."level", "tags" = excluded."tags", "posterUrl" = excluded."posterUrl", "bookingUrl" = coalesce(excluded."bookingUrl", "Screening"."bookingUrl"), "hash" = excluded."hash", "movieId" = excluded."movieId", "deletedAt" = ?, "updatedAt" = ?';

  test("collapses rows whose null columns differ", () => {
    const withLanguage =
      "(null, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch()))";
    const withoutLanguage =
      "(null, ?, ?, ?, ?, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, null, ?, (unixepoch()))";
    const expected = `insert into "Screening" ${screeningColumns} values (?) ${screeningUpdate}`;
    expect(
      summarizeSql(
        `insert into "Screening" ${screeningColumns} values ${withLanguage}, ${withoutLanguage} ${screeningUpdate}`,
      ),
    ).toBe(expected);
    expect(
      summarizeSql(
        `insert into "Screening" ${screeningColumns} values ${withoutLanguage} ${screeningUpdate}`,
      ),
    ).toBe(expected);
  });

  test("gives single-row inserts the same summary whatever columns are null", () => {
    const cinemaColumns =
      '("id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude")';
    const cinemaUpdate =
      'on conflict ("Cinema"."chain", "Cinema"."country", "Cinema"."siteId") do update set "name" = excluded."name", "city" = coalesce(excluded."city", "Cinema"."city"), "timezone" = coalesce(excluded."timezone", "Cinema"."timezone"), "latitude" = coalesce(excluded."latitude", "Cinema"."latitude"), "longitude" = coalesce(excluded."longitude", "Cinema"."longitude") returning "id", "name", "city", "chain", "country", "siteId", "createdAt", "timezone", "latitude", "longitude"';
    const withCoordinates = `insert into "Cinema" ${cinemaColumns} values (null, ?, ?, ?, ?, ?, (unixepoch()), ?, ?, ?) ${cinemaUpdate}`;
    const withoutCoordinates = `insert into "Cinema" ${cinemaColumns} values (null, ?, ?, ?, ?, ?, (unixepoch()), ?, null, null) ${cinemaUpdate}`;
    expect(summarizeSql(withoutCoordinates)).toBe(
      summarizeSql(withCoordinates),
    );
    expect(summarizeSql(withCoordinates)).toBe(
      `insert into "Cinema" ${cinemaColumns} values (?) ${cinemaUpdate}`,
    );
  });

  test("leaves nulls outside a values list alone", () => {
    const sql = "select coalesce(?, null) from movie where (deletedAt is null)";
    expect(summarizeSql(sql)).toBe(sql);
  });

  test("keeps differing groups and unbalanced parens as they are", () => {
    expect(summarizeSql("select (a), (b), (a) from t")).toBe(
      "select (a), (b), (a) from t",
    );
    expect(summarizeSql("select (a), (a from t")).toBe("select (a), (a from t");
  });

  test("collapses an in-list, whatever its length", () => {
    expect(summarizeSql("select 1 where id in (?, ?, ?)")).toBe(
      summarizeSql("select 1 where id in (?)"),
    );
  });

  test("normalizes whitespace and keeps everything else", () => {
    expect(summarizeSql("select  *\n  from movie\twhere id = ?  ")).toBe(
      "select * from movie where id = ?",
    );
  });

  test("leaves bound columns and functions alone", () => {
    const sql = "select coalesce(?, title) from movie where (id = ? or x = ?)";
    expect(summarizeSql(sql)).toBe(sql);
  });

  test("collapses or-joined branches of a filter, at any depth", () => {
    const branch = '("cinemaId" = ? and "startTime" >= ? and "startTime" < ?)';
    expect(
      summarizeSql(
        `select 1 from t where ((${branch} or ${branch} or ${branch}) and ("deletedAt" is null))`,
      ),
    ).toBe(`select 1 from t where ((${branch}) and ("deletedAt" is null))`);
  });

  test("summarises every statement shape seen in production", () => {
    for (const { query, summary } of productionStatements) {
      expect(summarizeSql(query)).toBe(summary);
    }
  });
});

function resultSet(rows: number): ResultSet {
  return {
    columns: [],
    columnTypes: [],
    rows: Array.from({ length: rows }, () => ({ length: 0 })),
    rowsAffected: 0,
    lastInsertRowid: undefined,
    toJSON: () => ({}),
  };
}

function fakeTransaction(calls: string[]): Transaction {
  return {
    execute: (statement: InStatement) => {
      calls.push(`tx.execute ${JSON.stringify(statement)}`);
      return Promise.resolve(resultSet(1));
    },
    batch: (statements: InStatement[]) => {
      calls.push(`tx.batch ${statements.length}`);
      return Promise.resolve(statements.map(() => resultSet(1)));
    },
    executeMultiple: (sql: string) => {
      calls.push(`tx.executeMultiple ${sql}`);
      return Promise.resolve();
    },
    rollback: () => Promise.resolve(),
    commit: () => Promise.resolve(),
    close: () => undefined,
    closed: false,
  };
}

function fakeClient(calls: string[]) {
  return {
    execute: (statement: InStatement) => {
      calls.push(`execute ${JSON.stringify(statement)}`);
      return Promise.resolve(resultSet(2));
    },
    batch: (statements: (InStatement | [string, InArgs?])[]) => {
      calls.push(`batch ${statements.length}`);
      return Promise.resolve(statements.map(() => resultSet(3)));
    },
    migrate: (statements: InStatement[]) => {
      calls.push(`migrate ${statements.length}`);
      return Promise.resolve(statements.map(() => resultSet(0)));
    },
    executeMultiple: (sql: string) => {
      calls.push(`executeMultiple ${sql}`);
      return Promise.resolve();
    },
    transaction: (mode?: TransactionMode) => {
      calls.push(`transaction ${mode}`);
      return Promise.resolve(fakeTransaction(calls));
    },
  };
}

function capture() {
  const transport = memoryTransport();
  setTransports([transport]);
  return transport;
}

afterEach(() => {
  setTransports([]);
});

function closes(records: LogRecord[]) {
  return records.filter((r) => r.kind === "spanClose");
}

describe("instrumentClient", () => {
  test("execute: client span with text, summary, timing and counters", async () => {
    const transport = capture();
    const calls: string[] = [];
    const client = instrumentClient(fakeClient(calls));

    await withSpan("request", {}, async () => {
      await client.execute({
        sql: "select * from movie where id in (?, ?)",
        args: [1, 2],
      });
    });

    expect(calls).toEqual([
      'execute {"sql":"select * from movie where id in (?, ?)","args":[1,2]}',
    ]);
    const [query, request] = closes(transport.records);
    expect(query?.name).toBe("db-query");
    expect(query?.spanKind).toBe("client");
    expect(query?.fields).toMatchObject({
      "db.query.text": "select * from movie where id in (?, ?)",
      "db.query.summary": "select * from movie where id in (?)",
    });
    expect(query?.fields.execMs).toBeNumber();
    expect(request?.counters).toEqual({ dbQueries: 1, dbRows: 2 });
  });

  test("batch and migrate: one span per round trip, sized by statement count", async () => {
    const transport = capture();
    const calls: string[] = [];
    const client = instrumentClient(fakeClient(calls));

    await withSpan("request", {}, async () => {
      await client.batch([
        { sql: "insert into a values (?, ?)", args: [1, 2] },
        ["insert into a values (?, ?)", [3, 4]],
        "delete from a",
      ]);
      await client.migrate(["create table b (id)"]);
    });

    expect(calls).toEqual(["batch 3", "migrate 1"]);
    const [batch, migrate, request] = closes(transport.records);
    expect(batch?.name).toBe("db-batch");
    expect(batch?.fields).toMatchObject({
      "db.query.summary": "insert into a values (?); delete from a",
      "db.operation.batch.size": 3,
    });
    expect(batch?.fields["db.query.text"]).toBeUndefined();
    expect(migrate?.name).toBe("db-migrate");
    expect(migrate?.fields["db.operation.batch.size"]).toBe(1);
    expect(request?.counters).toEqual({ dbQueries: 4, dbRows: 9 });
  });

  test("executeMultiple and transaction statements are spans too", async () => {
    const transport = capture();
    const calls: string[] = [];
    const client = instrumentClient(fakeClient(calls));

    await withSpan("request", {}, async () => {
      await client.executeMultiple("pragma x; pragma y");
      const tx = await client.transaction("write");
      await tx.execute({
        sql: "update a set x = ? where id = ?",
        args: [1, 2],
      });
      await tx.batch([{ sql: "delete from a where id = ?", args: [1] }]);
      await tx.executeMultiple("pragma z");
      await tx.commit();
    });

    expect(calls).toEqual([
      "executeMultiple pragma x; pragma y",
      "transaction write",
      'tx.execute {"sql":"update a set x = ? where id = ?","args":[1,2]}',
      "tx.batch 1",
      "tx.executeMultiple pragma z",
    ]);
    expect(closes(transport.records).map((r) => r.name)).toEqual([
      "db-query",
      "db-query",
      "db-batch",
      "db-query",
      "request",
    ]);
  });

  test("execMs covers work the driver does synchronously inside the call", async () => {
    const transport = capture();
    const client = instrumentClient({
      ...fakeClient([]),
      execute: (_statement: InStatement) => {
        const until = performance.now() + 5;
        while (performance.now() < until) {
          // Busy-wait: the file: driver runs the statement before returning.
        }
        return Promise.resolve(resultSet(0));
      },
    });

    await withSpan("request", {}, async () => {
      await client.execute("select 1");
    });

    const [query] = closes(transport.records);
    expect(query?.fields.execMs).toBeGreaterThanOrEqual(5);
  });

  test("outside an owning span nothing is recorded", async () => {
    const transport = capture();
    const calls: string[] = [];
    const client = instrumentClient(fakeClient(calls));

    await client.execute("select 1");
    await client.batch(["select 1"]);

    expect(calls).toEqual(['execute "select 1"', "batch 1"]);
    expect(transport.records).toEqual([]);
  });
});

// Guards the assumption `execMs` rests on: the file: driver executes the
// statement synchronously inside `execute()`, and Drizzle reaches it without
// deferring to a later task. If a driver or Drizzle upgrade breaks either,
// execMs collapses to the microseconds the call itself takes.
test("execMs measures a real query issued through Drizzle", async () => {
  const transport = capture();
  const client = instrumentClient(createClient({ url: ":memory:" }));
  const db = drizzle({ client });

  await withSpan("request", {}, async () => {
    await db.run(sql`
      with recursive n(i) as (select 1 union all select i + 1 from n where i < 300000)
      select sum(i) from n
    `);
  });
  client.close();

  const [query] = closes(transport.records);
  expect(query?.name).toBe("db-query");
  expect(query?.fields.execMs).toBeGreaterThanOrEqual(10);
  expect(query?.fields.execMs).toBeLessThanOrEqual(query?.durationMs ?? 0);
});
