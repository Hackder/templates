# Decisions

Conscious product and architecture decisions, each with its reason. Read
before changing what they cover.

## `.env` is generated from the schema, there is no `.env.example`

On start in development, `src/main.ts` writes `.env` from the defaults
and descriptions in `src/env.ts` when the file is missing. Every
line is commented out; a small whitelist in `src/env.ts` controls which keys
would be written uncommented, and it is empty because nothing is required.

Why: a hand-maintained example file drifted from the schema and documented
variables that no longer existed. Generating it keeps the two in step, and
since every variable has a default the app runs with an all-commented file.

## Logging uses our own `src/logger/`

Owning spans (`withSpan`) collect `set()` fields and `addCounter()`
counters and log one canonical line with duration on close. Transparent
sections (`withSection`) fold their timings into the owning span. Errors
are serialized with stack and cause chain.

Why: off-the-shelf logging libraries produced unreadable output and dropped
error details.

## The app thread only serializes log records; a worker does the rest

`logger()` and the span helpers build one flat JSON record per event (trace,
span and parent span ids, no copies of ancestor fields) and queue it. Batches
go to `src/logger/worker.ts` as one string, and the worker formats console
lines, appends the NDJSON file and ships to Axiom. `beforeExit`, SIGTERM and
SIGINT flush the worker before the process ends. Tests keep a synchronous
in-memory transport.

Why: transports that format and `appendFileSync` on the request thread, once
per event and span, make a page render pay dozens of blocking writes. Logging
must never throw at the caller either; transport failures go to stderr.

## Sections are real spans; both ship to Axiom as OpenTelemetry spans

Owning spans and sections both become OTLP spans in the traces dataset,
with `span.owning` telling them apart. Events become OTLP log records in a
separate logs dataset carrying the trace and span ids; warnings and errors
are also attached to their span as span events. Error fields set the span
status to error and become `exception` span events. Ids are OpenTelemetry
sized (16 and 8 random bytes, hex) so they ship unchanged. The request span
is kind `server` with the HTTP semantic-convention field names, database
queries are kind `client`.

Why: seeing a slow request means opening its trace and reading the
waterfall of sections underneath, so a section must be a span there too.
Axiom requires one dataset per signal. The OTLP JSON is small enough to
write by hand, which keeps the OpenTelemetry SDK and its auto-instrumentation
out of the dependency tree.

## Trace origins are explicit and inherited

Entry spans (currently only the request span) explicitly set a closed
`TraceOrigin` value, which every descendant span inherits and exports as
`trace.origin`. Ordinary span fields remain local and are never inherited.
When a new kind of entry point is added (a scheduled job, a CLI command), it
gets its own `TraceOrigin` value; if it runs inside a request trace, the root
request origin remains authoritative.

Why: OpenTelemetry parent ids encode the hierarchy but Axiom cannot conveniently
group child spans by their root during aggregate queries. One low-cardinality,
strongly typed attribute makes that query direct without copying arbitrary
parent fields or making the logger infer application meaning from span names.
