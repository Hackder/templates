import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules"] },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "module" },
    linterOptions: { reportUnusedDisableDirectives: true },
  },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      sourceType: "module",
    },
    linterOptions: { reportUnusedDisableDirectives: true },
  },
);
