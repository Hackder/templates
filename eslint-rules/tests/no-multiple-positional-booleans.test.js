import { describe, test } from "bun:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "../rules/no-multiple-positional-booleans.js";

RuleTester.describe = describe;
RuleTester.it = test;
RuleTester.itOnly = test.only;

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

ruleTester.run("no-multiple-positional-booleans", rule, {
  valid: [
    "function setEnabled(enabled: boolean) {}",
    "function configure(options: { wifi: boolean; vlan: boolean }) {}",
    "function context(this: boolean, enabled: boolean) {}",
    "function unrelated(enabled: boolean, retries: number) {}",
  ].map((code) => ({ code, filename })),
  invalid: [
    "function flags(wifi: boolean, vlan: boolean) {}",
    "function separated(wifi: boolean, mode: string, vlan: boolean) {}",
    "type Flag = boolean; function aliases(wifi: Flag, vlan: boolean) {}",
    "function optional(wifi?: boolean, vlan?: boolean) {}",
    "const callback = (wifi: boolean, vlan: boolean) => {};",
    "interface Service { configure(wifi: boolean, vlan: boolean): void; }",
    "class Features { constructor(public wifi: boolean, public vlan: boolean) {} }",
  ].map((code) => ({
    code,
    filename,
    errors: [{ messageId: "multipleBooleans" }],
  })),
  assertionOptions: { requireMessage: "messageId" },
});
