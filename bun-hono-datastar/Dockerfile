# syntax=docker/dockerfile:1
FROM oven/bun:1.4.2 AS base
WORKDIR /usr/src/app

# ---- Build stage: full deps (incl. dev) + tailwind build ----
FROM base AS build
COPY package.json bun.lock ./
# Cache mount keeps bun's download cache across builds even if the layer is
# evicted by the host's builder GC, so a cache-miss reinstall stays fast.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN bun tailwind:build

# ---- Production deps only (no dev tooling) ----
FROM base AS prod-deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# ---- Release stage: minimal runtime image ----
FROM base AS release
# Native libsql validates Turso's TLS cert against the system root store, which
# the bun image lacks. Installed first (before any COPY) so it stays cached
# across source-only commits and never re-runs on a normal deploy. The apt cache
# mount keeps it fast even when the host's builder GC evicts this layer.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl

ENV NODE_ENV=production
# node_modules first (changes only when the lockfile does) so it stays cached
# across source-only commits.
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY . .
# styles.css is gitignored, so it isn't in the build context — bring the built
# file over from the build stage.
COPY --from=build /usr/src/app/static/styles.css ./static/styles.css
# The app directory is not writable by the bun user; logs go to stdout and,
# when configured, Axiom.
ENV LOG_JSON_FILE=disabled

# Only these need to be writable by the bun user; source and node_modules are
# world-readable, so no recursive chown needed.
RUN mkdir -p /usr/src/app/data /tmp/libsql \
    && chown bun:bun /usr/src/app/data /tmp/libsql

USER bun
EXPOSE 3000/tcp
HEALTHCHECK --interval=10s --timeout=5s --start-period=3s --retries=3 \
    CMD curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1
ENTRYPOINT [ "bun", "run", "src/main.ts" ]
