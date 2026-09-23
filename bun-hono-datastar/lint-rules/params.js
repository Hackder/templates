/**
 * Shared helpers for rules that inspect function parameters. These rules run
 * without the TypeScript type checker (Oxlint JS plugins are syntax-only), so
 * a parameter's "type" is the text of its annotation, or the type of a literal
 * default value when there is no annotation.
 */

/**
 * @typedef {import("@oxlint/plugins").ESTree.Node} Node
 * @typedef {import("@oxlint/plugins").Context} Context
 */

/**
 * @param {Node} parameter
 * @returns {boolean}
 */
export function isThisParameter(parameter) {
  if (parameter.type === "TSParameterProperty") {
    return isThisParameter(parameter.parameter);
  }
  if (parameter.type === "AssignmentPattern") {
    return isThisParameter(parameter.left);
  }
  if (parameter.type === "RestElement") {
    return isThisParameter(parameter.argument);
  }
  return parameter.type === "Identifier" && parameter.name === "this";
}

/**
 * @param {Node} parameter
 * @returns {Node | undefined}
 */
function getTypeAnnotation(parameter) {
  if (parameter.type === "TSParameterProperty") {
    return getTypeAnnotation(parameter.parameter);
  }
  if (parameter.type === "AssignmentPattern") {
    return getTypeAnnotation(parameter.left);
  }
  if (
    parameter.type === "Identifier" ||
    parameter.type === "ObjectPattern" ||
    parameter.type === "ArrayPattern" ||
    parameter.type === "RestElement"
  ) {
    return parameter.typeAnnotation?.typeAnnotation;
  }
  return undefined;
}

/**
 * @param {Node} parameter
 * @returns {Node | undefined}
 */
function getDefaultValue(parameter) {
  if (parameter.type === "TSParameterProperty") {
    return getDefaultValue(parameter.parameter);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameter.right;
  }
  return undefined;
}

/**
 * Returns a normalized textual type for the parameter, or undefined when the
 * type can only be known by inference.
 * @param {Context} context
 * @param {Node} parameter
 * @returns {string | undefined}
 */
export function getParameterType(context, parameter) {
  const annotation = getTypeAnnotation(parameter);
  if (annotation) {
    return context.sourceCode.getText(annotation).replace(/\s+/g, " ").trim();
  }

  const defaultValue = getDefaultValue(parameter);
  if (defaultValue?.type === "Literal") {
    const valueType = typeof defaultValue.value;
    if (
      valueType === "boolean" ||
      valueType === "string" ||
      valueType === "number"
    ) {
      return valueType;
    }
  }
  if (defaultValue?.type === "TemplateLiteral") {
    return "string";
  }
  return undefined;
}

/**
 * @param {string} type
 */
export function isBooleanType(type) {
  const members = type
    .split("|")
    .map((member) => member.trim().replace(/^\((.*)\)$/, "$1"))
    .filter(
      (member) => member !== "" && member !== "undefined" && member !== "null",
    );
  return (
    members.length > 0 &&
    members.every(
      (member) =>
        member === "boolean" || member === "true" || member === "false",
    )
  );
}

/**
 * @param {Context} context
 * @param {Node} node
 * @returns {{ parameter: Node, type: string | undefined }[]}
 */
export function getParameters(context, node) {
  if (!("params" in node) || !Array.isArray(node.params)) {
    return [];
  }
  return node.params
    .filter((parameter) => !isThisParameter(parameter))
    .map((parameter) => ({
      parameter,
      type: getParameterType(context, parameter),
    }));
}

export const FUNCTION_LIKE = [
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
  "TSFunctionType",
  "TSMethodSignature",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
];
