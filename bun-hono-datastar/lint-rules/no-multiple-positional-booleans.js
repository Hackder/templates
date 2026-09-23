import { defineRule } from "@oxlint/plugins";

import { FUNCTION_LIKE, getParameters, isBooleanType } from "./params.js";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow functions with multiple positional boolean parameters.",
    },
    messages: {
      multipleBooleans:
        "Functions cannot have multiple positional boolean parameters. Use an options object.",
    },
  },
  create(context) {
    /** @param {import("@oxlint/plugins").ESTree.Node} node */
    function checkParameters(node) {
      const booleanParameters = getParameters(context, node).filter(
        ({ type }) => type !== undefined && isBooleanType(type),
      );

      const secondBoolean = booleanParameters[1];
      if (secondBoolean) {
        context.report({
          node: secondBoolean.parameter,
          messageId: "multipleBooleans",
        });
      }
    }

    return Object.fromEntries(
      FUNCTION_LIKE.map((type) => [type, checkParameters]),
    );
  },
});
