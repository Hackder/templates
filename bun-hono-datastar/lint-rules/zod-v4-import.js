import { defineRule } from "@oxlint/plugins";

import { forEachImportSource } from "./import-sources.js";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Require importing zod from 'zod/v4'." },
    messages: {
      useV4: "Import zod from 'zod/v4' instead of '{{source}}'.",
    },
  },
  create(context) {
    return forEachImportSource((node, source) => {
      const isZod = source === "zod" || source.startsWith("zod/");
      const isV4 = source === "zod/v4" || source.startsWith("zod/v4/");
      if (isZod && !isV4) {
        context.report({ node, messageId: "useV4", data: { source } });
      }
    });
  },
});
