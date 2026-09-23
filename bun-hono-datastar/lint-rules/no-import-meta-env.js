import { defineRule } from "@oxlint/plugins";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Disallow reading import.meta.env directly." },
    messages: { noEnv: "Use the centralized src/env.ts module instead." },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === "MetaProperty" &&
          node.object.meta.name === "import" &&
          node.object.property.name === "meta" &&
          node.property.type === "Identifier" &&
          node.property.name === "env"
        ) {
          context.report({ node, messageId: "noEnv" });
        }
      },
    };
  },
});
