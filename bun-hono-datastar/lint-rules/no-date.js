import { defineRule } from "@oxlint/plugins";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Disallow the legacy Date API." },
    messages: { noDate: "Use the Temporal API instead of Date." },
  },
  create(context) {
    return {
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Date") {
          context.report({ node, messageId: "noDate" });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "Date" &&
          callee.property.type === "Identifier" &&
          ["now", "parse", "UTC"].includes(callee.property.name)
        ) {
          context.report({ node, messageId: "noDate" });
        }
      },
    };
  },
});
