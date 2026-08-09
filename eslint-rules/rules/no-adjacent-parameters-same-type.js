/**
 * Returns the type annotation for a parameter, unwrapping TypeScript and
 * JavaScript parameter wrappers along the way.
 * @param {import("@typescript-eslint/utils").TSESTree.Parameter} parameter
 * @returns {import("@typescript-eslint/utils").TSESTree.TypeNode | undefined}
 */
function getTypeAnnotation(parameter) {
  if (parameter.type === "TSParameterProperty") {
    return getTypeAnnotation(parameter.parameter);
  }

  if (parameter.type === "AssignmentPattern") {
    return getTypeAnnotation(parameter.left);
  }

  return parameter.typeAnnotation?.typeAnnotation;
}

/**
 * @param {import("@typescript-eslint/utils").TSESTree.Parameter} parameter
 */
function isThisParameter(parameter) {
  if (parameter.type === "TSParameterProperty") {
    return isThisParameter(parameter.parameter);
  }

  if (parameter.type === "AssignmentPattern") {
    return isThisParameter(parameter.left);
  }

  if (parameter.type === "RestElement") {
    return (
      parameter.argument.type === "Identifier" &&
      parameter.argument.name === "this"
    );
  }

  return parameter.type === "Identifier" && parameter.name === "this";
}

/**
 * @param {unknown} node
 * @returns {node is import("@typescript-eslint/utils").TSESTree.FunctionDeclaration | import("@typescript-eslint/utils").TSESTree.TSDeclareFunction}
 */
function isFunctionDeclaration(node) {
  if (typeof node !== "object" || node === null || !("type" in node)) {
    return false;
  }

  return (
    node.type === "FunctionDeclaration" || node.type === "TSDeclareFunction"
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow adjacent function parameters with the same explicit type.",
    },
    schema: [],
    messages: {
      sameType:
        "Adjacent parameters have the same type '{{type}}'. Use distinct domain types or an options object.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const sourceTokens = sourceCode.getTokens(sourceCode.ast);

    /**
     * @param {import("@typescript-eslint/utils").TSESTree.TypeNode} typeNode
     */
    function getTypeTokens(typeNode) {
      return sourceTokens.filter(
        (token) =>
          token.range[0] >= typeNode.range[0] &&
          token.range[1] <= typeNode.range[1],
      );
    }

    /**
     * @param {unknown} node
     */
    function checkParameters(node) {
      if (!isFunctionDeclaration(node)) return;

      const parameters = node.params.filter(
        (parameter) => !isThisParameter(parameter),
      );

      for (let index = 1; index < parameters.length; index += 1) {
        const previousParameter = parameters[index - 1];
        const currentParameter = parameters[index];

        if (!previousParameter || !currentParameter) continue;

        const previousType = getTypeAnnotation(previousParameter);
        const currentType = getTypeAnnotation(currentParameter);

        if (!previousType || !currentType) continue;

        const previousTokens = getTypeTokens(previousType).map(
          (token) => `${token.type}:${token.value}`,
        );
        const currentTokens = getTypeTokens(currentType).map(
          (token) => `${token.type}:${token.value}`,
        );

        if (
          previousTokens.length === currentTokens.length &&
          previousTokens.every(
            (token, tokenIndex) => token === currentTokens[tokenIndex],
          )
        ) {
          context.report({
            node: currentParameter,
            messageId: "sameType",
            data: {
              type: sourceCode.text.slice(...currentType.range),
            },
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkParameters,
      TSDeclareFunction: checkParameters,
    };
  },
};

export default rule;
