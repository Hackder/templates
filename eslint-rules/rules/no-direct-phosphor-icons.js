// eslint-rules/no-direct-phosphor.js

/**
 * Checks if a string value contains a phosphor class pattern
 * @param {string} value
 */
function containsPhosphorClass(value) {
  return /\bph-(?:[a-z]|$)/.test(value);
}

/**
 * Recursively extracts string parts from a node (handles template literals,
 * string literals, clsx/cx calls, array expressions, and ternaries)
 * @param {import("eslint").Rule.Node} node
 * @returns {string[]}
 */
function extractStringValues(node) {
  if (!node) return [];

  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? [node.value] : [];

    case "TemplateLiteral":
      // Extract all the static string quasis
      return node.quasis.map((q) => q.value.cooked ?? q.value.raw);

    case "BinaryExpression":
      // Handle string concatenation: "ph-bold" + " ph-circle"
      if (node.operator === "+") {
        return [
          ...extractStringValues(node.left),
          ...extractStringValues(node.right),
        ];
      }
      return [];

    case "CallExpression": {
      // Handle clsx(...), cx(...), classnames(...) calls
      const callee = node.callee;
      const isClassUtil =
        (callee.type === "Identifier" &&
          ["clsx", "cx", "classnames", "cn"].includes(callee.name)) ||
        (callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          ["clsx", "cx", "classnames", "cn"].includes(callee.property.name));

      if (isClassUtil) {
        return node.arguments.flatMap(extractStringValues);
      }
      return [];
    }

    case "ArrayExpression":
      return node.elements.flatMap((el) => (el ? extractStringValues(el) : []));

    case "ConditionalExpression":
      // Check both branches of ternaries
      return [
        ...extractStringValues(node.consequent),
        ...extractStringValues(node.alternate),
      ];

    case "LogicalExpression":
      // Handle: condition && "ph-bold ph-circle"
      return [
        ...extractStringValues(node.left),
        ...extractStringValues(node.right),
      ];

    default:
      return [];
  }
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow direct usage of phosphor icons. Use the <Icon> wrapper component instead.",
    },
    schema: [],
    messages: {
      noDirectPhosphor:
        "Direct phosphor icon usage is not allowed. Use the <Icon> wrapper component instead.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== "i") return;

        const classAttr = node.attributes.find(
          (attr) =>
            attr.type === "JSXAttribute" &&
            (attr.name.name === "class" || attr.name.name === "className"),
        );

        if (!classAttr || !classAttr.value) return;

        const valueNode =
          classAttr.value.type === "JSXExpressionContainer"
            ? classAttr.value.expression
            : classAttr.value;

        const strings = extractStringValues(valueNode);

        if (strings.some(containsPhosphorClass)) {
          context.report({
            node,
            messageId: "noDirectPhosphor",
          });
        }
      },
    };
  },
};

export default rule;
