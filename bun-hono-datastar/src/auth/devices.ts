import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { logger } from "../logger";
import { devices as devicesTable } from "../schema";

// Device sessions: one per signed-in browser, kept until it signs out, is
// revoked from the settings page, or goes unused for DEVICE_LIFETIME. Not
// to be confused with the per-tab view sessions in src/web/session.ts.
// Only used when the password gate is on (src/auth/password.ts).
//
// This module is the only writer of the device list, with the same rules
// as src/state.ts: memory is the truth while running, every change is one
// synchronous function, database writes follow in change order on one
// queue, and listeners hear about every change. That is what makes a
// revocation immediate: the next request finds no device, and each open
// /updates stream is woken and ends itself (src/web/updates.ts).

/** A device unused this long is signed out. */
export const DEVICE_LIFETIME = Temporal.Duration.from({ hours: 90 * 24 });

/**
 * "Last seen", IP and user agent are rewritten at most this often (or when
 * the IP or browser changes), and the cookie's lifetime is renewed then.
 */
const TOUCH_EVERY = Temporal.Duration.from({ minutes: 5 });

export interface Device {
  /** Public id for the settings page; not a secret. */
  id: string;
  /** SHA-256 of the cookie's token, hex. The token itself is never stored. */
  tokenHash: string;
  createdAt: Temporal.Instant;
  lastSeenAt: Temporal.Instant;
  lastIp: string;
  userAgent: string;
}

/** Where a request came from, as recorded on its device. */
export interface Seen {
  ip: string;
  userAgent: string;
}

