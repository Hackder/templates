/**
 * @typedef {import("@oxlint/plugins").ESTree.Node} Node
 * @typedef {import("@oxlint/plugins").Visitor} Visitor
 */

/**
 * Builds a visitor that calls `report(node, source)` for every static module
 * specifier in the file: `import ... from`, `export ... from`, and dynamic
 * `import("...")` calls with a string literal argument.
 *
 * @param {(node: Node, source: string) => void} report
 * @returns {Visitor}
 */
export function forEachImportSource(report) {
  return {
    ImportDeclaration(node) {
      report(node.source, node.source.value);
    },
    ExportNamedDeclaration(node) {
      if (node.source) {
        report(node.source, node.source.value);
      }
    },
    ExportAllDeclaration(node) {
      report(node.source, node.source.value);
    },
    ImportExpression(node) {
      if (
        node.source.type === "Literal" &&
        typeof node.source.value === "string"
      ) {
        report(node.source, node.source.value);
      }
    },
  };
}
