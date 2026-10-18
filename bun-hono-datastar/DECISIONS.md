# Decisions

Conscious product and architecture decisions, each with its reason. Read
before changing what they cover.

## Architecture

- **`.env` is generated from the schema in `src/env.ts`, there is no
  `.env.example`**: a hand-kept example drifted from the schema and
  documented variables that no longer existed.
- **Own logger, OpenTelemetry written by hand**: off-the-shelf output was
  unreadable and dropped error details, and the SDK is heavy.
- **Logging work runs in a worker thread; the request thread only queues
  JSON records**: formatting and file writes on the request thread made a
  page render pay dozens of blocking writes.