/** By token hash. */
const devices = new Map<string, Device>();
let database: Db | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Called after every change to the device list; returns an unsubscribe. */
export function subscribeDevices(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The device list is rendered (settings): every change re-renders. */
function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

let writeChain: Promise<void> = Promise.resolve();

function persist(write: (db: Db) => Promise<void>): void {
  const db = database;
  // main.ts loads the devices before serving whenever the gate is on, and
  // only requests through the gate change them.
  assert(db !== null, "devices are loaded before the first request");
  writeChain = writeChain.then(async () => {
    try {
      await write(db);
    } catch (error) {
      logger().error("Device write failed", { err: error });
    }
  });
}

/** Resolves once every device write queued so far has finished. */
export async function flushDeviceWrites(): Promise<void> {
  await writeChain;
}

/** Loads every device from the database; main.ts calls it once. */
export async function loadDevices(db: Db): Promise<void> {
  database = db;
  devices.clear();
  for (const row of await db.select().from(devicesTable)) {
    devices.set(row.tokenHash, {
      id: row.id,
      tokenHash: row.tokenHash,
      createdAt: Temporal.Instant.fromEpochMilliseconds(row.createdAtMs),
      lastSeenAt: Temporal.Instant.fromEpochMilliseconds(row.lastSeenAtMs),
      lastIp: row.lastIp,
      userAgent: row.userAgent,
    });
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expired(device: Device, now: Temporal.Instant): boolean {
  return (
    Temporal.Instant.compare(now, device.lastSeenAt.add(DEVICE_LIFETIME)) >= 0
  );
}

function remove(hashes: string[]): void {
  if (hashes.length === 0) {
    return;
  }
  for (const hash of hashes) {
    devices.delete(hash);
  }
  notify();
  persist(async (db) => {
    await db
      .delete(devicesTable)
      .where(inArray(devicesTable.tokenHash, hashes));
  });
}

/** The device a cookie's token belongs to, or null (unknown or expired). */
export function deviceForToken(
  token: string,
  now: Temporal.Instant,
): Device | null {
  const hash = hashToken(token);
  const device = devices.get(hash);
  if (device === undefined) {
    return null;
  }
  if (expired(device, now)) {
    remove([hash]);
    return null;
  }
  return device;
}

/** Whether the device is still signed in; open streams poll this. */
export function isSignedIn(id: string, now: Temporal.Instant): boolean {
  for (const device of devices.values()) {
    if (device.id === id) {
      return !expired(device, now);
    }
  }
  return false;
}

/** A new device and the token for its cookie (never stored). */
export interface SignedIn {
  device: Device;
  token: string;
}

/**
 * Signs a browser in, after a correct password. A browser that was signed
 * in already (a stale login form in another tab) gets a new device in place
 * of its old one, which would otherwise linger unused in the list.
 */
export function signIn(
  seen: Seen,
  now: Temporal.Instant,
  replacing: Device | null,
): SignedIn {
  const token = randomBytes(32).toString("base64url");
  const device: Device = {
    id: crypto.randomUUID(),
    tokenHash: hashToken(token),
    createdAt: now,
    lastSeenAt: now,
    lastIp: seen.ip,
    userAgent: seen.userAgent,
  };
  const replaced = replacing?.tokenHash;
  if (replaced !== undefined) {
    devices.delete(replaced);
  }
  devices.set(device.tokenHash, device);
  notify();
  persist(async (db) => {
    if (replaced !== undefined) {
      await db.delete(devicesTable).where(eq(devicesTable.tokenHash, replaced));
    }
    await db.insert(devicesTable).values({
      id: device.id,
      tokenHash: device.tokenHash,
      createdAtMs: now.epochMilliseconds,
      lastSeenAtMs: now.epochMilliseconds,
      lastIp: device.lastIp,
      userAgent: device.userAgent,
    });
  });
  return { device, token };
}

/**
 * Records a request from the device, throttled to TOUCH_EVERY. Returns true
 * when it did, which is when the cookie's lifetime should be renewed too.
 */
export function touchDevice(
  device: Device,
  seen: Seen,
  now: Temporal.Instant,
): boolean {
  const due =
    Temporal.Instant.compare(now, device.lastSeenAt.add(TOUCH_EVERY)) >= 0;
  if (
    !due &&
    seen.ip === device.lastIp &&
    seen.userAgent === device.userAgent
  ) {
    return false;
  }
  device.lastSeenAt = now;
  device.lastIp = seen.ip;
  device.userAgent = seen.userAgent;
  notify();
  const { tokenHash } = device;
  persist(async (db) => {
    await db
      .update(devicesTable)
      .set({
        lastSeenAtMs: now.epochMilliseconds,
        lastIp: seen.ip,
        userAgent: seen.userAgent,
      })
      .where(eq(devicesTable.tokenHash, tokenHash));
  });
  return true;
}

/** Signs a device out; unknown ids (a stale page) are ignored. */
export function revokeDevice(id: string): void {
  remove(
    [...devices.values()].filter((d) => d.id === id).map((d) => d.tokenHash),
  );
}

/** "Sign out everywhere else". */
export function revokeOtherDevices(keepId: string): void {
  remove(
    [...devices.values()]
      .filter((d) => d.id !== keepId)
      .map((d) => d.tokenHash),
  );
}

/** Signed-in devices, most recently used first. */
export function listDevices(now: Temporal.Instant): Device[] {
  return [...devices.values()]
    .filter((device) => !expired(device, now))
    .toSorted((a, b) => Temporal.Instant.compare(b.lastSeenAt, a.lastSeenAt));
}

/** "Safari on macOS", from a user agent string. */
export function deviceLabel(userAgent: string): string {
  return `${browserName(userAgent)} on ${osName(userAgent)}`;
}

// Order matters: Edge and Opera also say Chrome, Chrome also says Safari.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

// iPadOS 13+ reports itself as a Mac, so an iPad shows as macOS.
const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iOS"],
  [/\biPad\b/, "iPadOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function firstMatch(
  text: string,
  table: [RegExp, string][],
  fallback: string,
): string {
  return table.find(([pattern]) => pattern.test(text))?.[1] ?? fallback;
}

function browserName(userAgent: string): string {
  return firstMatch(userAgent, BROWSERS, "Unknown browser");
}

function osName(userAgent: string): string {
  return firstMatch(userAgent, SYSTEMS, "unknown system");
}
