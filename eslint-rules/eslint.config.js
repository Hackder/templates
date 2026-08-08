import js from "@eslint/js";
import { defineConfig } from "eslint/config";

export default defineConfig(
  { ignores: ["node_modules"] },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "module" },
    linterOptions: { reportUnusedDisableDirectives: true },
  },
);
