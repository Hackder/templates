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
        "Disallow functions with multiple positional boolean parameters.",
    },
    schema: [],
    messages: {
      multipleBooleans:
        "Functions cannot have multiple positional boolean parameters. Use an options object.",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const program = services?.program;
    const nodeMap = services?.esTreeNodeToTSNodeMap;

    if (!program || !nodeMap) {
      throw new Error(
        "no-multiple-positional-booleans requires type-aware parser services.",
      );
    }

    const checker = program.getTypeChecker();
    const booleanType = checker.getBooleanType();

    /**
     * @param {import("@typescript-eslint/utils").TSESTree.Parameter} parameter
     */
    function isBooleanParameter(parameter) {
      const type = checker.getTypeAtLocation(nodeMap.get(parameter));
      return checker.isTypeAssignableTo(
        checker.getNonNullableType(type),
        booleanType,
      );
    }

    /**
     * @param {unknown} node
     */
    function checkParameters(node) {
      const parameters = getParameters(node);
      if (!parameters) return;

      const booleanParameters = parameters
        .filter((parameter) => !isThisParameter(parameter))
        .filter(isBooleanParameter);

      const secondBoolean = booleanParameters[1];
      if (secondBoolean) {
        context.report({
          node: secondBoolean,
          messageId: "multipleBooleans",
        });
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
