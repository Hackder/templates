import { defineRule } from "@oxlint/plugins";

// Hono JSX accepts `style="color: red"` as a plain string, which the shadcn
// no-inline-styles rule does not see (React JSX has no string styles). All
// styling goes through design-token classes instead.
export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow string `style` attributes in JSX." },
    messages: {
      noStringStyle:
        "Inline style strings bypass the design tokens. Use Tailwind token classes; add a token to src/input.css if one is missing.",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") {
          return;
        }
        const value = node.value;
        if (value === null) {
          return;
        }
        const expression =
          value.type === "JSXExpressionContainer" ? value.expression : value;
        const isString =
          expression.type === "Literal" ||
          expression.type === "TemplateLiteral";
        if (isString) {
          context.report({ node, messageId: "noStringStyle" });
        }
      },
    };
  },
});
