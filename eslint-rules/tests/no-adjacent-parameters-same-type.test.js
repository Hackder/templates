import { describe, test } from "bun:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "../rules/no-adjacent-parameters-same-type.js";

RuleTester.describe = describe;
RuleTester.it = test;
RuleTester.itOnly = test.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

ruleTester.run("no-adjacent-parameters-same-type", rule, {
  valid: [
    "function register(username: string, age: number) {}",
    "const register = (username: string, age: number) => {};",
    "function inferred(firstName, lastName) {}",
    "function partial(firstName: string, lastName) {}",
    "function context(this: User, user: User) {}",
    "const compare = (before: User, after: User) => {};",
    "const compare = function (before: User, after: User) {};",
    "type Handler = (firstName: string, lastName: string) => void;",
    "interface Printer { print(firstName: string, lastName: string): void; }",
    "interface Callable { (firstName: string, lastName: string): void; }",
    "class Point { move(x: number, y: number) {} }",
    "class Point { constructor(public x: number, public y: number) {} }",
  ],
  invalid: [
    "function doSomething(a: boolean, b: boolean) {}",
    "function printUser(firstName: string, lastName: string) {}",
    "declare function resize(width: number, height: number): void;",
    "function defaults(firstName: string = '', lastName: string = '') {}",
    "function collect(first: string[], ...rest: string[]) {}",
    "function comments(first: User, second: /* same */ User) {}",
  ].map((code) => ({
    code,
    errors: [{ messageId: "sameType" }],
  })),
  assertionOptions: { requireMessage: "messageId" },
});
