import { defineRule } from "@oxlint/plugins";

import { FUNCTION_LIKE, getParameters } from "./params.js";

/**
 * Flags runs of consecutive parameters with the same declared type, which are
 * easy to swap at the call site. Two same-typed parameters are allowed at the
 * very start of the list (`min, max`), one elsewhere.
 */
export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow confusable runs of identically typed parameters.",
    },
    messages: {
      sameTypeRun:
        "Consecutive parameters have the same type in a confusable position. Use distinct domain types or an options object.",
    },
  },
  create(context) {
    /** @param {import("@oxlint/plugins").ESTree.Node} node */
    function checkParameters(node) {
      const parameters = getParameters(context, node);

      let runStart = 0;
      for (let index = 1; index < parameters.length; index += 1) {
        const previous = parameters[index - 1];
        const current = parameters[index];
        if (!previous || !current) {
          continue;
        }

        const sameType =
          previous.type !== undefined && previous.type === current.type;
        if (!sameType) {
          runStart = index;
          continue;
        }

        const allowedRunLength = runStart === 0 ? 2 : 1;
        if (index - runStart + 1 === allowedRunLength + 1) {
          context.report({ node: current.parameter, messageId: "sameTypeRun" });
        }
      }
    }

    return Object.fromEntries(
      FUNCTION_LIKE.map((type) => [type, checkParameters]),
    );
  },
});
