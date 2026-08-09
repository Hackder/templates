// @ts-check
import js from "@eslint/js";
import drizzle from "eslint-plugin-drizzle";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

import noConsecutiveParametersSameType from "./eslint-rules/no-consecutive-parameters-same-type.js";
import noDirectPhosphorIcons from "./eslint-rules/no-direct-phosphor-icons.js";
import noMultiplePositionalBooleans from "./eslint-rules/no-multiple-positional-booleans.js";

export default defineConfig(
  { ignores: ["dist", "coverage", "static"] },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      sourceType: "module",
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      drizzle,
      local: {
        rules: {
          "no-consecutive-parameters-same-type":
            noConsecutiveParametersSameType,
          "no-direct-phosphor-icons": noDirectPhosphorIcons,
          "no-multiple-positional-booleans": noMultiplePositionalBooleans,
        },
      },
    },
    rules: {
      "local/no-consecutive-parameters-same-type": "error",
      "local/no-direct-phosphor-icons": "error",
      "local/no-multiple-positional-booleans": "error",
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
      "drizzle/enforce-delete-with-where": [
        "error",
        { drizzleObjectName: ["db", "tx"] },
      ],
      "drizzle/enforce-update-with-where": [
        "error",
        { drizzleObjectName: ["db", "tx"] },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "no-nested-ternary": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "all"],
      "no-param-reassign": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Use the centralized src/env.ts module instead.",
        },
        {
          object: "Bun",
          property: "env",
          message: "Use the centralized src/env.ts module instead.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta'][property.name='env']",
          message: "Use the centralized src/env.ts module instead.",
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: "Use the Temporal API instead of Date.",
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name=/^(now|parse|UTC)$/]",
          message: "Use the Temporal API instead of Date.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "bun",
              importNames: ["env"],
              message: "Use the centralized src/env.ts module instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "e2e/**/*.ts", "*.ts"],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowRegExp: false,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: "only-allowed-literals" },
      ],
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: true,
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: true },
  },
);
