import type { PropsWithChildren } from "hono/jsx";
import { getFileHash } from "../assets";
import { DevMode } from "../dev-mode";
import { env } from "../env";
import { ConnectionSlip, OPEN_UPDATES } from "./connection";

/**
 * The document head every page shares. Only what the login page needs is
 * public (see `PUBLIC_ROUTES` in ./auth): the stylesheet and the icon. The
 * scripts and the icon font are for signed-in pages.
 */
function Head({ signedIn }: { signedIn: boolean }) {
  return (
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
      {signedIn && (
        <>
          <link rel="stylesheet" href="/static/icons-2.1.2/style.css" />
          <script
            type="module"
            src={`/static/script.js?v=${getFileHash("static/script.js")}`}
          ></script>
        </>
      )}
    </head>
  );
}

/** The document of every live page; its body holds a <LivePage>. */
export function Layout({
  sessionId,
  children,
}: PropsWithChildren<{ sessionId: string }>) {
  return (
    <html lang="en">
      <Head signedIn />
      {/* The view session id is the one signal every request carries. */}
      <body data-signals={JSON.stringify({ sessionid: sessionId })}>
        {children}
        {env.NODE_ENV === "development" && <DevMode />}
      </body>
    </html>
  );
}

/** The login page: no scripts, no signals, a plain form. */
export function SignedOutLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <Head signedIn={false} />
      <body>{children}</body>
    </html>
  );
}

/**
 * The root of every live page, #app: what the /updates stream re-renders
 * and morphs. It opens the stream and carries the connection slip.
 */
export function LivePage({
  class: className,
  children,
}: PropsWithChildren<{ class: string }>) {
  return (
    <main id="app" data-init={OPEN_UPDATES} class={className}>
      {children}
      <ConnectionSlip />
    </main>
  );
}
