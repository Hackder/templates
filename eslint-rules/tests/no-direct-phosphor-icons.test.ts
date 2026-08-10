import { describe, test } from "bun:test";
import { RuleTester } from "eslint";
import rule from "../rules/no-direct-phosphor-icons.js";

RuleTester.describe = describe;
RuleTester.it = test;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-direct-phosphor-icons", rule, {
  valid: [
    'const icon = <Icon icon="plus" />;',
    'const icon = <i class="not-an-icon" />;',
    'const icon = <span class="ph-bold ph-plus" />;',
    "const icon = <i class={dynamicClass} />;",
    "const icon = <i className={getClass()} />;",
    "const icon = <i />;",
  ],
  invalid: [
    'const icon = <i class="ph-bold ph-plus" />;',
    "const icon = <i className={'ph-plus'} />;",
    "const icon = <i className={`size-4 ph-${kind}`} />;",
    "const icon = <i className={'ph-bold ' + 'ph-plus'} />;",
    "const icon = <i className={clsx('size-4', active && 'ph-plus')} />;",
    "const icon = <i className={['size-4', 'ph-plus']} />;",
    "const icon = <i className={active ? 'ph-plus' : 'ph-minus'} />;",
    "const icon = <i className={active && 'ph-plus'} />;",
  ].map((code) => ({
    code,
    errors: [{ messageId: "noDirectPhosphor" }],
  })),
  assertionOptions: { requireMessage: "messageId" },
});
