import { defineRule } from "@oxlint/plugins";

// E2E specs find elements the way a user does: by role and accessible name,
// then by label; a data-testid for repeated structure. CSS selectors by
// class, id or attribute tie a spec to markup no user sees.
const LOCATOR_METHODS = new Set(["locator", "$", "$$", "waitForSelector"]);
const CSS_SELECTOR = /[#.[]/;

/**
 * The text of a string literal or template literal argument; null for
 * anything else.
 *
 * @param {import("@oxlint/plugins").ESTree.Node | undefined} node
 * @returns {string | null}
 */
function selectorText(node) {
  if (node === undefined) {
    return null;
  }
  if (node.type === "Literal") {
    return typeof node.value === "string" ? node.value : null;
  }
  if (node.type === "TemplateLiteral") {
    return node.quasis.map((quasi) => quasi.value.raw).join("");
  }
  return null;
}

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow class, id and attribute CSS selectors in Playwright locators.",
    },
    messages: {
      noCssLocators:
        "Locate by role and accessible name (getByRole), then getByLabel; a data-testid only for repeated structure. Not by class, id or attribute selector.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          !LOCATOR_METHODS.has(callee.property.name)
        ) {
          return;
        }
        const text = selectorText(node.arguments[0]);
        if (text !== null && CSS_SELECTOR.test(text)) {
          context.report({ node, messageId: "noCssLocators" });
        }
      },
    };
  },
});
