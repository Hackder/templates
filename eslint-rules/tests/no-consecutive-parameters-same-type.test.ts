import { describe, test } from "bun:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "../rules/no-consecutive-parameters-same-type.js";

RuleTester.describe = describe;
RuleTester.it = test;

const filename = "rule-test.ts";
const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: "latest",
      projectService: { allowDefaultProject: [filename] },
      sourceType: "module",
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

ruleTester.run("no-consecutive-parameters-same-type", rule, {
  valid: [
    "function pair(left: string, right: string) {}",
    "function mixed(first: string, second: number, third: string) {}",
    "function options(input: { now: number; ttl: number }) {}",
    "function context(this: User, before: User, after: User) {}",
    "type A = string & { readonly a: unique symbol }; type B = string & { readonly b: unique symbol }; function branded(prefix: number, a: A, b: B) {}",
  ].map((code) => ({ code, filename })),
  invalid: [
    "function triple(first: string, second: string, third: string) {}",
    "function trailing(prefix: number, now: number, ttl: number) {}",
    "type A = string; type B = string; function aliases(prefix: number, a: A, b: B) {}",
    "const callback = (prefix: number, before: string, after: string) => {};",
    "interface Service { run(prefix: number, before: string, after: string): void; }",
    "class Point { constructor(id: string, x: number, y: number) {} }",
    "function defaults(prefix: string, x = 1, y = 2) {}",
  ].map((code) => ({
    code,
    filename,
    errors: [{ messageId: "sameTypeRun" }],
  })),
  assertionOptions: { requireMessage: "messageId" },
});
