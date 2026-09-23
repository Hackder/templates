import { defineRule } from "@oxlint/plugins";

/**
 * Port of eslint-plugin-drizzle's enforce-delete-with-where and
 * enforce-update-with-where: `db.delete(t)` / `db.update(t).set(...)` must be
 * followed by `.where(...)` somewhere in the same call chain.
 */

/**
 * @typedef {import("@oxlint/plugins").ESTree.Node} Node
 * @typedef {import("@oxlint/plugins").ESTree.MemberExpression} MemberExpression
 */

/**
 * @param {Node} node
 * @returns {string | undefined}
 */
function getObjectName(node) {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "MemberExpression" && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (node.type === "CallExpression") {
    return getObjectName(node.callee);
  }
  return undefined;
}

/**
 * @param {MemberExpression} node
 */
function chainHasWhere(node) {
  /** @type {Node} */
  let current = node;
  while (current.parent) {
    /** @type {Node} */
    const parent = current.parent;
    if (parent.type === "CallExpression" && parent.callee === current) {
      current = parent;
    } else if (
      parent.type === "MemberExpression" &&
      parent.object === current
    ) {
      if (
        parent.property.type === "Identifier" &&
        parent.property.name === "where"
      ) {
        return true;
      }
      current = parent;
    } else {
      return false;
    }
  }
  return false;
}

/**
 * @param {"delete" | "update"} method
 */
function createRule(method) {
  return defineRule({
    meta: {
      type: "problem",
      docs: {
        description: `Enforce that \`${method}\` is used with \`where\` to avoid ${method === "delete" ? "deleting" : "updating"} all the rows in a table.`,
      },
      schema: [
        {
          type: "object",
          properties: {
            drizzleObjectName: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        enforceWhere: `Without \`.where(...)\` you will ${method} all the rows in a table. Use \`{{ name }}.${method}(...)${method === "update" ? ".set(...)" : ""}.where(...)\` instead.`,
      },
    },
    create(context) {
      const options = context.options[0];
      /** @type {string[]} */
      const drizzleObjectNames = [];
      if (
        typeof options === "object" &&
        options !== null &&
        !Array.isArray(options) &&
        Array.isArray(options.drizzleObjectName)
      ) {
        for (const name of options.drizzleObjectName) {
          if (typeof name === "string") {
            drizzleObjectNames.push(name);
          }
        }
      }

      return {
        MemberExpression(node) {
          if (
            node.property.type !== "Identifier" ||
            node.property.name !== method
          ) {
            return;
          }
          const name = getObjectName(node.object);
          const isListedName =
            name !== undefined && drizzleObjectNames.includes(name);
          const isDrizzleObject =
            drizzleObjectNames.length === 0 || isListedName;
          if (!isDrizzleObject || chainHasWhere(node)) {
            return;
          }
          context.report({
            node,
            messageId: "enforceWhere",
            data: { name: name ?? "db" },
          });
        },
      };
    },
  });
}

export const enforceDeleteWithWhere = createRule("delete");
export const enforceUpdateWithWhere = createRule("update");
