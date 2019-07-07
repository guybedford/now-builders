exports.isIdentifierRead = function (node, parent) {
  switch (parent.type) {
    case 'ObjectPattern':
    case 'ArrayPattern':
      // Note: default values not currently supported
      return false;
    // disregard `bar` in `bar = thing()`
    case 'AssignmentExpression':
      return parent.right === node;
    case 'MemberExpression':
      return parent.computed || node === parent.object;
    // disregard the `bar` in `{ bar: foo }`
    case 'Property':
      return node === parent.value;
    // disregard the `bar` in `class Foo { bar () {...} }`
    case 'MethodDefinition':
      return false;
    // disregard the `bar` in var bar = asdf
    case 'VariableDeclarator':
      return parent.id !== node;
    // disregard the `bar` in `export { foo as bar }`
    case 'ExportSpecifier':
      return false;
    // disregard the `bar` in `function (bar) {}`
    case 'FunctionExpression':
    case 'FunctionDeclaration':
    case 'ArrowFunctionExpression':
      return false;
    default:
      return true;
  }
}

exports.isVarLoop = function (node) {
  return node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement';
}

exports.isLoop = function (node) {
  return node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement';
}