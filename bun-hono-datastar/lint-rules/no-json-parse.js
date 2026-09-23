import { defineRule } from "@oxlint/plugins";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow JSON.parse, whether called directly or passed around as a value.",
    },
    messages: {
      noJsonParse:
        "Do not use JSON.parse. Use the jsonParse helper from src/std.ts instead, which returns a Result<unknown, SyntaxError> rather than throwing.",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const isJson =
          node.object.type === "Identifier" && node.object.name === "JSON";
        const isDotParse =
          node.property.type === "Identifier" &&
          !node.computed &&
          node.property.name === "parse";
        const isBracketParse =
          node.property.type === "Literal" && node.property.value === "parse";
        const isParse = isDotParse || isBracketParse;
        if (isJson && isParse) {
          context.report({ node, messageId: "noJsonParse" });
        }
      },
    };
  },
});
