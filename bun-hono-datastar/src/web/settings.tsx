import { type Device, deviceLabel } from "../auth/devices";
import { cn } from "../utils";
import { BusyIcon, BusyLabel } from "./components/busy";
import { Icon, type IconKind } from "./components/icon";
import { LivePage } from "./layout";
import { indicator, post } from "./post";

// The settings page (/settings): the browsers signed in to this app, when
// the password gate is on. Like every page it is one function of state,
// rendered on load and again on every change over the tab's /updates
// stream, so a device signing in elsewhere shows up here at once.

/** The signed-in devices and which one is asking; null: the gate is off. */
export interface DevicesView {
  devices: Device[];
  currentDeviceId: string;
}

export function SettingsView({ gate }: { gate: DevicesView | null }) {
  return (
    <LivePage class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12 sm:py-20">
      <header class="space-y-3">
        <a
          href="/"
          class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <Icon icon="arrow-left" aria-hidden="true" />
          Counter
        </a>
        <h1 class="text-4xl font-semibold tracking-tight">Settings</h1>
      </header>
      {gate === null ? (
        <section aria-labelledby="access-title" class="space-y-2">
          <h2 id="access-title" class="text-lg font-semibold">
            Access
          </h2>
          <p class="text-muted-foreground">
            There is no password: anyone who can reach this app can use it. Set{" "}
            <code class="text-foreground font-mono text-sm">
              AUTH_PASSWORD_HASH
            </code>{" "}
            (<code class="font-mono text-sm">bun run auth:hash</code>) to put it
            behind a login.
          </p>
        </section>
      ) : (
        <Devices gate={gate} />
      )}
    </LivePage>
  );
}

const ROW_BUTTON =
  "border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors";

/** A phone or a computer, by the user agent; only for the row's icon. */
function deviceIcon(userAgent: string): IconKind {
  return /\biPhone\b|\bAndroid\b.*\bMobile\b/.test(userAgent)
    ? "device-mobile"
    : "laptop";
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "12 days ago". */
function ago(instant: Temporal.Instant, now: Temporal.Instant): string {
  const minutes = Math.floor(
    instant.until(now, { largestUnit: "minutes" }).total("minutes"),
  );
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${plural(minutes, "minute")} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${plural(hours, "hour")} ago`;
  }
  return `${plural(Math.floor(hours / 24), "day")} ago`;
}

function Devices({ gate }: { gate: DevicesView }) {
  const { devices, currentDeviceId } = gate;
  const now = Temporal.Now.instant();
  const others = devices.filter((d) => d.id !== currentDeviceId).length;
  const revokingOthers = indicator("revoke-others");
  return (
    <section id="devices" aria-labelledby="devices-title">
      <h2 id="devices-title" class="text-lg font-semibold">
        Devices
      </h2>
      <p class="text-muted-foreground mt-1 text-sm">
        The browsers signed in to this app.
      </p>
      <ul class="mt-4 divide-y border-y">
        {devices.map((device) => {
          const current = device.id === currentDeviceId;
          const pending = indicator("device", device.id);
          return (
            <li
              id={`device-${device.id}`}
              data-testid="device"
              class="flex flex-wrap items-center gap-x-3 gap-y-2 py-4"
            >
              <Icon
                icon={deviceIcon(device.userAgent)}
                class="text-muted-foreground text-xl"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1 basis-56">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="font-semibold" title={device.userAgent}>
                    {deviceLabel(device.userAgent)}
                  </span>
                  {current && (
                    <span class="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                      This device
                    </span>
                  )}
                </p>
                <p class="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-sm">
                  <span>{`Signed in ${ago(device.createdAt, now)}`}</span>
                  <span>
                    {`Last seen ${current ? "now" : ago(device.lastSeenAt, now)}`}
                  </span>
                  <span class="font-mono text-xs leading-5">
                    {device.lastIp}
                  </span>
                </p>
              </div>
              {current ? (
                <button
                  type="button"
                  class={cn(ROW_BUTTON, "gap-1.5")}
                  data-indicator={pending}
                  data-on:click={`!$${pending} && ${post("/actions/sign-out")}`}
                  data-attr:aria-busy={`$${pending} && 'true'`}
                >
                  <BusyIcon icon="sign-out" class="text-sm" />
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  class={ROW_BUTTON}
                  data-indicator={pending}
                  data-on:click={`!$${pending} && ${post("/actions/revoke-device", [["device", device.id]])}`}
                  data-attr:aria-busy={`$${pending} && 'true'`}
                >
                  <BusyLabel label="Revoke" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 && (
        <div class="flex justify-end pt-4">
          <button
            type="button"
            class={ROW_BUTTON}
            data-indicator={revokingOthers}
            data-on:click={`!$${revokingOthers} && ${post("/actions/revoke-other-devices")}`}
            data-attr:aria-busy={`$${revokingOthers} && 'true'`}
          >
            <BusyLabel label="Sign out everywhere else" />
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * What a tab shows once its device is signed out or revoked: the private
 * page is replaced at once, and the browser goes to the login form.
 */
export function SignedOutView() {
  return (
    <main
      id="app"
      data-init="window.location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search))"
      class="flex min-h-dvh items-start justify-center px-4 pt-24 sm:pt-40"
    >
      <p class="text-muted-foreground text-sm">
        Signed out.{" "}
        <a href="/login" class="text-foreground underline">
          Sign in again
        </a>
      </p>
    </main>
  );
}
