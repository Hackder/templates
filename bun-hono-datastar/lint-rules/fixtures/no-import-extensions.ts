// @ts-nocheck -- fixture imports modules that intentionally do not exist
import { a } from "./shared.js";
import { b } from "../utils.ts";
export { c } from "./other.tsx";
export * from "./all.mjs";
const d = await import("./lazy.js");
import { e } from "./shared";
import { f } from "../utils";
import { g } from "zod/v4";
import { h } from "some-lib/dist/index.js";
export const ok = [a, b, c, d, e, f, g, h];
