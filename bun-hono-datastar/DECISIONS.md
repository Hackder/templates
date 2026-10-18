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
- **Fat morph: every change re-renders the whole page over one `/updates`
  stream per tab, and actions answer 204**, instead of each action patching
  its own fragment: the server stays a simple f(state) with no diffing,
  every tab sees every change, and a dropped connection heals itself on the
  next render.
- **A control's spinner ends through the tab's stream**, which says its
  request id is done after the render with the action's result, and says
  it again on every reconnect: the answer and the stream travel
  separately, so only the stream knows when the change is visible. No
  timeouts or delays.
- **The password gate is opt-in, and when on it denies by default**: the
  template must run with no setup, yet an app holding anything private
  needs the gate on every route. Without `AUTH_PASSWORD_HASH` the app is
  open and production says so at startup; with it only `PUBLIC_ROUTES` skip
  the login.
