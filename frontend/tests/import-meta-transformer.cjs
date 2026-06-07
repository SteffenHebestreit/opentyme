/**
 * ts-jest AST transformer: rewrites `import.meta` to `globalThis.__IMPORT_META__`.
 *
 * The source uses Vite's `import.meta.env`. Under Jest (CommonJS), ts-jest leaves
 * `import.meta` in the emitted code, which Node rejects with
 * "Cannot use 'import.meta' outside a module". This transformer replaces the
 * `import.meta` meta-property with a reference to a global object that the test
 * setup defines (see tests/setup.ts), so `import.meta.env.DEV` etc. resolve to
 * test-safe values.
 */
const ts = require('typescript');

function factory() {
  return (ctx) => {
    const visit = (node) => {
      if (
        ts.isMetaProperty &&
        ts.isMetaProperty(node) &&
        node.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        // import.meta  ->  globalThis.__IMPORT_META__
        return ctx.factory.createPropertyAccessExpression(
          ctx.factory.createIdentifier('globalThis'),
          ctx.factory.createIdentifier('__IMPORT_META__')
        );
      }
      return ts.visitEachChild(node, visit, ctx);
    };
    return (sourceFile) => ts.visitNode(sourceFile, visit);
  };
}

module.exports = {
  name: 'import-meta-to-global',
  version: 1,
  factory,
};
