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
 * @returns {import("@typescript-eslint/utils").TSESTree.Parameter[] | undefined}
 */
function getParameters(node) {
  if (
    typeof node !== "object" ||
    node === null ||
    !("params" in node) ||
    !Array.isArray(node.params)
  ) {
    return undefined;
  }

  return /** @type {import("@typescript-eslint/utils").TSESTree.Parameter[]} */ (
    node.params
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow confusable runs of mutually assignable parameter types.",
    },
    schema: [],
    messages: {
      sameTypeRun:
        "Consecutive parameters have mutually assignable types in a confusable position. Use distinct domain types or an options object.",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const program = services?.program;
    const nodeMap = services?.esTreeNodeToTSNodeMap;

    if (!program || !nodeMap) {
      throw new Error(
        "no-consecutive-parameters-same-type requires type-aware parser services.",
      );
    }

    const checker = program.getTypeChecker();

    /**
     * @param {import("typescript").Type} left
     * @param {import("typescript").Type} right
     */
    function areMutuallyAssignable(left, right) {
      return (
        checker.isTypeAssignableTo(left, right) &&
        checker.isTypeAssignableTo(right, left)
      );
    }

    /**
     * @param {unknown} node
     */
    function checkParameters(node) {
      const nodeParameters = getParameters(node);
      if (!nodeParameters) return;

      const parameters = nodeParameters.filter(
        (parameter) => !isThisParameter(parameter),
      );
      const types = parameters.map((parameter) =>
        checker.getTypeAtLocation(nodeMap.get(parameter)),
      );

      let runStart = 0;
      for (let index = 1; index < parameters.length; index += 1) {
        const currentParameter = parameters[index];
        const previousType = types[index - 1];
        const currentType = types[index];
        if (!currentParameter || !previousType || !currentType) continue;

        if (!areMutuallyAssignable(previousType, currentType)) {
          runStart = index;
          continue;
        }

        const allowedRunLength = runStart === 0 ? 2 : 1;
        if (index - runStart + 1 === allowedRunLength + 1) {
          context.report({
            node: currentParameter,
            messageId: "sameTypeRun",
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      ArrowFunctionExpression: checkParameters,
      TSDeclareFunction: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
    };
  },
};

export default rule;
