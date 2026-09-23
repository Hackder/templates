import { defineRule } from "@oxlint/plugins";

import { forEachImportSource } from "./import-sources.js";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Require importing assertions from 'node:assert/strict'.",
    },
    messages: {
      useStrict:
        "Import assertions from 'node:assert/strict' instead of '{{source}}'.",
    },
  },
  create(context) {
    return forEachImportSource((node, source) => {
      const isAssert =
        source === "assert" ||
        source === "node:assert" ||
        source.startsWith("assert/") ||
        source.startsWith("node:assert/");
      if (isAssert && source !== "node:assert/strict") {
        context.report({ node, messageId: "useStrict", data: { source } });
      }
    });
  },
});
