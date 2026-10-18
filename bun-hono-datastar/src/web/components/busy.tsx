import type { PropsWithChildren } from "hono/jsx";
import { cn } from "../../utils";
import { Icon, type IconKind } from "./icon";

// The marks for work in flight. A button is busy from its click until its
// action's result is on the page: it runs the action with `busy(...).post`
// and reflects its state as `data-attr:aria-busy={busy(...).aria}`
// (src/web/post.ts, src/web/busy.ts). The `busy:` variant (src/input.css)
// styles the button and everything in it from that attribute, and the parts
// below swap to the <Spinner>.

/** Phosphor's circle-notch, turning. */
export function Spinner({ class: className }: { class?: string }) {
  return (
    <Icon
      icon="circle-notch"
      data-testid="spinner"
      aria-hidden="true"
      class={cn("animate-spin", className)}
    />
  );
}

/**
 * Whatever a busy button shows in place of the spinner, stacked with the
 * spinner in one grid cell so the button never changes width. The swap waits
 * 200 ms and fades (`animate-busy-*` in src/input.css), so a quick request
 * shows nothing. `spinning` is server state saying the work it starts is
 * running: then the spinner shows at once. Both are always rendered, so a
 * morph keeps the spinner turning from one render to the next. Size and color
 * go on `class` and are inherited.
 */
export function BusySwap({
  children,
  spinning = false,
  class: className,
}: PropsWithChildren<{
  spinning?: boolean;
  class?: string;
}>) {
  return (
    <span class={cn("inline-grid shrink-0 place-items-center", className)}>
      <span
        class={cn(
          "col-start-1 row-start-1 inline-grid place-items-center",
          spinning ? "opacity-0" : "busy:animate-busy-out",
        )}
      >
        {children}
      </span>
      <span
        class={cn(
          "col-start-1 row-start-1 inline-grid place-items-center",
          !spinning && "busy:animate-busy-in invisible opacity-0",
        )}
      >
        <Spinner />
      </span>
    </span>
  );
}

/** A button's icon that turns into the spinner while busy, see <BusySwap>. */
export function BusyIcon({
  icon,
  spinning = false,
  class: className,
}: {
  icon: IconKind;
  spinning?: boolean;
  class?: string;
}) {
  return (
    <BusySwap spinning={spinning} class={className}>
      <Icon icon={icon} />
    </BusySwap>
  );
}

/**
 * The label of a button without an icon. While the button is busy the
 * spinner takes the label's place, followed by `busyText` if given
 * ("Signing in…"), with the same 200 ms wait and fade as <BusySwap>. Both
 * share one grid cell, so the button keeps its width. The label only fades
 * out, so it stays the button's accessible name; `aria-busy` tells
 * assistive tech about the wait.
 */
export function BusyLabel({
  label,
  busyText,
}: {
  label: string;
  busyText?: string;
}) {
  return (
    <span class="inline-grid justify-items-center">
      <span class="busy:animate-busy-out col-start-1 row-start-1">{label}</span>
      <span
        aria-hidden="true"
        class="busy:animate-busy-in invisible col-start-1 row-start-1 inline-flex items-center gap-1.5 opacity-0"
      >
        <Spinner />
        {busyText}
      </span>
    </span>
  );
}
