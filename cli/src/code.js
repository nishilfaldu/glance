// Reads TS/JS source with the TypeScript compiler: the functions in a file, what they call, and risky constructs.
import ts from "typescript";

export const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const HTTP_ROUTE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//;
const TEST_CALLS = new Set(["it", "test"]);

function scriptKind(path) {
  if (/\.tsx$/.test(path)) return ts.ScriptKind.TSX;
  if (/\.jsx$/.test(path)) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isFunctionLike(node) {
  return node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function stringValue(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

// A unit is something a reviewer reads as one piece: a function, a method, a route handler or a test case.
function unitFor(node) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    const isDefault = (node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    return { name: `${node.name.text}()`, kind: "fn", local: node.name.text, isDefault };
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isFunctionLike(node.initializer)) {
    return { name: `${node.name.text}()`, kind: "fn", local: node.name.text };
  }
  if (ts.isMethodDeclaration(node) && node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
    const owner = ts.isClassLike(node.parent) && node.parent.name ? `${node.parent.name.text}.` : "";
    return { name: `${owner}${node.name.text}()`, kind: "fn" };
  }
  if (ts.isPropertyAssignment(node) && isFunctionLike(node.initializer)) {
    const key = stringValue(node.name);
    if (key && HTTP_ROUTE.test(key)) return { name: key, kind: "route" };
  }
  if (ts.isCallExpression(node)) {
    let callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) callee = callee.expression; // it.only, test.skip
    const title = stringValue(node.arguments[0]);
    if (ts.isIdentifier(callee) && TEST_CALLS.has(callee.text) && title && node.arguments.some(isFunctionLike)) {
      return { name: title, kind: "case" };
    }
  }
  return null;
}

export function readCode(path, text) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const units = [];
  const imports = new Map(); // local name -> { source, imported }
  const swallowed = [];      // lines of catch blocks that drop the error

  function visit(node, owner) {
    let unit = unitFor(node);
    if (unit) {
      unit = { ...unit, start: lineOf(node.getStart(sf)), end: lineOf(node.getEnd()), node, calls: new Set() };
      units.push(unit);
      owner = unit;
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const source = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, { source, imported: "default" });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          imports.set(el.name.text, { source, imported: (el.propertyName || el.name).text });
        }
      }
    }

    if (owner) {
      let callee = null;
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) callee = node.expression;
      else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) callee = node.tagName;
      if (callee && ts.isIdentifier(callee)) owner.calls.add(callee.text);
    }

    if (ts.isCatchClause(node)) {
      const body = node.block.statements;
      const swallows = body.length === 0 || (body.length === 1 && ts.isReturnStatement(body[0]) &&
        (!body[0].expression || /^(null|undefined|false|\[\]|\{\})$/.test(body[0].expression.getText(sf))));
      if (swallows) swallowed.push(lineOf(node.getStart(sf)));
    }

    ts.forEachChild(node, (child) => visit(child, owner));
  }
  visit(sf, null);

  return { units, imports, swallowed };
}

// The innermost unit that contains a line, or null for module-level code.
export function unitAt(units, line) {
  let best = null;
  for (const u of units) {
    if (u.start <= line && line <= u.end && (!best || u.end - u.start < best.end - best.start)) best = u;
  }
  return best;
}

// Package name from an import source: "jose" -> "jose", "@scope/pkg/sub" -> "@scope/pkg"; null for relative paths.
export function packageName(source) {
  if (source.startsWith(".") || source.startsWith("/")) return null;
  const parts = source.split("/");
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// Resolves a relative import to a file in the repo, or null.
export function resolveImport(fromPath, source, files) {
  if (!source.startsWith(".")) return null;
  const dir = fromPath.split("/").slice(0, -1);
  for (const part of source.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  const base = dir.join("/");
  const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  const candidates = [base];
  for (const ext of ["ts", "tsx", "mts", "js", "jsx", "mjs", "cjs"]) {
    candidates.push(`${stem}.${ext}`, `${base}/index.${ext}`);
  }
  return candidates.find((c) => files.has(c)) || null;
}
