import { defineRule } from "@oxlint/plugins";

import { forEachImportSource } from "./import-sources.js";

const extensionPattern = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow file extensions on relative import specifiers (e.g. './utils.js').",
    },
    messages: {
      noExtension:
        "Import '{{source}}' without the file extension; the bundler resolves it.",
    },
  },
  create(context) {
    return forEachImportSource((node, source) => {
      if (source.startsWith(".") && extensionPattern.test(source)) {
        context.report({ node, messageId: "noExtension", data: { source } });
      }
    });
  },
});
