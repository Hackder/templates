import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import { Temporal } from "temporal-polyfill";
import { z } from "zod/v4";
import { getFileHash } from "./assets";
import { gzipCompress } from "./compress";
import { datastarSse, readSignalsRequired } from "./datastar";
import { DevMode, devModeApp } from "./dev-mode";
import { env } from "./env";
import { Icon } from "./web/components/icon";

export const app = new Hono();

app.use("/static/*", etag());
app.use("*", gzipCompress());
app.use("/static/*", async (context, next) => {
  await next();
  const version = context.req.query("v");
  const path = context.req.path.replace(/^\//, "");
  if (version === undefined || path.includes("..")) {
    context.header("Cache-Control", "no-cache");
  } else if (context.res.status === 200 && version === getFileHash(path)) {
    context.header("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    context.header("Cache-Control", "no-store");
  }
});
app.use("/static/*", serveStatic({ root: "./" }));
app.get("/favicon.ico", serveStatic({ path: "./static/favicon.svg" }));

function Counter({ count }: { count: number }) {
  return (
    <main
      id="counter"
      class="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6"
    >
      <div class="space-y-3">
        <p class="text-sm font-medium tracking-[0.2em] text-cyan-300 uppercase">
          Bun + Hono + Datastar
        </p>
        <h1 class="text-5xl font-semibold tracking-tight text-white">
          Count: {count}
        </h1>
        <p class="text-slate-400">
          Server-rendered JSX, updated over a Datastar event stream.
        </p>
        <p class="text-xs text-slate-600">
          Rendered at {Temporal.Now.instant().toString()}
        </p>
      </div>
      <button
        type="button"
        data-on:click="@post('/increment')"
        class="flex w-fit items-center gap-2 rounded-full bg-cyan-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
      >
        <Icon icon="plus" aria-hidden="true" />
        Increment
      </button>
    </main>
  );
}

app.get("/", (context) =>
  context.html(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#020617" />
        <title>Bun Hono Datastar</title>
        <link
          rel="icon"
          type="image/svg+xml"
          href={`/static/favicon.svg?v=${getFileHash("static/favicon.svg")}`}
        />
        <link
          rel="stylesheet"
          href={`/static/styles.css?v=${getFileHash("static/styles.css")}`}
        />
        <link rel="stylesheet" href="/static/icons-2.1.2/style.css" />
        <script
          type="module"
          src={`/static/script.js?v=${getFileHash("static/script.js")}`}
        ></script>
      </head>
      <body data-signals={JSON.stringify({ count: 0 })}>
        <Counter count={0} />
        {env.NODE_ENV === "development" && <DevMode />}
      </body>
    </html>,
  ),
);

const counterSignals = z.object({ count: z.number().int().nonnegative() });

app.post("/increment", async (context) => {
  const { count } = await readSignalsRequired(context.req, counterSignals);
  return datastarSse(context, async (sender) => {
    await sender.patchElements(<Counter count={count + 1} />);
    await sender.patchSignals({ count: count + 1 });
  });
});

if (env.NODE_ENV === "development") {
  app.route("/", devModeApp);
}

app.notFound((context) => context.text("Not found", 404));
app.onError((error, context) => {
  const status = error instanceof HTTPException ? error.status : 500;
  const message =
    error instanceof HTTPException ? error.message : "Internal server error";
  return context.text(message, status);
});
