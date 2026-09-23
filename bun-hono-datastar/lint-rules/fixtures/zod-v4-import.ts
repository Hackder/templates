// @ts-nocheck -- fixture imports modules that intentionally do not exist
import { z as a } from "zod";
import { z as b } from "zod/v3";
export { z as c } from "zod";
const d = await import("zod");
import { z as e } from "zod/v4";
import { type ZodType } from "zod/v4/core";
import { f } from "zod-to-json-schema";
export const ok = [a, b, c, d, e, f] as ZodType[];
