import type { PropsWithChildren } from "hono/jsx";
import { getFileHash } from "../assets";
import { DevMode } from "../dev-mode";
import { env } from "../env";

/** The document every page shares: head, scripts and the dev overlay. */
export function Layout({
  signals,
  children,
}: PropsWithChildren<{ signals: { count: number } }>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* The browser chrome matches --background in src/input.css. */}
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#ffffff"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#0a0a0a"
        />
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
      <body data-signals={JSON.stringify(signals)}>
        {children}
        {env.NODE_ENV === "development" && <DevMode />}
      </body>
    </html>
  );
}
