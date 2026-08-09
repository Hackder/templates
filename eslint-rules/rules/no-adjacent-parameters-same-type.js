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

/** @type {import("@typescript-eslint/utils").TSESLint.RuleModule<"sameType", []>} */
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

    /**
     * @param {import("@typescript-eslint/utils").TSESTree.FunctionDeclaration | import("@typescript-eslint/utils").TSESTree.TSDeclareFunction} node
     */
    function checkParameters(node) {
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

        const previousTokens = sourceCode
          .getTokens(previousType)
          .map((token) => `${token.type}:${token.value}`);
        const currentTokens = sourceCode
          .getTokens(currentType)
          .map((token) => `${token.type}:${token.value}`);

        if (
          previousTokens.length === currentTokens.length &&
          previousTokens.every(
            (token, tokenIndex) => token === currentTokens[tokenIndex],
          )
        ) {
          context.report({
            node: currentParameter,
            messageId: "sameType",
            data: { type: sourceCode.getText(currentType) },
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
