# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14 AS base
WORKDIR /app

FROM base AS build
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY src ./src
COPY static ./static
RUN bun run tailwind:build

FROM base AS prod-deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

FROM base AS release
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/static ./static
COPY package.json tsconfig.json ./
RUN mkdir -p /app/data /tmp/libsql && chown bun:bun /app/data /tmp/libsql
USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "src/main.ts"]
