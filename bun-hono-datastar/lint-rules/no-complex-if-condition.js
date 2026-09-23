import { defineRule } from "@oxlint/plugins";

/**
 * @typedef {import("@oxlint/plugins").ESTree.Expression} Expression
 */

/**
 * `!!(a && b)` -> `a && b`, so negation and parentheses cannot hide a logical
 * expression.
 * @param {Expression} node
 * @returns {Expression}
 */
function unwrap(node) {
  if (node.type === "ParenthesizedExpression") {
    return unwrap(node.expression);
  }
  if (node.type === "UnaryExpression" && node.operator === "!") {
    return unwrap(node.argument);
  }
  return node;
}

/**
 * Whether a logical expression nests a logical expression with a different
 * operator: `a && (b || c)`, `(a && b) || c`, `a && !(b || c)`.
 * @param {Expression} node
 * @returns {boolean}
 */
function mixesOperators(node) {
  const expression = unwrap(node);
  if (expression.type !== "LogicalExpression") {
    return false;
  }
  return [expression.left, expression.right].some((operand) => {
    const inner = unwrap(operand);
    if (inner.type !== "LogicalExpression") {
      return false;
    }
    return inner.operator !== expression.operator || mixesOperators(inner);
  });
}

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow if conditions and variable initializers that mix logical operators.",
    },
    messages: {
      mixedOperators:
        "Do not mix logical operators in one expression. Name the parts in variables, e.g. `const isWithinWindow = start <= t && t < end;`, or pull a complicated check into a well-named function with early returns.",
    },
  },
  create(context) {
    return {
      IfStatement(node) {
        if (mixesOperators(node.test)) {
          context.report({ node: node.test, messageId: "mixedOperators" });
        }
      },
      VariableDeclarator(node) {
        if (node.init !== null && mixesOperators(node.init)) {
          context.report({ node: node.init, messageId: "mixedOperators" });
        }
      },
    };
  },
});
